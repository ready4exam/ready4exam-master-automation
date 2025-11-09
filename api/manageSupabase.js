// -------------------- /api/manageSupabase.js --------------------
// Unified Supabase_11 automation for Ready4Exam
// Creates or refreshes tables, inserts Gemini-generated quiz data,
// and logs usage for daily reporting.

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./_cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // --- Preflight ---
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST method allowed" });

  try {
    // --- Parse body ---
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta = {}, csv = [] } = body;
    const { className, subject, book = "", chapter, refresh = false } = meta;

    if (!className || !subject || !chapter || !Array.isArray(csv) || !csv.length) {
      return res.status(400).json({ error: "Missing or invalid parameters" });
    }

    // --- Supabase (unified 11) ---
    const supabaseUrl = process.env.SUPABASE_URL_11;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11;
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase_11 credentials missing");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- Table name ---
    const tableName = [
      `class${className}`,
      subject.toLowerCase().replace(/\s+/g, "_"),
      book ? book.toLowerCase().replace(/\s+/g, "_") : "",
      chapter.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      "quiz",
    ]
      .filter(Boolean)
      .join("_");

    console.log(`🧩 Processing table: ${tableName}`);

    // --- Create table if not exists ---
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

    const { error: ddlError } = await supabase.rpc("execute_sql", { query: createQuery }).catch(() => ({
      error: null,
    }));
    if (ddlError) console.warn("⚠️ DDL warning:", ddlError.message);

    // --- Refresh mode ---
    if (refresh) {
      console.log(`♻️ Refresh mode: truncating ${tableName}`);
      await supabase.rpc("execute_sql", { query: `TRUNCATE TABLE public.${tableName};` }).catch(() => {});
    }

    // --- Insert rows ---
    const { error: insertError } = await supabase.from(tableName).insert(csv);
    if (insertError) throw insertError;

    console.log(`✅ Inserted ${csv.length} rows into ${tableName}`);

    // --- Log usage ---
    const logEntry = {
      class_name: className,
      subject,
      book,
      chapter,
      table_name: tableName,
      inserted_count: csv.length,
      refresh,
      created_at: new Date().toISOString(),
    };
    await supabase.from("usage_logs").insert(logEntry).catch(() => {});

    // --- Response ---
    return res.status(200).json({
      ok: true,
      message: `${csv.length} questions uploaded to ${tableName}`,
      table: tableName,
