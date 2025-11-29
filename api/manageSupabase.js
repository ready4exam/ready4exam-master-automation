// /api/manageSupabase.js
import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

// Normalize DB fields
function normalizeDifficulty(d) {
  if (!d) return "Simple";
  d = d.toLowerCase().trim();
  if (["simple","easy"].includes(d)) return "Simple";
  if (["medium","moderate"].includes(d)) return "Medium";
  if (["advanced","hard"].includes(d)) return "Advanced";
  return "Simple";
}

function normalizeQType(t) {
  if (!t) return "MCQ";
  t = t.toLowerCase().trim();
  if (["mcq","multiple choice","objective"].includes(t)) return "MCQ";
  if (["ar","assertion","assertion-reason"].includes(t)) return "AR";
  if (["case","case-based","case study"].includes(t)) return "Case-Based";
  return "MCQ";
}

/* ⭐ FINAL TABLE NAME BUILDER — NO CHANGE */
function buildTableName(meta) {
  let chapter = (meta.chapter || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g," ")
    .replace(/\s+/g," ")
    .trim();

  const skip = ["as","of","the","a","an","in","on","for","to"];
  const roman = ["i","ii","iii","iv","v","vi","vii","viii","ix","x"];

  const w = chapter.split(" ").filter(Boolean);
  const f = w.filter(x => !skip.includes(x));

  let first = f.length ? f[0] : w[0];
  let last  = f.length>1 ? f[f.length-1] : w[w.length-1];

  if (roman.includes(last) && f.length>=2) last = `${f[f.length-2]}_${last}`;

  return `${first}_${last}_${meta.class_name}_quiz`;
}

/* ======================= MAIN HANDLER ======================= */
export default async function handler(req,res){
  const origin=req.headers.origin||"*";
  Object.entries(getCorsHeaders(origin)).forEach(([k,v])=>res.setHeader(k,v));
  if(req.method==="OPTIONS")return res.status(200).end();
  if(req.method!=="POST")return res.status(405).json({error:"Only POST allowed"});

  try{
    const body=typeof req.body==="string"?JSON.parse(req.body):req.body;
    const {meta,csv}=body||{};
    if(!meta||!csv||!Array.isArray(csv))
      return res.status(400).json({error:"Missing meta/csv"});

    const url=process.env.SUPABASE_URL_11||process.env.SUPABASE_URL;
    const key=process.env.SUPABASE_SERVICE_KEY_11||process.env.SUPABASE_SERVICE_KEY;
    if(!url||!key)return res.status(500).json({error:"Supabase configuration missing"});

    const supabase=createClient(url,key);

    /* ============================================================
       1. TABLE CREATION + INSERT QUESTIONS
    ============================================================ */
    const table = buildTableName(meta);

    await supabase.rpc("ensure_table_exists",{table_name:table});

    await supabase.rpc("exec_sql",{sql:`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
      DO $do$ BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE policyname='${table}_select_policy')
        THEN EXECUTE 'CREATE POLICY ${table}_select_policy ON public.${table}
                      FOR SELECT TO anon,authenticated USING(true);';
        END IF;
      END $do$;
      GRANT USAGE ON SCHEMA public TO anon,authenticated;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon,authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon,authenticated;`
    });

    await supabase.from(table).delete().neq("id",0);

    const rows = csv.map(r=>({
      difficulty:normalizeDifficulty(r.difficulty),
      question_type:normalizeQType(r.question_type),
      question_text:(r.question_text||"").trim(),
      scenario_reason_text:(r.scenario_reason_text||"").trim(),
      option_a:(r.option_a||"").trim(),
      option_b:(r.option_b||"").trim(),
      option_c:(r.option_c||"").trim(),
      option_d:(r.option_d||"").trim(),
      correct_answer_key:(r.correct_answer_key||"").trim().toUpperCase()
    }));

    await supabase.from(table).insert(rows);

    /* ============================================================
       2. LOGGING — NO FRONTEND MODE REQUIRED
       AUTO-DETECT FIRST RUN vs REFRESH
    ============================================================ */

    const { data: ex } = await supabase
      .from("usage_logs")
      .select("*")
      .eq("class_name", meta.class_name)
      .eq("subject", meta.subject)
      .eq("chapter", meta.chapter)         // 🔥 book optional
      .eq("table_name", table)
      .maybeSingle();

    /* ---------- FIRST GENERATE ---------- */
    if (!ex) {
      await supabase.from("usage_logs").insert({
        class_name: meta.class_name,
        subject: meta.subject,
        book: meta.book ?? null,
        chapter: meta.chapter,
        table_name: table,
        inserted_count: rows.length,
        refresh_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      });

      console.log(`📌 LOG CREATED → ${table}`);
    }

    /* ---------- REFRESH ---------- */
    else {
      await supabase.from("usage_logs")
        .update({
          inserted_count: rows.length,
          refresh_count: ex.refresh_count + 1,
          updated_at: new Date()
        })
        .eq("id", ex.id);

      console.log(`🔄 REFRESH LOG UPDATED +1 → ${table}`);
    }

    return res.status(200).json({
      ok:true,
      message:"Success",
      new_table_id:table,
      inserted:rows.length
    });

  }catch(err){
    console.error("❌ manageSupabase error:",err);
    return res.status(500).json({error:err.message});
  }
}
