// api/manageSupabase.js
import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta = {}, csv = [] } = body;
    const { class_name, subject, book = "", chapter, refresh = false } = meta;

    if (!class_name || !subject || !chapter || !Array.isArray(csv) || csv.length === 0)
      return res.status(400).json({ error: "Missing or invalid parameters" });

    const supabaseUrl = process.env.SUPABASE_URL_11;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11;
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase credentials missing.");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // table name: first two words of chapter slug
    const chapterSlug = chapter
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join("_");
    const tableName = `${chapterSlug}_quiz`;

    console.log(`🧩 Managing table: ${tableName}`);

    // 1) Create table + RLS + policy
    const sqlCreate = `
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

    await supabase.rpc("pg_exec", { query: sqlCreate });
    console.log(`✅ Table ${tableName} ensured.`);

    // 2) Optional refresh (truncate)
    if (refresh) {
      console.log(`♻️ Refresh mode: truncating ${tableName}...`);
      await supabase.rpc("pg_exec", { query: `TRUNCATE TABLE IF EXISTS public.${tableName};` });
    }

    // 3) Insert rows (json_to_recordset via pg_exec)
    console.log(`📥 Preparing to insert ${csv.length} rows into ${tableName}...`);
    const jsonPayload = JSON.stringify(
      csv.map((row) => ({
        difficulty: row.difficulty ?? null,
        question_type: row.question_type ?? null,
        question_text: row.question_text ?? null,
        scenario_reason_text: row.scenario_reason_text ?? null,
        option_a: row.option_a ?? null,
        option_b: row.option_b ?? null,
        option_c: row.option_c ?? null,
        option_d: row.option_d ?? null,
        correct_answer_key: row.correct_answer_key ?? null,
      }))
    ).replace(/'/g, "''");

    const insertSql = `
      WITH data AS (
        SELECT *
        FROM json_to_recordset('${jsonPayload}')
        AS (
          difficulty text,
          question_type text,
          question_text text,
          scenario_reason_text text,
          option_a text,
          option_b text,
          option_c text,
          option_d text,
          correct_answer_key text
        )
      )
      INSERT INTO public.${tableName} (
        difficulty, question_type, question_text, scenario_reason_text,
        option_a, option_b, option_c, option_d, correct_answer_key
      )
      SELECT difficulty, question_type, question_text, scenario_reason_text,
             option_a, option_b, option_c, option_d, correct_answer_key
      FROM data;
    `;

    await supabase.rpc("pg_exec", { query: insertSql });
    console.log(`✅ Inserted ${csv.length} rows into ${tableName}`);

    // 4) Log usage into usage_logs
    const { error: logError } = await supabase.from("usage_logs").insert({
      class_name,
      subject,
      book,
      chapter,
      table_name: tableName,
      inserted_count: csv.length,
      refresh,
      created_at: new Date().toISOString(),
    });
    if (logError) console.warn("⚠️ Logging failed:", logError.message);

    return res.status(200).json({
      ok: true,
      message: `${csv.length} questions uploaded to ${tableName}`,
      table: tableName,
    });
  } catch (err) {
    console.error("❌ manageSupabase.js error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal server error" });
  }
}
