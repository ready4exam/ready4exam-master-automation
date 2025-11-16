// /api/manageSupabase.js
import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

// Normalize DB fields
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

// ⭐ Final Table Naming: first + last word ONLY
// If single word: <word>_quiz
function buildTableName(meta) {
  let chapter = (meta.chapter || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();

  const words = chapter.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "quiz_table";

  const first = words[0];
  const last = words.length > 1 ? words[words.length - 1] : first;

  return `${first}_${last}_quiz`
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta, csv } = body || {};
    if (!meta || !csv || !Array.isArray(csv)) {
      return res.status(400).json({ ok: false, error: "Missing meta/csv array." });
    }

    const supabaseUrl = process.env.SUPABASE_URL_11 || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11 || process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ ok: false, error: "Supabase config missing." });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 🎯 Final decision — always chapter-based table name
    const table = buildTableName(meta);

    // Ensure table exists via RPC
    const rpcRes = await supabase.rpc("ensure_table_exists", { table_name: table });
    if (rpcRes.error) throw rpcRes.error;

    // Clear existing records
    await supabase.from(table).delete().neq("id", 0);

    // Insert clean normalized rows
    const rows = csv.map((row) => ({
      difficulty: normalizeDifficulty(row.difficulty),
      question_type: normalizeQType(row.question_type),
      question_text: (row.question_text || "").trim(),
      scenario_reason_text: (row.scenario_reason_text || "").trim(),
      option_a: (row.option_a || "").trim(),
      option_b: (row.option_b || "").trim(),
      option_c: (row.option_c || "").trim(),
      option_d: (row.option_d || "").trim(),
      correct_answer_key: (row.correct_answer_key || "").trim().toUpperCase()
    }));

    const { data, error } = await supabase.from(table).insert(rows);
    if (error) throw error;

    return res.status(200).json({
      ok: true,
      message: "Table updated successfully.",
      new_table_id: table,
      inserted: data?.length || rows.length
    });

  } catch (err) {
    console.error("❌ manageSupabase error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Server error" });
  }
}
