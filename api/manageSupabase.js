// -------------------- /api/manageSupabase.js --------------------
// Unified Supabase_11 automation for Ready4Exam
// Creates or refreshes tables, inserts Gemini-generated quiz data,
// and logs usage for daily reporting.

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  // ----------------------------
  // CORS HANDLING
  // ----------------------------
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // Handle preflight
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST method allowed" });

  try {
    // ----------------------------
    // BODY VALIDATION
    // ----------------------------
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta = {}, csv = [] } = body;
    const { class_name, subject, book = "", chapter, refresh = false, table_name } = meta;

    if (!class_name || !subject || !chapter || !Array.isArray(csv) || (!refresh && !csv.length)) {
      return res.status(400).json({ error: "Missing or invalid parameters" });
    }

    // ----------------------------
    // SUPABASE CONNECTION
    // ----------------------------
    const supabaseUrl = process.env.SUPABASE_URL_11;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11;
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase_11 credentials missing");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ----------------------------
    // TABLE NAME FORMAT
    // ----------------------------
    const safeSlug = (str) =>
      str.toLowerCase().replace(/[^a-z0-9]+/g, "_").split("_").slice(0, 2).join("_");

    const tableName = table_name || `${safeSlug(chapter)}_quiz`;

    console.log(`🧩 Processing table: ${tableName}`);

    // ----------------------------
    // CREATE TABLE IF NOT EXISTS
    // ----------------------------
    const createQuery = `
      CREATE TABLE IF NOT EXISTS public.${tableName} (
        id BIGSERIAL PRIMARY KEY,
        difficulty TEXT,
        question_type TEXT,
        question_text TEXT,
        scenario_reason_text TEXT,
        option_a TEXT,
        option_b TEXT,
        option_c TEXT,
        option_d TEXT,
        correct_answer_key TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;
    `;

    try {
      const { error: ddlError } = await supabase.rpc("execute_sql", { query: createQuery });
      if (ddlError) console.warn("⚠️ DDL warning:", ddlError.message);
    } catch (err) {
      console.warn("⚠️ RPC create table failed:", err.message);
    }

    // ----------------------------
    // REFRESH MODE
    // ----------------------------
    if (refresh) {
      console.log(`♻️ Refresh mode: truncating ${tableName}`);
      try {
        const { error: truncateError } = await supabase.rpc("execute_sql", {
          query: `TRUNCATE TABLE public.${tableName};`,
        });
        if (truncateError) console.warn("⚠️ Truncate warning:", truncateError.message);
      } catch (err) {
        console.warn("⚠️ RPC truncate failed:", err.message);
      }
    }

    // ----------------------------
    // INSERT CSV DATA
    // ----------------------------
    if (csv.length) {
      const { error: insertError } = await supabase.from(tableName).insert(csv);
      if (insertError) throw insertError;
      console.log(`✅ Inserted ${csv.length} rows into ${tableName}`);
    }

    // ----------------------------
    // LOG USAGE
    // ----------------------------
    const logEntry = {
      class_name,
      subject,
      book,
      chapter,
      table_name: tableName,
      inserted_count: csv.length,
      refresh,
      created_at: new Date().toISOString(),
    };

    try {
      await supabase.from("usage_logs").insert(logEntry);
    } catch (err) {
      console.warn("⚠️ Logging failed:", err.message);
    }

    // ----------------------------
    // SUCCESS RESPONSE
    // ----------------------------
    return res.status(200).json({
      ok: true,
      message: `${csv.length} questions uploaded to ${tableName}`,
      table: tableName,
    });
  } catch (err) {
    console.error("❌ manageSupabase.js error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Internal server error",
    });
  }
}
