// -------------------- /api/manageSupabase.js --------------------
// Ready4Exam — manageSupabase API
// Creates (if possible) and inserts into per-chapter quiz tables
// Table naming rule: first-two-words-from-chapter + _quiz
// --------------------

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  // CORS headers
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST method allowed" });

  try {
    // Parse body
    const rawBody = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta = {}, csv = [] } = rawBody;
    const { className, subject, book = "", chapter, refresh = false } = meta;

    if (!className || !subject || !chapter || !Array.isArray(csv) || !csv.length) {
      return res.status(400).json({ error: "Missing or invalid parameters" });
    }

    // Supabase connection
    const supabaseUrl = process.env.SUPABASE_URL_11;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11;
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase_11 credentials missing");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build table name: first two words of chapter -> cleaned -> _quiz
    const cleanChapter = chapter
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "") // remove punctuation
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2) // only first two words
      .join("_") || "chapter";

    const tableName = `${cleanChapter}_quiz`;

    console.log(`🧩 Processing table: ${tableName}`);

    // SQL to create table (idempotent)
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
    `;

    // Try to create table using execute_sql RPC (common admin helper)
    let created = false;
    try {
      const { error: ddlError } = await supabase.rpc("execute_sql", { query: createQuery });
      if (ddlError) {
        console.warn("⚠️ execute_sql RPC returned error:", ddlError.message);
      } else {
        created = true;
        console.log("✅ Table creation attempted via execute_sql RPC");
      }
    } catch (rpcErr) {
      console.warn("⚠️ execute_sql RPC not available or failed:", rpcErr?.message || rpcErr);
    }

    // If RPC was not available, attempt a REST RPC fallback (best-effort)
    if (!created) {
      try {
        // Many Supabase projects don't have this RPC; this is best-effort and may fail silently.
        await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sql: createQuery }),
        }).then((r) => {
          if (!r.ok) {
            console.warn(`⚠️ exec_sql REST fallback returned ${r.status}`);
          } else {
            console.log("✅ Table creation attempted via REST RPC fallback");
          }
        }).catch((e) => {
          console.warn("⚠️ REST RPC fallback failed:", e?.message || e);
        });
      } catch (e) {
        console.warn("⚠️ REST RPC fallback threw:", e?.message || e);
      }
    }

    // Refresh (truncate) if requested — attempt via RPC, otherwise attempt normal delete
    if (refresh) {
      console.log(`♻️ Refresh requested for ${tableName}`);
      try {
        // Try RPC TRUNCATE
        await supabase.rpc("execute_sql", { query: `TRUNCATE TABLE public.${tableName};` });
        console.log("✅ Truncate via RPC attempted");
      } catch {
        // Fallback: attempt deleting all rows (may fail if table doesn't exist)
        try {
          await supabase.from(tableName).delete().neq("id", 0);
          console.log("✅ Truncate via delete attempted");
        } catch (delErr) {
          console.warn("⚠️ Truncate fallback failed:", delErr?.message || delErr);
        }
      }
    }

    // Insert rows (use await + try/catch properly)
    try {
      const { error: insertError } = await supabase.from(tableName).insert(csv);
      if (insertError) {
        console.error("❌ Insert error:", insertError.message);
        throw insertError;
      }
      console.log(`✅ Inserted ${csv.length} rows into ${tableName}`);
    } catch (insertErr) {
      // If insert fails due to missing table, provide a helpful error message
      const msg = insertErr?.message || insertErr || "Insert failed";
      console.error("❌ Insert failed:", msg);
      return res.status(500).json({ ok: false, error: msg.toString() });
    }

    // Log usage (best-effort)
    try {
      const logEntry = {
        class_name: className,
        subject,
        book,
        chapter,
        table_name: tableName,
        inserted_count: csv.length,
        refresh,
        created_at: new Date().toISOString(),
      };
      await supabase.from("usage_logs").insert(logEntry);
    } catch (logErr) {
      console.warn("⚠️ Usage logging failed:", logErr?.message || logErr);
    }

    // Success
    return res.status(200).json({
      ok: true,
      message: `${csv.length} questions uploaded to ${tableName}`,
      table: tableName,
    });
  } catch (err) {
    console.error("❌ manageSupabase error:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
}
