// api/fetchQuiz.js
// -------------------------------------------------------------
// Phase-3 Final Version — Fetch quiz rows for Quiz Engine (updated)
// • Uses corsHandler.js
// • Case-insensitive difficulty filtering (ilike)
// • Stable with Supabase_11 (service key)
// -------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./corsHandler.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";

  const headers = {
    ...getCorsHeaders(origin),
    "Content-Type": "application/json",
  };

  // Always set CORS headers first
  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, v);
  }

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Only GET allowed" });

  try {
    let { table, difficulty = "" } = req.query;

    if (!table) {
      return res.status(400).json({ error: "Missing table parameter" });
    }

    // normalize difficulty to safe lower-case token used by frontend
    difficulty = (difficulty || "").toString().toLowerCase().trim();

    // Server-side supabase init (service role key)
    const supabaseUrl = process.env.SUPABASE_URL_11;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase credentials missing.");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Use ilike with wildcard so matching is case-insensitive
    // If difficulty is empty string, match all rows
    const query = supabase
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .limit(500);

    if (difficulty) {
      // match 'simple' | 'medium' | 'advanced' regardless of case or minor variations
      await (async () => {
        // Use ilike pattern
        const pattern = `%${difficulty}%`;
        query.ilike("difficulty", pattern);
      })();
    }

    const { data, error } = await query;
    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "No questions found.",
      });
    }

    return res.status(200).json({
      ok: true,
      rows: data,
    });
  } catch (err) {
    console.error("❌ fetchQuiz.js error:", err);
    return res
      .status(500)
      .json({ ok: false, error: err.message || "Internal server error" });
  }
}
