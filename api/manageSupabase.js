// -------------------- /api/manageSupabase.js --------------------
// Unified Supabase_11 automation for Ready4Exam
// Creates or refreshes tables, inserts Gemini-generated quiz data,
// and logs usage for daily reporting + updates table_mappings.

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST method allowed" });

  try {
    // ----------------------------
    // 1️⃣ Parse Input
    // ----------------------------
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta = {}, csv = [] } = body;
    const { class_name, subject, book = "", chapter, refresh = false } = meta;

    if (!class_name || !subject || !chapter || !Array.isArray(csv) || !csv.length) {
      return res.status(400).json({ error: "Missing or invalid parameters" });
    }

    // ----------------------------
    // 2️⃣ Supabase Connection
    // ----------------------------
    const supabaseUrl = process.env.SUPABASE_URL_11;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11;
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase credentials missing");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ----------------------------
    // 3️⃣ Generate Safe Table Name
    // ----------------------------
    const shortChapterSlug = chapter
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .split("_")
      .slice(0, 2)
      .join("_"); // take only first two words
    const tableName = `${shortChapterSlug}_quiz`;

    console.log(`🧩 Processing table: ${tableName}`);

    // ----------------------------
    // 4️⃣ Create Table if not exists
    // ----------------------------
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
      ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "Allow All" ON public.${tableName};
      CREATE POLICY "Allow All" ON public.${tableName} FOR ALL USING (true) WITH CHECK (true);
    `;

    try {
      await supabase.rpc("execute_sql", { query: createQuery });
    } catch (err) {
      console.warn("⚠️ RPC execute_sql failed, falling back (no DDL RPC available).", err.message);
    }

    // ----------------------------
    // 5️⃣ Refresh Mode (truncate)
    // ----------------------------
    if (refresh) {
      console.log(`♻️ Refreshing ${tableName}`);
      try {
        await supabase.from(tableName).delete().neq("id", 0);
      } catch (err) {
        console.warn("⚠️ Truncate fallback failed:", err.message);
      }
    }

    // ----------------------------
    // 6️⃣ Insert CSV Data
    // ----------------------------
    const { error: insertError } = await supabase.from(tableName).insert(csv);
    if (insertError) throw insertError;
    console.log(`✅ Inserted ${csv.length} rows into ${tableName}`);

    // ----------------------------
    // 7️⃣ Log Usage
    // ----------------------------
    const logEntry = {
      class_name,
      subject,
      book,
      chapter,
      table_name: tableName,
      inserted_count: csv.length,
      refresh,
      created_at: new Date().toISOString(),
    };
    await supabase.from("usage_logs").insert(logEntry).catch(() => {});

    // ----------------------------
    // 8️⃣ Record Mapping
    // ----------------------------
    try {
      await supabase
        .from("table_mappings")
        .upsert(
          {
            class_name,
            subject,
            chapter_title: chapter,
            table_name: tableName,
          },
          { onConflict: "chapter_title" }
        );
      console.log(`🔗 Mapping saved: ${chapter} → ${tableName}`);
    } catch (err) {
      console.warn("⚠️ Mapping upsert failed:", err.message);
    }

    // ----------------------------
    // ✅ Done
    // ----------------------------
    return res.status(200).json({
      ok: true,
      message: `${csv.length} questions uploaded to ${tableName}`,
      table: tableName,
    });
  } catch (err) {
    console.error("❌ manageSupabase error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal Server Error" });
  }
}
