// /api/manageSupabase.js
// ============================================================================
// SINGLE / PER-CHAPTER UPLOAD API — FINAL PRODUCTION VERSION
// FIXES:
// - Handles Supabase schema cache race safely
// - Skips delete on freshly created tables
// - Stable for bulk + multi-board automation
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";
import { transliterate as tr } from "transliteration";

export const config = { runtime: "nodejs" };

// =====================================================================
// Helpers
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

function pushLog(logs, msg) {
  logs.push(msg);
  console.log(msg);
}

// =====================================================================
// UNIVERSAL TABLE NAME BUILDER
// =====================================================================
function buildTableName(meta) {
  const rawClass = meta.class_name || "11";
  const isCBSE = !isNaN(rawClass);

  let boardSuffix = "";
  let classNum = rawClass;

  if (!isCBSE) {
    if (rawClass.includes("Telangana")) boardSuffix = "tg";
    else if (rawClass.includes("ICSE")) boardSuffix = "ic";
    else if (rawClass.includes("Karnataka")) boardSuffix = "ka";

    const match = rawClass.match(/\d+/);
    classNum = match ? match[0] : rawClass;
  }

  const subjectSlug = tr(meta.subject || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(" ")[0] || "subject";

  const chapter = tr(meta.chapter || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();

  const words = chapter.split(" ").filter(Boolean);
  const filtered = words.filter(w => !SKIP_WORDS.includes(w));
  const first = filtered[0] || words[0] || "ch";
  const last  = filtered[filtered.length - 1] || words[words.length - 1] || "x";

  const finalClass = boardSuffix ? `${classNum}${boardSuffix}` : classNum;

  return `${subjectSlug}_${first}_${last}_${finalClass}_quiz`
    .replace(/[^a-z0-9_]/g, "");
}

// =====================================================================
// CURRICULUM HELPERS
// =====================================================================
function parseCurriculumJsToObject(text) {
  try {
    let clean = text
      .replace(/export\s+default\s+curriculum\s*;?/g, "")
      .replace(/export\s+const\s+curriculum\s*=\s*/, "")
      .trim();

    if (clean.endsWith(";")) clean = clean.slice(0, -1);
    return eval(`(${clean})`);
  } catch {
    return null;
  }
}

function serializeCurriculumObjectToJs(obj) {
  return `export const curriculum = ${JSON.stringify(obj, null, 2)};\nexport default curriculum;\n`;
}

function applyTableIdToCurriculum(curriculum, meta, tableName) {
  const subjectKey = meta.subject;
  const chapterTitle = meta.chapter;
  const subdivision = meta.book || null;

  if (!curriculum || !curriculum[subjectKey]) return false;

  let updated = false;
  const match = ch => norm(ch.chapter_title) === norm(chapterTitle);

  const node = curriculum[subjectKey];

  if (Array.isArray(node)) {
    node.forEach(ch => {
      if (match(ch)) {
        ch.table_id = tableName;
        updated = true;
      }
    });
    return updated;
  }

  const groups = subdivision ? [subdivision] : Object.keys(node);
  groups.forEach(g => {
    const arr = node[g];
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
// UPDATE curriculum.js IN CLASS REPO
// =====================================================================
async function updateCurriculumForChapter(meta, tableName, logs) {
  const owner = process.env.GITHUB_OWNER;
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !token) return;

  const repo = `ready4exam-class-${meta.class_name}`;
  const path = "js/curriculum.js";

  const fileRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!fileRes.ok) return;

  const file = await fileRes.json();
  const original = Buffer.from(file.content, "base64").toString("utf8");
  const obj = parseCurriculumJsToObject(original);
  if (!obj) return;

  if (!applyTableIdToCurriculum(obj, meta, tableName)) return;

  const updated = serializeCurriculumObjectToJs(obj);

  await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `chore: update table_id for ${meta.chapter}`,
      content: Buffer.from(updated).toString("base64"),
      sha: file.sha,
      branch: "main"
    })
  });

  pushLog(logs, `✔ curriculum.js updated`);
}

// =====================================================================
// MAIN HANDLER
// =====================================================================
export default async function handler(req, res) {
  Object.entries(getCorsHeaders(req.headers.origin || "*"))
    .forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "POST only" });

  const logs = [];

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta, csv } = body || {};
    if (!meta || !Array.isArray(csv))
      return res.status(400).json({ ok: false, error: "Invalid payload" });

    pushLog(logs, `📌 Starting automation for Class ${meta.class_name} → ${meta.subject} → ${meta.chapter}`);

    const supabase = createClient(
      process.env.SUPABASE_URL_11,
      process.env.SUPABASE_SERVICE_KEY_11
    );

    const table = buildTableName(meta);
    pushLog(logs, `📌 Target table: ${table}`);

    // 1. Ensure table exists
    const ensure = await supabase.rpc("ensure_table_exists", { table_name: table });
    if (ensure.error) throw ensure.error;
    pushLog(logs, `✔ Table created/ensured: ${table}`);

    // 2. RLS
    await supabase.rpc("exec_sql", {
      sql: `
        ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
        GRANT USAGE ON SCHEMA public TO anon, authenticated;
        GRANT SELECT ON public.${table} TO anon, authenticated;
      `
    });
    pushLog(logs, `✔ RLS enabled`);

    // 3. SAFE DELETE (SCHEMA CACHE FIX)
    const cleared = await supabase.from(table).delete().neq("id", 0);

    if (cleared.error) {
      if (cleared.error.code === "PGRST205") {
        pushLog(logs, `⚠ Fresh table, skipping delete`);
      } else {
        throw cleared.error;
      }
    } else {
      pushLog(logs, `✔ Existing rows cleared`);
    }

    // 4. INSERT
    const rows = csv.map(r => ({
      difficulty: normalizeDifficulty(r.difficulty),
      question_type: normalizeQType(r.question_type),
      question_text: (r.question_text || "").trim(),
      scenario_reason_text: (r.scenario_reason_text || "").trim(),
      option_a: (r.option_a || "").trim(),
      option_b: (r.option_b || "").trim(),
      option_c: (r.option_c || "").trim(),
      option_d: (r.option_d || "").trim(),
      correct_answer_key: (r.correct_answer_key || "").toUpperCase()
    }));

    if (rows.length > 0) {
      const ins = await supabase.from(table).insert(rows);
      if (ins.error) throw ins.error;
      pushLog(logs, `✔ Inserted ${rows.length} questions`);
    }

    await updateCurriculumForChapter(meta, table, logs);

    res.status(200).json({
      ok: true,
      table_name: table,
      inserted: rows.length,
      logs
    });

  } catch (err) {
    pushLog(logs, `❌ ERROR: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message, logs });
  }
}
