// ✅ /api/manageSupabase.js — Final stable version (with direct SQL fallback)
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

    // Create table name (2-word slug)
    const chapterSlug = chapter
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join("_");

    const tableName = `${chapterSlug}_quiz`;
    console.log(`🧩 Processing table: ${tableName}`);

    // 🧠 Step 1: Create table directly via SQL REST API
    const sql = `
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
      CREATE POLICY IF NOT EXISTS "Allow All Access" ON public.${tableName}
      FOR ALL USING (true) WITH CHECK (true);
      GRANT ALL ON public.${tableName} TO anon;
    `;

    const sqlRes = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_sql`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!sqlRes.ok) {
      console.warn("⚠️ SQL RPC failed, continuing anyway:", await sqlRes.text());
    }

    // 🧠 Step 2: Refresh mode — truncate if requested
    if (refresh) {
      console.log(`♻️ Refreshing ${tableName}...`);
      await fetch(`${supabaseUrl}/rest/v1/rpc/execute_sql`, {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: `TRUNCATE TABLE public.${tableName};` }),
      }).catch(() => console.warn("⚠️ Truncate failed — continuing insert."));
    }

    // 🧠 Step 3: Insert rows
    const { error: insertError } = await supabase.from(tableName).insert(csv);
    if (insertError) throw insertError;

    console.log(`✅ Inserted ${csv.length} rows into ${tableName}`);

    // 🧠 Step 4: Log activity
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
    return res.status(500).json({
      ok: false,
      error: err.message || "Internal server error",
    });
  }
}
