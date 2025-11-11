// ✅ /api/manageSupabase.js
// Unified Supabase automation for Ready4Exam
// Creates table (if missing), inserts Gemini-generated data, and updates usage logs.

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // Handle preflight
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST method allowed" });

  try {
    // ----------------------------
    // Parse and validate input
    // ----------------------------
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta = {}, csv = [] } = body;
    const { class_name, subject, book = "", chapter, refresh = false } = meta;

    if (!class_name || !subject || !chapter || !Array.isArray(csv) || csv.length === 0) {
      console.error("❌ Missing or invalid parameters:", body);
      return res.status(400).json({ error: "Missing or invalid parameters" });
    }

    // ----------------------------
    // Supabase credentials
    // ----------------------------
    const supabaseUrl = process.env.SUPABASE_URL_11;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11;
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase credentials missing.");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ----------------------------
    // Table name: 2-word chapter slug + "_quiz"
    // ----------------------------
    const chapterSlug = chapter
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join("_");

    const tableName = `${chapterSlug}_quiz`;
    console.log(`🧩 Table name resolved: ${tableName}`);

    // ----------------------------
    // Ensure table exists
    // ----------------------------
    const ddl = `
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
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = '${tableName}' AND policyname = 'Allow All Access'
        ) THEN
          EXECUTE format('CREATE POLICY "Allow All Access" ON public.${tableName} FOR ALL USING (true) WITH CHECK (true);');
        END IF;
      END $$;
      GRANT ALL ON public.${tableName} TO anon;
    `;

    const { error: ddlError } = await supabase.rpc("execute_sql", { query: ddl });
    if (ddlError) console.warn("⚠️ Table creation via RPC may not be available. Skipping automatic DDL:", ddlError.message);

    // ----------------------------
    // Refresh (truncate if requested)
    // ----------------------------
    if (refresh) {
      console.log(`♻️ Refreshing table: ${tableName}`);
      try {
        await supabase.rpc("execute_sql", { query: `TRUNCATE TABLE public.${tableName};` });
      } catch {
        console.warn("⚠️ Could not truncate — continuing with insert.");
      }
    }

    // ----------------------------
    // Insert Gemini-generated rows
    // ----------------------------
    console.log(`📥 Inserting ${csv.length} rows into ${tableName}...`);
    const { error: insertError } = await supabase.from(tableName).insert(csv);
    if (insertError) throw insertError;
    console.log(`✅ Inserted ${csv.length} rows into ${tableName}`);

    // ----------------------------
    // Log usage in 'usage_logs'
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
    await supabase.from("usage_logs").insert(logEntry).catch(() => {
      console.warn("⚠️ Failed to log usage entry.");
    });

    // ----------------------------
    // Response
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
