// /api/manageSupabase.js
// ============================================================================
// SINGLE / PER-CHAPTER UPLOAD API
// - Creates/refreshes Supabase table
// - Inserts MCQ/AR/Case questions
// - Ensures RLS + SELECT policy for anon/authenticated
// - Updates usage_logs (ALWAYS update same row by table_name)
// - Updates curriculum.js in correct class repo
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

// Simple in-memory collector for neat log lines
function pushLog(logs, msg) {
  logs.push(msg);
  console.log(msg);
}

// =====================================================================
// ⭐ UNIVERSAL TABLE NAME BUILDER — SUPPORTS CBSE & ALL BOARDS
// =====================================================================
function buildTableName(meta) {
  const rawClass = meta.class_name || "11";
  
  // Logic for backward compatibility with CBSE (Numbers only)
  const isCBSE = !isNaN(rawClass);
  
  let boardSuffix = ""; 
  let classNum = rawClass;

  if (!isCBSE) {
      // Logic for 2-letter board code suffixes
      if (rawClass.includes("Telangana")) boardSuffix = "tg";
      else if (rawClass.includes("ICSE")) boardSuffix = "ic";
      else if (rawClass.includes("Karnataka")) boardSuffix = "ka";
      
      // Extract numeric part: "9Telangana" -> "9"
      const match = rawClass.match(/\d+/);
      classNum = match ? match[0] : rawClass;
  }

  const rawSubject = meta.subject || "";
  let subjectSlug = tr(rawSubject)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(" ")[0] || "subject";

  const chapterRaw = meta.chapter || "";
  let chapter = tr(chapterRaw)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();

  const words = chapter.split(" ").filter(Boolean);
  const filtered = words.filter(w => !SKIP_WORDS.includes(w));
  const first = filtered[0] || words[0] || "ch";
  const last  = filtered[filtered.length - 1] || words[words.length - 1] || "x";

  const finalClassPart = boardSuffix ? `${classNum}${boardSuffix}` : classNum;
  return `${subjectSlug}_${first}_${last}_${finalClassPart}_quiz`.replace(/[^a-z0-9_]/g, "");
}

// =====================================================================
// GITHUB HELPERS
// =====================================================================
async function fetchGithubFile({ owner, repo, path, token }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
  });

  if (!resp.ok) {
    console.error(`❌ GitHub GET failed for ${repo}/${path}:`, resp.status, await resp.text());
    return null;
  }
  return await resp.json();
}

async function updateGithubFile({ owner, repo, path, token, content, sha, message }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      sha,
      branch: "main"
    })
  });

  if (!resp.ok) {
    console.error(`❌ GitHub PUT failed for ${repo}/${path}:`, resp.status, await resp.text());
    return null;
  }
  return await resp.json();
}

function parseCurriculumJsToObject(text) {
  try {
    let clean = text
      .replace(/export\s+default\s+curriculum\s*;?/g, "")
      .replace(/export\s+const\s+curriculum\s*=\s*/, "")
      .trim();

    if (clean.endsWith(";")) clean = clean.slice(0, -1);

    return eval(`(${clean})`);
  } catch (e) {
    console.error("❌ Failed to parse curriculum.js:", e);
    return null;
  }
}

function serializeCurriculumObjectToJs(obj) {
  return `export const curriculum = ${JSON.stringify(obj, null, 2)};\nexport default curriculum;\n`;
}

// =====================================================================
// APPLY table_id TO curriculum.js
// =====================================================================
function applyTableIdToCurriculum(curriculum, meta, tableName) {
  const subjectKey   = meta.subject;
  const chapterTitle = meta.chapter;
  const subdivision  = meta.book || null;

  if (!curriculum || !subjectKey || !curriculum[subjectKey]) {
    console.warn("⚠ Subject not found in curriculum:", subjectKey);
    return false;
  }

  let updated = false;
  const subjectNode = curriculum[subjectKey];
  const match = ch => norm(ch?.chapter_title) === norm(chapterTitle);

  // CASE 1: Flat array of chapters
  if (Array.isArray(subjectNode)) {
    subjectNode.forEach(ch => {
      if (match(ch)) {
        ch.table_id = tableName;
        updated = true;
      }
    });
    return updated;
  }

  // CASE 2: Nested by book/subdivision
  const groups = subdivision ? [subdivision] : Object.keys(subjectNode);

  groups.forEach(group => {
    const arr = subjectNode[group];
    if (!Array.isArray(arr)) return;
    arr.forEach(ch => {
      if (match(ch)) {
        ch.table_id = tableName;
        updated = true;
      }
    });
  });

  return updated;
}

