// -------------------- /api/manageSupabase.js --------------------
import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST method allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta = {}, csv = [] } = body;
    const { class_name, subject, book = "", chapter, refresh = false } = meta;

    if (!class_name || !subject || !chapter || !csv.length)
      return res.status(400).json({ error: "Missing or invalid parameters" });

    const supabase = createClient(process.env.SUPABASE_URL_11, process.env.SUPABASE_SERVICE_KEY_11);

    const tableName = `${chapter
      .split(" ")
      .slice(0, 2)
      .join("_")
      .toLowerCase()}_quiz`;

    console.log(`🧩 Using table: ${tableName}`);

    // Create table if not exists
    await supabase.rpc("execute_sql", {
      query: `
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
        CREATE POLICY IF NOT EXISTS "Allow all" ON public.${tableName}
        FOR ALL USING (true) WITH CHECK (true);
      `,
    }).catch(() => console.warn("⚠️ Table creation skipped (no RPC)"));

    if (refresh) {
      console.log(`♻️ Truncating table: ${tableName}`);
      await supabase.rpc("execute_sql", { query: `TRUNCATE TABLE public.${tableName};` });
    }

    const { error: insertError } = await supabase.from(tableName).insert(csv);
    if (insertError) throw insertError;

    console.log(`✅ Inserted ${csv.length} questions into ${tableName}`);
    return res.status(200).json({ ok: true, message: `${csv.length} questions uploaded`, table: tableName });
  } catch (err) {
    console.error("❌ manageSupabase.js error:", err);
    return res.status(500).json({ error: err.message });
  }
}
