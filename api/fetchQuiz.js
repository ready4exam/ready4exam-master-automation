import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Only GET allowed" });

  try {
    let { table, difficulty = "" } = req.query || {};
    if (!table) {
      return res.status(400).json({ ok: false, error: "Missing table parameter" });
    }

    const supabaseUrl = process.env.SUPABASE_URL_11 || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11 || process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ ok: false, error: "Supabase credentials missing." });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    let query = supabase.from(table).select("*").order("id", { ascending: true }).limit(500);

    difficulty = (difficulty || "").toString().trim();
    if (difficulty) {
      query = query.ilike("difficulty", `%${difficulty}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("fetchQuiz query error:", error);
      return res.status(500).json({ ok: false, error: error.message || "Supabase query error" });
    }

    if (!data || !data.length) {
      return res.status(404).json({ ok: false, error: "No questions found for this table/difficulty." });
    }

    return res.status(200).json({ ok: true, rows: data });
  } catch (err) {
    console.error("❌ fetchQuiz error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal server error" });
  }
}