// =====================================================================
// UPDATE curriculum.js IN class repo (UNIVERSAL REPO MAPPING)
// =====================================================================
async function updateCurriculumForChapter(meta, tableName, logs) {
  const owner = process.env.GITHUB_OWNER;
  const token = process.env.GITHUB_TOKEN;
  const className = meta.class_name;

  if (!owner || !token) {
    console.warn("⚠ Missing GitHub credentials; skipping curriculum update.");
    pushLog(logs, "⚠ curriculum.js not updated (missing GitHub credentials)");
    return;
  }

  // Automates repo mapping: ready4exam-class-9 OR ready4exam-class-9Telangana
  const repo = `ready4exam-class-${className}`;
  const path = "js/curriculum.js";

  const file = await fetchGithubFile({ owner, repo, path, token });
  if (!file?.content || !file?.sha) {
    console.warn("⚠ Could not fetch curriculum.js from:", repo);
    pushLog(logs, `⚠ curriculum.js not updated (file not found in repo: ${repo})`);
    return;
  }

  const original = Buffer.from(file.content, "base64").toString("utf8");
  const obj = parseCurriculumJsToObject(original);
  if (!obj) {
    pushLog(logs, "⚠ curriculum.js not updated (parse failed)");
    return;
  }

  const changed = applyTableIdToCurriculum(obj, meta, tableName);
  if (!changed) {
    pushLog(logs, `⚠ curriculum.js not updated (chapter "${meta.chapter}" not found in ${repo})`);
    return;
  }

  const newText = serializeCurriculumObjectToJs(obj);

  await updateGithubFile({
    owner,
    repo,
    path,
    token,
    content: newText,
    sha: file.sha,
    message: `chore: update table_id for ${meta.chapter} → ${tableName}`
  });

  pushLog(logs, `✔ curriculum.js updated for "${meta.chapter}" in ${repo}`);
}

// =====================================================================
// MAIN HANDLER
// =====================================================================
export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok:false, error:"Only POST allowed" });
  }

  const logs = [];

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta, csv } = body || {};

    if (!meta || !csv || !Array.isArray(csv)) {
      return res.status(400).json({ ok:false, error:"Invalid payload" });
    }

    const { class_name, subject, chapter } = meta;

    pushLog(logs, `📌 Starting automation for Class ${class_name} → ${subject} → ${chapter}`);

    const supabaseUrl = process.env.SUPABASE_URL_11;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("SUPABASE_URL_11 or SUPABASE_SERVICE_KEY_11 missing");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const table = buildTableName(meta);
    pushLog(logs, `📌 Target table: ${table}`);

    const ensure = await supabase.rpc("ensure_table_exists", { table_name: table });
    if (ensure.error) {
      console.error("❌ ensure_table_exists error:", ensure.error);
      throw ensure.error;
    }
    pushLog(logs, `✔ Table created/ensured: ${table}`);

    const rls = await supabase.rpc("exec_sql", {
      sql: `
        ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;

        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 
            FROM pg_policies 
            WHERE policyname = '${table}_select_policy'
          ) THEN
            EXECUTE '
              CREATE POLICY ${table}_select_policy
              ON public.${table}
              FOR SELECT
              TO anon, authenticated
              USING (true);
            ';
          END IF;
        END $$;

        GRANT USAGE ON SCHEMA public TO anon, authenticated;
        GRANT SELECT ON public.${table} TO anon, authenticated;
      `
    });

    if (rls.error) {
      console.error("❌ RLS exec_sql error:", rls.error);
      throw rls.error;
    }
    pushLog(logs, "✔ RLS enabled + SELECT granted (anon + authenticated)");

    const cleared = await supabase.from(table).delete().neq("id", 0);
    if (cleared.error) {
      console.error("❌ Delete existing rows error:", cleared.error);
      throw cleared.error;
    }
    pushLog(logs, "✔ Existing rows cleared");

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

    const inserted = await supabase.from(table).insert(rows);
    if (inserted.error) {
      console.error("❌ Insert rows error:", inserted.error);
      throw inserted.error;
    }

    const simpleCount   = rows.filter(r => r.difficulty === "Simple").length;
    const mediumCount   = rows.filter(r => r.difficulty === "Medium").length;
    const advancedCount = rows.filter(r => r.difficulty === "Advanced").length;

    pushLog(
      logs,
      `✔ Inserted ${rows.length} questions (${simpleCount} Simple, ${mediumCount} Medium, ${advancedCount} Advanced)`
    );

    const lookup = await supabase
      .from("usage_logs")
      .select("*")
      .eq("table_name", table)
      .maybeSingle();

    if (lookup?.data) {
      const refreshCount = (lookup.data.refresh_count || 0) + 1;
      await supabase
        .from("usage_logs")
        .update({
          refresh_count: refreshCount,
          inserted_count: rows.length,
          updated_at: new Date(),
          class_name: meta.class_name || lookup.data.class_name,
          subject: meta.subject || lookup.data.subject,
          book: meta.book ?? lookup.data.book,
          chapter: meta.chapter ?? lookup.data.chapter
        })
        .eq("table_name", table);

      pushLog(logs, `✔ usage_logs updated (refresh #${refreshCount})`);
    } else {
      await supabase.from("usage_logs").insert({
        table_name: table,
        class_name: meta.class_name,
        subject: meta.subject,
        book: meta.book || "",
        chapter: meta.chapter || "",
        inserted_count: rows.length,
        refresh_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      });

      pushLog(logs, "✔ usage_logs row created");
    }

    await updateCurriculumForChapter(meta, table, logs);

    pushLog(logs, "📌 Upload completed successfully — chapter is live in Quiz Engine.");

    res.status(200).json({
      ok: true,
      table_name: table,
      inserted: rows.length,
      message: "Upload complete.",
      logs
    });

  } catch (err) {
    console.error("❌ manageSupabase ERROR:", err);
    pushLog(logs, `❌ ERROR: ${err.message}`);

    res.status(500).json({
      ok: false,
      error: err.message,
      logs
    });
  }
}
