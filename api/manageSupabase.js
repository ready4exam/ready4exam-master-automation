import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";
// ---- CORS preflight handling ----
const origin = req.headers.origin || "*";
const headers = getCorsHeaders(origin);
Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

if (req.method === "OPTIONS") {
  return res.status(200).end();
}

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
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta, csv } = body || {};
    if (!meta || !csv || !Array.isArray(csv)) {
      return res.status(400).json({ ok: false, error: "Missing meta or csv (array) in request body." });
    }

    const supabaseUrl = process.env.SUPABASE_URL_11 || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11 || process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ ok: false, error: "Supabase credentials missing on server." });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Decide table name:
    // - If meta.table_id is non-empty and NON-numeric, reuse
    // - Else generate from subject+chapter
    let table = null;
    const incoming = meta.table_id;
    if (incoming && isNaN(Number(incoming))) {
      table = incoming;
    } else {
      table = buildTableName(meta);
    }

    // Ensure table exists via RPC ensure_table_exists
    try {
      const rpcRes = await supabase.rpc("ensure_table_exists", { table_name: table });
      if (rpcRes.error) throw rpcRes.error;
    } catch (rpcErr) {
      console.error("RPC ensure_table_exists failed:", rpcErr);
      return res.status(500).json({
        ok: false,
        error: "Supabase RPC 'ensure_table_exists' failed or missing.",
        detail: rpcErr.message || rpcErr
      });
    }

    // Overwrite: delete all existing rows
    try {
      const delRes = await supabase.from(table).delete().neq("id", 0);
      if (delRes.error) console.warn("Non-fatal delete error:", delRes.error);
    } catch (delErr) {
      console.warn("Delete exception (non-fatal):", delErr);
    }

    // Normalize rows for insert
    const rows = csv.map((row) => ({
      difficulty: normalizeDifficulty(row.difficulty),
      question_type: normalizeQType(row.question_type),
      question_text: (row.question_text || "").toString().trim(),
      scenario_reason_text: (row.scenario_reason_text || "").toString().trim(),
      option_a: (row.option_a || "").toString().trim(),
      option_b: (row.option_b || "").toString().trim(),
      option_c: (row.option_c || "").toString().trim(),
      option_d: (row.option_d || "").toString().trim(),
      correct_answer_key: (row.correct_answer_key || "").toString().trim().toUpperCase()
    }));

    const { data: insertData, error: insertError } = await supabase.from(table).insert(rows);
    if (insertError) {
      console.error("Insert error:", insertError);
      return res.status(500).json({
        ok: false,
        error: "Failed to insert rows into Supabase table.",
        detail: insertError.message || insertError
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Table updated successfully.",
      table,
      new_table_id: table,
      inserted: Array.isArray(insertData) ? insertData.length : rows.length
    });
  } catch (err) {
    console.error("❌ manageSupabase error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal error" });
  }
}
