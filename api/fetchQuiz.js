// /api/fetchQuiz.js — FINAL VERSION (Aligned with manageSupabase tableName logic)

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Only GET allowed" });

  try {
    const { class_name, subject, chapter } = req.query;

    if (!class_name || !subject || !chapter) {
      return res.status(400).json({
        error: "Missing class_name, subject, or chapter"
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL_11;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11;
    if (!supabaseUrl || !supabaseKey)
      throw new Error("Supabase credentials missing.");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ---------------------------------------------------
    //  🔥 MATCH manageSupabase.js table-name logic
    //  Rule: first word + last word + "_quiz"
    // ---------------------------------------------------
    const words = chapter
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/);

    let chapterSlug;

    if (words.length === 1) {
      chapterSlug = words[0];
    } else {
      const first = words[0];
      const last = words[words.length - 1];
      chapterSlug = `${first}_${last}`;
    }

    const tableName = `${chapterSlug}_quiz`;

    console.log(`📥 Fetching quiz from: ${tableName}`);

    // Load all questions from Supabase
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .order("id", { ascending: true });

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      rows: data
    });

  } catch (err) {
    console.error("❌ fetchQuiz.js error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Internal server error"
    });
  }
}
