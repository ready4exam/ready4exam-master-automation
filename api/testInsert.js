// ✅ /api/testInsert.js
// Simple endpoint to test Supabase table creation & data insertion without using Gemini

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const { class_name = "11", subject = "Economics", chapter = "Test Chapter" } =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const supabaseUrl = process.env.SUPABASE_URL_11;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11;
    if (!supabaseUrl || !supabaseKey)
      throw new Error("Missing Supabase credentials in environment variables.");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const chapterSlug = chapter
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join("_");
    const tableName = `${chapterSlug}_quiz`;

    console.log(`🧩 Creating dummy table: ${tableName}`);

    // Create dummy table
    const createQuery = `
      CREATE TABLE IF NOT EXISTS public.${tableName} (
        id BIGSERIAL PRIMARY KEY,
        difficulty TEXT,
        question_type TEXT,
        question_text TEXT,
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

    // Run table creation query
    const { error: ddlError } = await supabase.rpc("execute_sql", { query: createQuery }).catch(
      (err) => ({ error: err })
    );
    if (ddlError) console.warn("⚠️ DDL execution issue (ignored):", ddlError.message);

    // Create dummy 60-question dataset
    const dummyData = Array.from({ length: 60 }, (_, i) => ({
      difficulty: i < 20 ? "Simple" : i < 40 ? "Medium" : "Advanced",
      question_type: ["MCQ", "AR", "CASE"][i % 3],
      question_text: `Dummy question ${i + 1}: What is ${i + 1}?`,
      option_a: "Option A",
      option_b: "Option B",
      option_c: "Option C",
      option_d: "Option D",
      correct_answer_key: "A",
    }));

    console.log(`📥 Inserting ${dummyData.length} dummy rows into ${tableName}`);

    const { error: insertError } = await supabase.from(tableName).insert(dummyData);
    if (insertError) throw insertError;

    console.log(`✅ Insert successful for ${tableName}`);

    return res.status(200).json({
      ok: true,
      message: `Inserted ${dummyData.length} dummy rows into ${tableName}`,
      table: tableName,
    });
  } catch (err) {
    console.error("❌ testInsert.js error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal error" });
  }
}
