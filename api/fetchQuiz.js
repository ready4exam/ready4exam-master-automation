// ✅ /api/fetchQuiz.js — Fetch quiz rows for quiz viewer (server-side safe)
// Works with pg_exec-enabled Supabase setup.
// Author: Ready4Exam Phase-2 Automation

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Only GET allowed" });

  try {
    // table param is required: e.g. /api/fetchQuiz?table=motion_in_quiz
    const { table } = req.query;
    if (!table) return res.status(400).json({ error: "Missing table parameter" });

    const supabaseUrl = process.env.SUPABASE_URL_11;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11; // service key for server-side read
    if (!supabaseUrl || !supabaseKey)
      throw new Error("Supabase credentials missing.");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Select all rows ordered by ID
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .limit(500);

    if (error) throw error;

    return res.status(200).json({ ok: true, rows: data });
  } catch (err) {
    console.error("❌ fetchQuiz.js error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal server error" });
  }
}
