import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  Object.entries({ ...getCorsHeaders(origin), "Content-Type": "application/json" })
    .forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta = {}, csv = [] } = body;
    const { class_name, subject, book, chapter, refresh = false, table_name } = meta;

    if (!class_name || !subject || !chapter || !Array.isArray(csv) || (!refresh && !csv.length))
      return res.status(400).json({ error: "Missing or invalid parameters" });

    const supabase = createClient(process.env.SUPABASE_URL_11, process.env.SUPABASE_SERVICE_KEY_11);
    const safeSlug = (str) =>
      str.toLowerCase().replace(/[^a-z0-9]+/g, "_").split("_").slice(0, 2).join("_");
    const tableName = table_name || `${safeSlug(chapter)}_quiz`;

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
    `;
    await supabase.rpc("execute_sql", { query: createQuery }).catch(() => {});

    if (refresh)
      await supabase.rpc("execute_sql", { query: `TRUNCATE TABLE public.${tableName};` }).catch(() => {});

    if (csv.length) await supabase.from(tableName).insert(csv);

    return res.status(200).json({
      ok: true,
      message: `${csv.length} questions uploaded to ${tableName}`,
      table: tableName,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
