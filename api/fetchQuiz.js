import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = {
  runtime: "nodejs"
};

export default async function handler(req, res) {
  // ---- CORS handling FIRST ----
  const origin = req.headers.origin || "*";
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method.toUpperCase() === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method.toUpperCase() !== "GET") {
    res.status(405).json({ ok: false, error: "Only GET allowed" });
    return;
  }

  try {
    const { table, difficulty = "" } = req.query || {};

    if (!table) {
      res.status(400).json({ ok: false, error: "Missing table parameter" });
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL_11 || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11 || process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      res.status(500).json({ ok: false, error: "Supabase credentials missing." });
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    let query = supabase
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .limit(500);

    const diff = (difficulty || "").trim();
    if (diff) {
      query = query.ilike("difficulty", `%${diff}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("❌ fetchQuiz Supabase error:", error);
      res.status(500).json({ ok: false, error: error.message });
      return;
    }

    if (!data || data.length === 0) {
      res.status(404).json({
        ok: false,
        error: "No questions found for this table/difficulty."
      });
      return;
    }

    res.status(200).json({ ok: true, rows: data });

  } catch (err) {
    console.error("❌ fetchQuiz handler failed:", err);
    res.status(500).json({ ok: false, error: err.message || "Internal server error" });
  }
}
