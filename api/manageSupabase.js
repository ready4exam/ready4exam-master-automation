// /api/manageSupabase.js
import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

// Normalize DB fields ---------------------------------
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
  if (["mcq", "multiple choice", "objective"].includes(t)) return "MCQ";
  if (["ar", "assertion", "assertion-reason"].includes(t)) return "AR";
  if (["case", "case-based", "case study"].includes(t)) return "Case-Based";
  return "MCQ";
}

// ================================================================
// ⭐ FINAL TABLE NAMING FUNCTION — NO BREAK — NO OTHER DEVIATION
// Handles single-word chapters, multi-word, Roman I/II, s-block / p-block
// ================================================================
function buildTableName(meta) {
  let chapter = (meta.chapter || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")  // remove symbols
    .replace(/\s+/g, " ")
    .trim();

  const skip = ["as","of","the","a","an","in","on","for","to"];
  const roman = ["i","ii","iii","iv","v","vi","vii","viii","ix","x"];

  const words = chapter.split(" ").filter(Boolean);
  const first = words[0];
  const filtered = words.filter(w => !skip.includes(w));

  let last = filtered.length > 1
      ? filtered[filtered.length - 1]
      : words.length > 1
      ? words[words.length - 1]
      : first;

  // ✔ Avoid repetition for single word chapters
  if (first === last && !roman.includes(last)) {
    return `${first}_quiz`;
  }

  // ✔ Handle chapters like: Recording Transactions I / II / III
  if (roman.includes(last)) {
    const beforeLast = filtered.length >= 2 ? filtered[filtered.length-2] : first;
    return `${beforeLast}_${last}_quiz`;
  }

  return `${first}_${last}_quiz`;
}

// ================================================================
// MAIN HANDLER — NO FLOW MODIFIED
// ================================================================
export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  Object.entries(getCorsHeaders(origin)).forEach(([k,v])=>res.setHeader(k,v));
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method==="OPTIONS") return res.status(200).end();
  if (req.method!=="POST")
    return res.status(405).json({ok:false,error:"Only POST allowed"});

  try {
    const body = typeof req.body==="string" ? JSON.parse(req.body) : req.body;
    const { meta, csv } = body || {};
    if (!meta || !csv || !Array.isArray(csv)) {
      return res.status(400).json({ok:false,error:"Missing meta/csv array."});
    }

    const supabaseUrl =
      process.env.SUPABASE_URL_11 || process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_KEY_11 || process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey)
      return res.status(500).json({ok:false,error:"Supabase config missing."});

    const supabase = createClient(supabaseUrl, supabaseKey);

    const table = buildTableName(meta);

    const rpcRes = await supabase.rpc("ensure_table_exists", { table_name: table });
    if (rpcRes.error) throw rpcRes.error;

    await supabase.rpc("exec_sql", {
      sql: `
        ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;

        DO $do$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE policyname = '${table}_select_policy'
          ) THEN
            EXECUTE 'CREATE POLICY ${table}_select_policy ON public.${table}
                     FOR SELECT TO anon, authenticated USING (true);';
          END IF;
        END;
        $do$;

        GRANT USAGE ON SCHEMA public TO anon, authenticated;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
      `
    });

    await supabase.from(table).delete().neq("id", 0);

    const rows = csv.map(r => ({
      difficulty: normalizeDifficulty(r.difficulty),
      question_type: normalizeQType(r.question_type),
      question_text:(r.question_text||"").trim(),
      scenario_reason_text:(r.scenario_reason_text||"").trim(),
      option_a:(r.option_a||"").trim(),
      option_b:(r.option_b||"").trim(),
      option_c:(r.option_c||"").trim(),
      option_d:(r.option_d||"").trim(),
      correct_answer_key:(r.correct_answer_key||"").trim().toUpperCase(),
    }));

    const {data,error} = await supabase.from(table).insert(rows);
    if (error) throw error;

    // ===================== LOG USAGE (SAFE, LIGHT, ONE ROW ONLY) =====================
    const { data: existing } = await supabase
      .from("usage_logs")
      .select("refresh_count")
      .eq("table_name", table)
      .single();

    if (existing) {
      await supabase.from("usage_logs")
        .update({
          refresh_count: existing.refresh_count + 1,
          inserted_count: rows.length,
          updated_at: new Date(),
          class_name: meta.class_name,
          subject: meta.subject,
          book: meta.book,
          chapter: meta.chapter
        })
        .eq("table_name", table);
    } else {
      await supabase.from("usage_logs").insert({
        class_name: meta.class_name,
        subject: meta.subject,
        book: meta.book,
        chapter: meta.chapter,
        table_name: table,
        inserted_count: rows.length,
        refresh_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    // ===============================================================================

    return res.status(200).json({
      ok:true,
      message:"Table updated successfully.",
      new_table_id:table,
      inserted:data?.length||rows.length,
    });

  } catch(err) {
    console.error("❌ manageSupabase error:",err);
    return res.status(500).json({ok:false,error:err.message});
  }
}
