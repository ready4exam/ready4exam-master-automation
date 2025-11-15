// /api/manageSupabase.js
// Phase-3 Final Version — improved
// - Prefers provided meta.table_id if present
// - Returns { table, new_table_id }
// - Detects missing RPC and returns actionable error
// - Uses getCorsHeaders from ./cors.js

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

// Normalize helpers (kept consistent)
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

// Build slug if table_id not provided
function buildTableName(chapter) {
  const slug = (chapter || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/);

  if (slug.length === 0) return `quiz_table`;
  if (slug.length === 1) return `${slug[0]}_quiz`;

  const first = slug[0];
  const last = slug[slug.length - 1];
  return `${first}_${last}_quiz`;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = {
    ...getCorsHeaders(origin),
    "Content-Type": "application/json"
  };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta, csv } = body || {};

    if (!meta || !csv || !Array.isArray(csv)) {
      return res.status(400).json({ ok: false, error: "Missing meta or csv (array) in request body." });
    }

    const chapter = meta.chapter;
    // Use provided table_id if available (to align with curriculum table_id)
    const providedTableId = meta.table_id || meta.existing_table_id || null;
    const table = providedTableId ? providedTableId : buildTableName(chapter);

    // Supabase init
    const supabaseUrl = process.env.SUPABASE_URL_11 || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11 || process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ ok: false, error: "Supabase credentials missing on server." });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Ensure table exists by RPC 'ensure_table_exists'
    try {
      const rpcRes = await supabase.rpc("ensure_table_exists", { table_name: table });
      if (rpcRes.error) {
        // RPC returned an error object
        throw rpcRes.error;
      }
    } catch (rpcErr) {
      // Provide actionable message including SQL snippet for creating ensure_table_exists
      const sqlSnippet = `
-- Supabase SQL: create ensure_table_exists(table_name text)
-- Run this once in your Supabase SQL editor (adjust owner/schema if needed).
create or replace function public.ensure_table_exists(table_name text) returns void as $$
begin
  execute format('create table if not exists %I (id serial primary key, difficulty text, question_type text, question_text text, scenario_reason_text text, option_a text, option_b text, option_c text, option_d text, correct_answer_key text);', table_name);
end;
$$ language plpgsql;
      `.trim();

      console.error("RPC ensure_table_exists failed:", rpcErr);
      return res.status(500).json({
        ok: false,
        error: "Supabase RPC 'ensure_table_exists' failed or is missing.",
        detail: rpcErr.message || rpcErr,
        help: "Run the provided SQL snippet in Supabase to create the function, or deploy DB migration.",
        sql_snippet: sqlSnippet
      });
    }

    // DELETE existing rows (safe delete)
    const delRes = await supabase.from(table).delete().neq("id", 0);
    if (delRes.error) {
      console.error("Failed to delete old rows:", delRes.error);
      // Not fatal; continue to attempt insert
    }

    // Build normalized rows
    const rows = csv.map((row, idx) => {
      return {
        difficulty: normalizeDifficulty(row.difficulty),
        question_type: normalizeQType(row.question_type),
        question_text: (row.question_text || "").toString().trim(),
        scenario_reason_text: (row.scenario_reason_text || "").toString().trim(),
        option_a: row.option_a || "",
        option_b: row.option_b || "",
        option_c: row.option_c || "",
        option_d: row.option_d || "",
        correct_answer_key: (row.correct_answer_key || "").toString().trim().toUpperCase()
      };
    });

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
