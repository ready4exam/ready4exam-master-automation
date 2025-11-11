// ✅ /api/manageSupabase.js — Final Stable Version (Direct Admin SQL method)
// Compatible with Supabase v2 (no execute_sql dependency)

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";
import fetch from "node-fetch";

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

    // 🧩 Generate a clean table name (2-word chapter slug)
    const chapterSlug = chapter
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join("_");
    const tableName = `${chapterSlug}_quiz`;

    console.log(`🧩 Managing Supabase Table: ${tableName}`);

    // ----------------------------
    // 1️⃣ Force Table Creation using Supabase SQL API
    // ----------------------------
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

    const sqlResponse = await fetch(`${supabaseUrl}/rest/v1/query`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sqlCreate }),
    });

    if (!sqlResponse.ok) {
      const errText = await sqlResponse.text();
      console.warn("⚠️ SQL creation warning:", errText);
    } else {
      console.log(`✅ Table ${tableName} ensured.`);
    }

    // ----------------------------
    // 2️⃣ Optional Refresh Mode
    // ----------------------------
    if (refresh) {
      console.log(`♻️ Refresh mode: truncating ${tableName}...`);
      await fetch(`${supabaseUrl}/rest/v1/query`, {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: `TRUNCATE TABLE IF EXISTS public.${tableName};` }),
      }).catch(() => console.warn("⚠️ Table truncate failed — continuing."));
    }

    // ----------------------------
    // 3️⃣ Insert Gemini Data
    // ----------------------------
console.log(`📥 Waiting for table ${tableName} schema to refresh...`);
await new Promise(r => setTimeout(r, 2000)); // 2s delay for schema propagation

// Re-init client to refresh schema cache
const supabase2 = createClient(supabaseUrl, supabaseKey);

console.log(`📥 Inserting ${csv.length} rows into ${tableName}`);
const { error: insertError } = await supabase2.from(tableName).insert(csv);
if (insertError) throw insertError;
    console.log(`✅ Inserted ${csv.length} rows into ${tableName}`);

    // ----------------------------
    // 4️⃣ Log in usage_logs
    // ----------------------------
    await supabase
      .from("usage_logs")
      .insert({
        class_name,
        subject,
        book,
        chapter,
        table_name: tableName,
        inserted_count: csv.length,
        refresh,
        created_at: new Date().toISOString(),
      })
      .catch(() => console.warn("⚠️ Logging failed."));

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
