// /api/manageSupabase.js
import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };


// =====================================================================
// Normalizers — unchanged behaviour
// =====================================================================
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


// =====================================================================
// Table Name Builder (unchanged)
// =====================================================================
function buildTableName(meta) {
  let chapter = (meta.chapter || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const skip = ["as","of","the","a","an","in","on","for","to"];
  const roman = ["i","ii","iii","iv","v","vi","vii","viii","ix","x"];

  const w = chapter.split(" ").filter(Boolean);
  const f = w.filter(x => !skip.includes(x));

  let first = f.length ? f[0] : w[0];
  let last  = f.length >1 ? f[f.length-1] : w[w.length-1];

  if (roman.includes(last) && f.length>=2) last=`${f[f.length-2]}_${last}`;

  return `${first}_${last}_${meta.class_name||"11"}_quiz`;
}


// =====================================================================
// Handler
// =====================================================================
export default async function handler(req, res) {

  // --- CORS ---
  const origin = req.headers.origin || "*";
  Object.entries(getCorsHeaders(origin)).forEach(([k,v]) => res.setHeader(k,v));
  res.setHeader("Access-Control-Max-Age","86400");

  if (req.method==="OPTIONS") return res.status(200).end();
  if (req.method!=="POST") return res.status(405).json({ok:false,error:"Only POST allowed"});


  try {
    // Parse payload
    const body = typeof req.body==="string" ? JSON.parse(req.body) : req.body;
    const { meta, csv } = body || {};

    if (!meta || !csv || !Array.isArray(csv)) {
      return res.status(400).json({ok:false,error:"Missing meta/csv"});
    }


    // ===========================================================================================
    // 🔥 FIX APPLIED: Supabase credentials restored EXACTLY as you had originally
    // ===========================================================================================
    const supabaseUrl =
      process.env.SUPABASE_URL_11 || process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_KEY_11 || process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ ok:false, error:"Supabase config missing — SUPABASE_URL required" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    // ===========================================================================================


    // Build table name
    const table = buildTableName(meta);


    // Ensure table exists
    const rpcRes = await supabase.rpc("ensure_table_exists",{ table_name:table });
    if (rpcRes.error) throw rpcRes.error;


    // Policies + Grants auto-applied once per table
    await supabase.rpc("exec_sql",{
      sql:`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
           DO $do$ BEGIN
             IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='${table}_select_policy')
             THEN EXECUTE 'CREATE POLICY ${table}_select_policy ON public.${table}
                          FOR SELECT TO anon, authenticated USING (true);';
             END IF;
           END $do$;
           GRANT USAGE ON SCHEMA public TO anon, authenticated;
           GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
           ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;`
    });


    // Wipe rows before insert
    await supabase.from(table).delete().neq("id",0);


    // Prepare rows
    const rows = csv.map(r => ({
      difficulty: normalizeDifficulty(r.difficulty),
      question_type: normalizeQType(r.question_type),
      question_text:(r.question_text||"").trim(),
      scenario_reason_text:(r.scenario_reason_text||"").trim(),
      option_a:(r.option_a||"").trim(),
      option_b:(r.option_b||"").trim(),
      option_c:(r.option_c||"").trim(),
      option_d:(r.option_d||"").trim(),
      correct_answer_key:(r.correct_answer_key||"").trim().toUpperCase()
    }));

    const { data, error } = await supabase.from(table).insert(rows);
    if (error) throw error;


    // ===========================================================================================
    // usage_logs insert/update (existing behaviour preserved)
    // ===========================================================================================
    const existing = await supabase
      .from("usage_logs")
      .select("refresh_count")
      .eq("table_name",table)
      .maybeSingle();

    if (existing?.data) {
      await supabase.from("usage_logs")
        .update({
          refresh_count: existing.data.refresh_count + 1,
          inserted_count: rows.length,
          updated_at:new Date(),
          class_name:meta.class_name,
          subject:meta.subject,
          book:meta.book,
          chapter:meta.chapter
        })
        .eq("table_name",table);

    } else {
      await supabase.from("usage_logs")
        .insert({
          table_name:table,
          class_name:meta.class_name,
          subject:meta.subject,
          book:meta.book,
          chapter:meta.chapter,
          inserted_count:rows.length,
          refresh_count:0,
          created_at:new Date(),
          updated_at:new Date()
        });
    }
    // ===========================================================================================


    return res.status(200).json({
      ok:true,
      message:"Table updated",
      new_table_id:table,
      inserted: data?.length || rows.length
    });

  } catch(err) {
    console.error("❌ manageSupabase error:",err);
    return res.status(500).json({ok:false,error:err.message});
  }
}
