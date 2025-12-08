// /api/manageSupabase.js
// ============================================================================
//  SINGLE / PER-CHAPTER UPLOAD API  (FINAL STABLE VERSION)
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";
import { transliterate as tr } from "transliteration";

export const config = { runtime: "nodejs" };

// =====================================================================
// Helpers: Normalizers
// =====================================================================
function normalizeDifficulty(d) {
  if (!d) return "Simple";
  d = d.toLowerCase().trim();
  if (["simple", "easy"].includes(d)) return "Simple";
  if (["medium", "moderate"].includes(d)) return "Medium";
  if (["advanced", "hard"].includes(d)) return "Advanced";
  return "Simple";
}

function normalizeQType(t) {
  if (!t) return "MCQ";
  t = t.toLowerCase().trim();
  if (["mcq", "multiple choice", "objective"].includes(t)) return "MCQ";
  if (["ar", "assertion", "assertion-reason"].includes(t)) return "AR";
  if (["case", "case-based", "case study"].includes(t)) return "Case-Based";
  return "MCQ";
}

const SKIP_WORDS = ["as","of","the","a","an","in","on","for","to","ki","ke","ka"];
const norm = s => (s ?? "").toString().trim().toLowerCase();

// =====================================================================
// Table Name Builder
// =====================================================================
function buildTableName(meta) {
  const grade = meta.class_name || "11";

  const rawSubject = meta.subject || "";
  let subjectSlug = tr(rawSubject)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  subjectSlug = (subjectSlug.split(" ")[0]) || "subject";

  const chapterRaw = meta.chapter || "";
  let chapter = tr(chapterRaw)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = chapter.split(" ").filter(Boolean);
  const filtered = words.filter(w => !SKIP_WORDS.includes(w));

  const first = filtered[0] || words[0] || "ch";
  const last  = filtered[filtered.length - 1] || words[words.length - 1] || "x";

  return `${subjectSlug}_${first}_${last}_${grade}_quiz`;
}

// =====================================================================
// GitHub API Helpers
// =====================================================================
async function fetchGithubFile({ owner, repo, path, token }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json"
    }
  });

  if (!resp.ok) {
    console.error(`❌ GitHub GET failed for ${repo}/${path}:`, resp.status, await resp.text());
    return null;
  }

  return await resp.json();
}

async function updateGithubFile({ owner, repo, path, token, content, sha, message }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    sha,
    branch: "main"
  };

  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    console.error(`❌ GitHub PUT failed:`, resp.status, await resp.text());
    return null;
  }

  return await resp.json();
}

// =====================================================================
// Curriculum Parser — FINAL FIXED VERSION
// =====================================================================
function parseCurriculumJsToObject(fileText) {
  try {
    let src = fileText.trim();

    // Remove "export default ..."
    src = src.replace(/^export\s+default\s+/, "");

    // Remove "export const curriculum = ..."
    src = src.replace(/^export\s+const\s+curriculum\s*=\s*/, "");

    // Remove "export default curriculum;"
    src = src.replace(/export\s+default\s+curriculum\s*;?/g, "");

    // Remove "export { curriculum };"
    src = src.replace(/export\s*\{\s*curriculum\s*\}\s*;?/g, "");

    // Remove ending semicolon
    src = src.replace(/;?\s*$/, "");

    const wrapped = `(${src})`;
    return eval(wrapped);
  } catch (err) {
    console.error("❌ Failed to parse curriculum.js:", err);
    return null;
  }
}

// Serializer
function serializeCurriculumObjectToJs(obj) {
  return `export const curriculum = ${JSON.stringify(obj, null, 2)};\nexport default curriculum;\n`;
}

