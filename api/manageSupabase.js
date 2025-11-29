// /api/manageSupabase.js
import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

// To call updateCurriculum internally (AUTO-SYNC)
async function updateCurriculumRow(meta, newTableId) {
  try {
    await fetch(`${process.env.URL}/api/updateCurriculum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        class_name: meta.class_name,
        subject: meta.subject,
        book: meta.book,
        chapter: meta.chapter,
        new_table_id: newTableId
      })
    });
    console.log("📚 Curriculum updated internally ✔");
  } catch (e) {
    console.log("⚠ curriculum update failed, manual check required", e.message);
  }
}

/*============ Table Name Builder ============*/
function buildName(meta) {
  let c = (meta.chapter || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const skip = ["as","of","the","a","an","in","on","for","to"];
  const roman = ["i","ii","iii","iv","v","vi","vii","viii","ix","x"];

  const w = c.split(" ").filter(Boolean);
  const f = w.filter(x=>!skip.includes(x));

  let first = f.length?f[0]:w[0];
  let last  = f.length>1?f[f.length-1]:w[w.length-1];
  if(roman.includes(last)&&f.length>=2) last=`${f[f.length-2]}_${last}`;

  return `${first}_${last}_${meta.class_name}_quiz`;
}

/*============ Supabase Handler ============*/
export default async function handler(req,res){
  const origin=req.headers.origin||"*";
  Object.entries(getCorsHeaders(origin)).forEach(([k,v])=>res.setHeader(k,v));
  if(req.method==="OPTIONS")return res.status(200).end();
  if(req.method!=="POST")return res.status(405).json({error:"POST only"});

  try{
    const body=typeof req.body==="string"?JSON.parse(req.body):req.body;
    const {meta,csv}=body||{};
    if(!meta||!csv)return res.status(400).json({error:"meta/csv missing"});

    const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY);
    const table=buildName(meta);

    /* ===========================
       1️⃣ Check usage_logs & curriculum
    ===========================*/

    // fetch usage record if exists
    const { data: usage } = await supabase
      .from("usage_logs")
      .select("*")
      .eq("class_name",meta.class_name)
      .eq("subject",meta.subject)
      .eq("chapter",meta.chapter)
      .maybeSingle();

    // fetch curriculum table_id
    let curriculumId=null;
    try{
      const url=`https://ready4exam.github.io/ready4exam-class-${meta.class_name}/js/curriculum.js?v=${Date.now()}`;
      const mod=await import(url);
      const curriculum=mod.curriculum;
      const bookData=curriculum?.[meta.subject]?.[meta.book]||[];
      const row=bookData.find(x=>x.chapter_title===meta.chapter);
      curriculumId=row?.table_id??null;
    }catch{ curriculumId=null; }

    /*================================================================
       2️⃣ DECISION ENGINE — 100% Automatic
    =================================================================*/

    let MODE="";

    if(!usage && !curriculumId){ MODE="FIRST_BUILD"; }
    else if(!usage && curriculumId){ MODE="CURR_ONLY_REBUILD"; }
    else if(usage && !curriculumId){ MODE="LOG_ONLY_RESTORE_CURR"; }
    else if(usage && curriculumId===usage.table_name){ MODE="REFRESH"; }
    else if(usage && curriculumId!==usage.table_name){ MODE="MISMATCH_FIX"; }

    console.log("🧠 MODE =",MODE);

    /* ===========================
       3️⃣ Table Rebuild / Refresh
    ===========================*/
    await supabase.rpc("ensure_table_exists",{ table_name:table });
    await supabase.from(table).delete().neq("id",0);
    await supabase.from(table).insert(csv.map(r=>({
      difficulty:r.difficulty, question_type:r.question_type,
      question_text:r.question_text?.trim(), scenario_reason_text:r.scenario_reason_text?.trim(),
      option_a:r.option_a?.trim(), option_b:r.option_b?.trim(),
      option_c:r.option_c?.trim(), option_d:r.option_d?.trim(),
      correct_answer_key:r.correct_answer_key?.trim()?.toUpperCase()
    })));

    /* ===========================
       4️⃣ Curriculum Auto-Sync
    ===========================*/
    if(MODE!=="REFRESH"){
      await updateCurriculumRow(meta,table);
    }

    /* ===========================
       5️⃣ Logs Insert / Update
    ===========================*/
    if(!usage){
      await supabase.from("usage_logs").insert({
        class_name:meta.class_name,subject:meta.subject,book:meta.book,
        chapter:meta.chapter,table_name:table,
        inserted_count:csv.length,refresh_count:0,updated_at:new Date()
      });
      console.log("🟢 NEW LOG CREATED");
    }
    else{
      await supabase.from("usage_logs").update({
        inserted_count:csv.length,
        refresh_count:usage.refresh_count+1,
        updated_at:new Date()
      }).eq("id",usage.id);
      console.log("🟡 REFRESH COUNT +1");
    }

    /* ===========================
       6️⃣ Respond Back
    ===========================*/
    return res.status(200).json({
      ok:true,table,mode:MODE,
      message:{
        FIRST_BUILD:"🟢 First creation complete.",
        CURR_ONLY_REBUILD:"🟡 Fixed: curriculum had id but no logs.",
        LOG_ONLY_RESTORE_CURR:"🟡 Curriculum restored using log history.",
        REFRESH:"🔄 Table refreshed successfully.",
        MISMATCH_FIX:"🟠 Auto-corrected mismatch + refreshed.",
      }[MODE]
    });

  }catch(e){
    console.error("❌",e);
    res.status(500).json({error:e.message});
  }
}
