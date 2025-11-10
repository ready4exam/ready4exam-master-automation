// -------------------- /api/getMapping.js --------------------
// Fetch the table name mapped to a given class, subject, and chapter.

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
    const { class_name, subject, chapter } = body;

    if (!class_name || !subject || !chapter)
      return res.status(400).json({ error: "Missing parameters" });

    const supabase = createClient(process.env.SUPABASE_URL_11, process.env.SUPABASE_SERVICE_KEY_11);

    const { data, error } = await supabase
      .from("table_mappings")
      .select("table_name")
      .eq("class_name", class_name)
      .eq("subject", subject)
      .eq("chapter_title", chapter)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "No mapping found" });

    return res.status(200).json({ ok: true, table_name: data.table_name });
  } catch (err) {
    console.error("❌ getMapping error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
