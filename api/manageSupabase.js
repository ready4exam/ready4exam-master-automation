// /api/manageSupabase.js
// -------------------------------------------------------------
// Phase-3 Final Version
// • Normalize difficulty & question_type
// • Normalize table name (first + last + "_quiz")
// • Truncate old rows → insert new rows
// • Uses Supabase_11 service key
// • Full CORS
// -------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./corsHandler.js";

export const config = { runtime: "nodejs" };

// -------------------------------------------------------------
// HELPERS
// -------------------------------------------------------------

// Normalize difficulty → TitleCase
function normalizeDifficulty(d) {
  if (!d) return "Simple";
  d = d.toLowerCase().trim();
  if (["simple", "easy"].includes(d)) return "Simple";
  if (["medium", "moderate"].includes(d)) return "Medium";
  if (["advanced", "hard"].includes(d)) return "Advanced";
  return "Simple";
}

// Normalize question types
function normalizeQType(t) {
  if (!t) return "MCQ";
  t = t.toLowerCase().trim();

  if (["mcq", "objective", "multiple choice"].includes(t)) return "MCQ";
  if (["ar", "assertion-reason", "assertion"].includes(t)) return "AR";
  if (["case", "case-based", "case study"].includes(t)) return "Case-Based";

  return "MCQ";
}

// Convert "Sets" → "sets_quiz"
// Convert "Complex Numbers and Quadratic Equations" → "complex_equations_quiz"
function buildTableName(chapter) {
  const slug = chapter
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/);

  if (slug.length === 1) return `${slug[0]}_quiz`;

  const first = slug[0];
  const last = slug[slug.length - 1];

  return `${first}_${last}_quiz`;
}

// -------------------------------------------------------------
// MAIN HANDLER
// -------------------------------------------------------------
export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = {
    ...getCorsHeaders(origin),
    "Content-Type": "application/json"
  };

  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, v);
  }

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const { meta, csv } = req.body;
    if (!meta || !csv)
      return res.status(400).json({ ok: false, error: "Missing meta or csv data" });

    const chapter = meta.chapter;
    const table = buildTableName(chapter);

    // -------------------------------------------------------------
    // Supabase Connection (Class 11 unified DB)
    // -------------------------------------------------------------
    const supabase = createClient(
      process.env.SUPABASE_URL_11,
      process.env.SUPABASE_SERVICE_KEY_11
    );

    if (!supabase) throw new Error("Supabase init failed.");

    // -------------------------------------------------------------
    // Ensure table exists (id = PK, auto-increment)
    // -------------------------------------------------------------
    await supabase.rpc("ensure_table_exists", { table_name: table });

    // -------------------------------------------------------------
    // DELETE EXISTING ROWS
    // -------------------------------------------------------------
    await supabase.from(table).delete().neq("id", 0);

    // -------------------------------------------------------------
    // INSERT NEW ROWS
    // -------------------------------------------------------------
    const rows = csv.map((row) => ({
      difficulty: normalizeDifficulty(row.difficulty),
      question_type: normalizeQType(row.question_type),
      question_text: row.question_text?.trim() || "",
      scenario_reason_text: row.scenario_reason_text?.trim() || "",
      option_a: row.option_a || "",
      option_b: row.option_b || "",
      option_c: row.option_c || "",
      option_d: row.option_d || "",
      correct_answer_key: (row.correct_answer_key || "").trim().toUpperCase(),
    }));

    const { error } = await supabase.from(table).insert(rows);

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      message: "Table updated successfully.",
      table,
      inserted: rows.length
    });

  } catch (err) {
    console.error("❌ manageSupabase error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Internal error"
    });
  }
}