// =====================================================================
// Curriculum Updater (with subdivision fallback)
// =====================================================================
function applyTableIdToCurriculum(curriculum, meta, tableName) {
  const subjectKey = meta.subject;
  const chapterTitle = meta.chapter;
  const subdivision = meta.book;

  if (!curriculum[subjectKey]) {
    console.warn("⚠ Subject not found:", subjectKey);
    return false;
  }

  const subjectNode = curriculum[subjectKey];
  let updated = false;

  const match = ch => norm(ch.chapter_title) === norm(chapterTitle);

  // CASE 1: subject is a flat array
  if (Array.isArray(subjectNode)) {
    subjectNode.forEach(ch => {
      if (match(ch)) {
        ch.table_id = tableName;
        updated = true;
      }
    });
    return updated;
  }

  // CASE 2: subject contains groups (Physics, Chemistry…)
  const groups = Object.keys(subjectNode);
  let groupsToSearch = [];

  if (subdivision && subjectNode[subdivision]) {
    groupsToSearch = [subdivision];
  } else {
    console.warn("⚠ subdivision not found → searching all groups");
    groupsToSearch = groups;
  }

  for (const group of groupsToSearch) {
    const list = subjectNode[group];
    if (!Array.isArray(list)) continue;

    list.forEach(ch => {
      if (match(ch)) {
        ch.table_id = tableName;
        updated = true;
      }
    });
  }

  return updated;
}

// =====================================================================
// High-Level GitHub Updater
// =====================================================================
async function updateCurriculumForChapter(meta, tableName) {
  const owner = process.env.GITHUB_OWNER;
  const token = process.env.GITHUB_TOKEN;
  const className = meta.class_name;

  if (!owner || !token) {
    console.warn("⚠ Missing GitHub credentials; skipping curriculum update.");
    return;
  }

  const repo = `ready4exam-class-${className}`;
  const path = "js/curriculum.js";

  const file = await fetchGithubFile({ owner, repo, path, token });
  if (!file?.content) {
    console.warn("⚠ Could not fetch curriculum.js");
    return;
  }

  const text = Buffer.from(file.content, "base64").toString("utf8");
  const curriculumObj = parseCurriculumJsToObject(text);
  if (!curriculumObj) return;

  const changed = applyTableIdToCurriculum(curriculumObj, meta, tableName);
  if (!changed) {
    console.warn("⚠ No chapter updated for:", meta.chapter);
    return;
  }

  const newText = serializeCurriculumObjectToJs(curriculumObj);

  await updateGithubFile({
    owner,
    repo,
    path,
    token,
    content: newText,
    sha: file.sha,
    message: `update table_id for "${meta.chapter}" (${tableName})`
  });
}

// =====================================================================
// MAIN HANDLER
// =====================================================================
export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) =>
    res.setHeader(k, v)
  );

  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const data =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const { meta, csv } = data;

    if (!meta || !csv)
      return res.status(400).json({ ok: false, error: "Missing meta or CSV" });

    const supabaseUrl =
      process.env.SUPABASE_URL_11 || process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_KEY_11 || process.env.SUPABASE_SERVICE_KEY;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const tableName = buildTableName(meta);

    await supabase.rpc("ensure_table_exists", {
      table_name: tableName
    });

    await supabase.rpc("exec_sql", {
      sql: `
        ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;
        GRANT SELECT ON public.${tableName} TO anon, authenticated;
      `
    });

    await supabase.from(tableName).delete().neq("id", 0);

    const rows = csv.map(r => ({
      difficulty: normalizeDifficulty(r.difficulty),
      question_type: normalizeQType(r.question_type),
      question_text: (r.question_text || "").trim(),
      scenario_reason_text: (r.scenario_reason_text || "").trim(),
      option_a: (r.option_a || "").trim(),
      option_b: (r.option_b || "").trim(),
      option_c: (r.option_c || "").trim(),
      option_d: (r.option_d || "").trim(),
      correct_answer_key: (r.correct_answer_key || "").trim().toUpperCase()
    }));

    await supabase.from(tableName).insert(rows);

    await updateCurriculumForChapter(meta, tableName);

    res.status(200).json({
      ok: true,
      message: "Uploaded + curriculum updated",
      table_name: tableName
    });
  } catch (err) {
    console.error("❌ manageSupabase ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
