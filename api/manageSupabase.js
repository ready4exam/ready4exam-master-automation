// ============================================================================
// /api/manageSupabase.js — RESTORED + FIXED + COMPLETE VERSION (2025 FINAL)
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";
import { transliterate as tr } from "transliteration";

export const config = { runtime: "nodejs" };

// ============================================================================
// VALIDATION (NEW — Ensures usage_logs always works)
// ============================================================================
function validateMeta(meta) {
  if (!meta) throw new Error("Meta missing");
  if (!meta.class_name) throw new Error("class_name missing");
  if (!meta.subject) throw new Error("subject missing");
  if (!meta.chapter) throw new Error("chapter missing");
  if (meta.book === undefined || meta.book === null) meta.book = "";
}

// ============================================================================
// NORMALIZERS (RESTORED + CLEANED)
// ============================================================================
function normalizeDifficulty(d) {
  if (!d) return "Simple";
  d = d.toLowerCase().trim();
  if (["simple", "easy"].includes(d)) return "Simple";
  if (["medium", "moderate"].includes(d)) return "Medium";
  if (["advanced", "hard"].includes(d)) return "Advanced";
  return "Simple";
}

function normalizeQType(t) {
  if (!t) return "MCQ";
  t = t.toLowerCase().trim();
  if (["mcq", "multiple choice"].includes(t)) return "MCQ";
  if (["ar", "assertion", "assertion-reason"].includes(t)) return "AR";
  if (["case", "case-based"].includes(t)) return "Case-Based";
  return "MCQ";
}

// ============================================================================
// TABLE NAME BUILDER (Original Logic + Hindi/Sanskrit Support)
// ============================================================================
function buildTableName(meta) {
  let raw = meta.chapter || "";
  let grade = meta.class_name || "";

  let safe = tr(raw)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const stop = ["as", "of", "the", "a", "an", "in", "on", "for", "to", "ki", "ke", "ka"];
  let parts = safe.split(" ").filter(w => !stop.includes(w));

  let first = parts[0] || "ch";
  let last = parts[parts.length - 1] || "x";

  return `${first}_${last}_${grade}_quiz`;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
export default async function handler(req, res) {

  // ------------------------------
  // CORS (RESTORED AS ORIGINAL)
  // ------------------------------
  const origin = req.headers.origin || "*";
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));

  // GitHub Pages support
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const { meta, csv } = body || {};
    validateMeta(meta);

    if (!csv || !Array.isArray(csv))
      throw new Error("CSV array missing");

    // ----------------------------------------------------------------------
    // INIT SUPABASE (RESTORED ORIGINAL FALLBACKS)
    // ----------------------------------------------------------------------
    const supabaseUrl =
      process.env.SUPABASE_URL_11 || process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_KEY_11 || process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey)
      throw new Error("Supabase config missing");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ----------------------------------------------------------------------
    // BUILD TABLE NAME
    // ----------------------------------------------------------------------
    const table = buildTableName(meta);

    // ----------------------------------------------------------------------
    // CREATE TABLE IF NOT EXISTS (RESTORED)
    // ----------------------------------------------------------------------
    const rpcRes = await supabase.rpc("ensure_table_exists", {
      table_name: table
    });

    if (rpcRes.error) throw rpcRes.error;

    // ----------------------------------------------------------------------
    // RESTORED RLS + POLICY CREATION SQL
    // ----------------------------------------------------------------------
    await supabase.rpc("exec_sql", {
      sql: `
        ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;

        DO $do$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE policyname='${table}_select_policy'
          ) THEN
            EXECUTE 'CREATE POLICY ${table}_select_policy
                     ON public.${table}
                     FOR SELECT
                     TO anon, authenticated
                     USING (true);';
          END IF;
        END $do$;

        GRANT USAGE ON SCHEMA public TO anon, authenticated;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;

        ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT ON TABLES TO anon, authenticated;
      `
    });

    // ----------------------------------------------------------------------
    // DELETE OLD ROWS FIRST (RESTORED)
    // ----------------------------------------------------------------------
    await supabase.from(table).delete().neq("id", 0);

    // ----------------------------------------------------------------------
    // INSERT NEW QUESTIONS (RESTORED LOGIC)
    // ----------------------------------------------------------------------
    const rows = csv.map(q => ({
      difficulty: normalizeDifficulty(q.difficulty),
      question_type: normalizeQType(q.question_type),
      question_text: (q.question_text || "").trim(),
      scenario_reason_text: (q.scenario_reason_text || "").trim(),
      option_a: (q.option_a || "").trim(),
      option_b: (q.option_b || "").trim(),
      option_c: (q.option_c || "").trim(),
      option_d: (q.option_d || "").trim(),
      correct_answer_key: (q.correct_answer_key || "A").trim().toUpperCase()
    }));

    const insertRes = await supabase.from(table).insert(rows);
    if (insertRes.error) throw insertRes.error;

    // ======================================================================
    // RESTORED + FIXED USAGE_LOGS INSERT/UPDATE
    // ======================================================================
    const { data: existing } = await supabase
      .from("usage_logs")
      .select("*")
      .eq("table_name", table)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("usage_logs")
        .update({
          refresh_count: existing.refresh_count + 1,
          inserted_count: rows.length,
          updated_at: new Date(),
          class_name: meta.class_name,
          subject: meta.subject,
          book: meta.book || "",
          chapter: meta.chapter
        })
        .eq("table_name", table);
    } else {
      await supabase.from("usage_logs").insert({
        table_name: table,
        class_name: meta.class_name,
        subject: meta.subject,
        book: meta.book || "",
        chapter: meta.chapter,
        inserted_count: rows.length,
        refresh_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      });
    }

    // RETURN SUCCESS
    return res.status(200).json({
      ok: true,
      message: "Table updated successfully",
      new_table_id: table,
      inserted: rows.length
    });

  } catch (err) {
    console.error("❌ manageSupabase error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
