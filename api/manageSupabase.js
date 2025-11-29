// /api/manageSupabase.js
import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

// ================== Normalizers ==================
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

// ================== Table Name Builder ==================
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
  let last  = f.length>1 ? f[f.length-1] : w[w.length-1];

  if (roman.includes(last) && f.length>=2) last = `${f[f.length-2]}_${last}`;

  return `${first}_${last}_${meta.class_name}_quiz`;
}

// ============================================================
// MAIN HANDLER — WORKS WITHOUT FRONTEND CHANGES
// ============================================================
export default async function handler(req, res) {

  const origin = req.headers.origin || "*";
  Object.entries(getCorsHeaders(origin)).forEach(([k,v])=>res.setHeader(k,v));
  if (req.method==="OPTIONS") return res.status(200).end();
  if (req.method!=="POST") return res.status(405).json({error:"Only POST allowed"});

  try {

    const body = typeof req.body==="string" ? JSON.parse(req.body) : req.body;
    const { meta, csv } = body || {};
    if (!meta || !csv || !Array.isArray(csv))
      return res.status(400).json({error:"Missing meta/csv array"});

    const supabaseUrl = process.env.SUPABASE_URL_11 || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY_11 || process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey)
      return res.status(500).json({error:"Supabase config missing"});

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ============================================================
    // 1) ALWAYS BUILD / UPDATE TABLE
    // ============================================================

    const table = buildTableName(meta);
    await supabase.rpc("ensure_table_exists",{ table_name: table });

    await supabase.rpc("exec_sql",{
      sql:`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
        DO $do$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='${table}_select_policy')
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

    await supabase.from(table).insert(rows);

    // ============================================================
    // 2) USAGE LOGGING — **NO FRONTEND INVOLVED**
    // ============================================================

    const { data: ex } = await supabase
      .from("usage_logs")
      .select("*")
      .eq("class_name", meta.class_name)
      .eq("subject", meta.subject)
      .eq("chapter", meta.chapter)
      .eq("table_name", table)
      .maybeSingle();

    // ---------- FIRST RUN = INSERT LOG ----------
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

      console.log(`🟢 FIRST GENERATION LOG ADDED → ${table}`);
    }

    // ---------- REFRESH = UPDATE LOG ----------
    else {
      await supabase.from("usage_logs")
        .update({
          inserted_count: rows.length,
          refresh_count: ex.refresh_count + 1,
          updated_at: new Date()
        })
        .eq("id", ex.id);

      console.log(`🟡 REFRESH COUNT +1 → ${table}`);
    }

    return res.status(200).json({
      ok:true,
      new_table_id: table,
      inserted: rows.length,
      message:"Success"
    });

  } catch(err) {
    console.error("❌ manageSupabase error:", err);
    return res.status(500).json({error:err.message});
  }
}
