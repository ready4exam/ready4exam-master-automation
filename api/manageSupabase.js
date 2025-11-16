import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

function normalizeDifficulty(d) {
  if (!d) return "Simple";
  d = d.toString().toLowerCase().trim();
  if (["simple", "easy"].includes(d)) return "Simple";
  if (["medium", "moderate"].includes(d)) return "Medium";
  if (["advanced", "hard"].includes(d)) return "Advanced";
  return "Simple";
}

function normalizeQType(t) {
  if (!t) return "MCQ";
  t = t.toString().toLowerCase().trim();
  if (["mcq", "objective", "multiple choice"].includes(t)) return "MCQ";
  if (["ar", "assertion-reason", "assertion"].includes(t)) return "AR";
  if (["case", "case-based", "case study"].includes(t)) return "Case-Based";
  return "MCQ";
}

// Build table slug from subject+chapter
function buildTableName(meta) {
  const subjPart = (meta.subject || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const chapPart = (meta.chapter || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const parts = [];
  if (subjPart) parts.push(subjPart);
  if (chapPart) parts.push(chapPart);
  if (!parts.length) return "quiz_table";
  return `${parts.join("_")}_quiz`;
}

export default async function handler(req, res) {
  // ---- CORS must run inside handler ----
  const origin = req.headers.origin || "*";
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method.toUpperCase() === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method.toUpperCase() !== "POST") {
    res.status(405).json({ ok: false, error: "Only POST allowed" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta, csv } = body || {};
    if (!meta || !csv || !Array.isArray(csv)) {
      res.status(400).json({ ok: false, error: "Missing meta or csv (array) in request body." });
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL_11 || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11 || process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      res.status(500).json({ ok: false, error: "Supabase credentials missing on server." });
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Decide table name:
    let table = meta.table_id && isNaN(Number(meta.table_id))
      ? meta.table_id
      : buildTableName(meta);

    // Ensure table exists — requires RPC `ensure_table_exists`
    const rpcRes = await supabase.rpc("ensure_table_exists", { table_name: table });
    if (rpcRes.error) throw rpcRes.error;

    // Overwrite: delete all existing rows
    await supabase.from(table).delete().neq("id", 0);

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

    res.status(200).json({
      ok: true,
      message: "Table updated successfully.",
      new_table_id: table,
      inserted: (data || rows).length
    });

  } catch (err) {
    console.error("❌ manageSupabase error:", err);
    res.status(500).json({ ok: false, error: err.message || "Internal error" });
  }
}
