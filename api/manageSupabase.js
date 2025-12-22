import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";
import { transliterate as tr } from "transliteration";

export const config = { runtime: "nodejs" };

function normalizeDifficulty(d) {
  const val = (d || "").toLowerCase();
  if (val.includes("med")) return "Medium";
  if (val.includes("adv") || val.includes("hard")) return "Advanced";
  return "Simple";
}

function normalizeQType(t) {
  const val = (t || "").toLowerCase();
  if (val.includes("ar") || val.includes("assertion")) return "AR";
  if (val.includes("case")) return "Case-Based";
  return "MCQ";
}

function buildTableName(meta) {
  const rawClass = meta.class_name || "11";
  let suffix = "";
  let classNum = rawClass;

  // Universal Board Detection
  if (isNaN(rawClass)) {
    if (rawClass.includes("Telangana")) suffix = "tg";
    else if (rawClass.includes("ICSE")) suffix = "ic";
    else if (rawClass.includes("Karnataka")) suffix = "ka";
    classNum = rawClass.match(/\d+/)?.[0] || rawClass;
  }

  const sub = tr(meta.subject || "").toLowerCase().split(" ")[0] || "sub";
  const chap = tr(meta.chapter || "").toLowerCase();
  const words = chap.split(" ").filter(w => w.length > 2);
  const first = words[0] || "ch";
  const last = words[words.length - 1] || "x";
  
  const finalClass = suffix ? `${classNum}${suffix}` : classNum;
  return `${sub}_${first}_${last}_${finalClass}_quiz`.replace(/[^a-z0-9_]/g, "");
}

async function updateCurriculumForChapter(meta, tableName) {
  const owner = process.env.GITHUB_OWNER;
  const token = process.env.GITHUB_TOKEN;
  const repo = `ready4exam-class-${meta.class_name}`;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/js/curriculum.js`;

  try {
    const fileRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!fileRes.ok) return;
    const file = await fileRes.json();
    
    const content = Buffer.from(file.content, "base64").toString("utf8");
    const cleanJS = content.replace(/export\s+const\s+curriculum\s*=\s*/, "").replace(/export\s+default\s+curriculum\s*;?/g, "");
    
    // Safer eval for internal use
    const obj = eval(`(${cleanJS})`);

    // Recursive search to handle Nested (Telangana) and Flat (CBSE)
    let updated = false;
    const search = (node) => {
      if (Array.isArray(node)) {
        node.forEach(ch => {
          if (ch.chapter_title === meta.chapter) { ch.table_id = tableName; updated = true; }
        });
      } else if (typeof node === 'object' && node !== null) {
        Object.values(node).forEach(search);
      }
    };
    search(obj);

    if (!updated) return;

    const newContent = `export const curriculum = ${JSON.stringify(obj, null, 2)};\nexport default curriculum;\n`;
    
    await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `chore: link ${meta.chapter}`,
        content: Buffer.from(newContent).toString("base64"),
        sha: file.sha,
        branch: "main"
      })
    });
  } catch (e) {
    console.error("GitHub Update Error", e);
  }
}

export default async function handler(req, res) {
  Object.entries(getCorsHeaders(req.headers.origin || "*")).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  try {
    const { meta, csv } = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    
    const supabase = createClient(process.env.SUPABASE_URL_11, process.env.SUPABASE_SERVICE_KEY_11);
    const table = buildTableName(meta);

    // 1. Ensure Table & RLS
    await supabase.rpc("ensure_table_exists", { table_name: table });
    await supabase.rpc("exec_sql", { sql: `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.${table} TO anon, authenticated;` });

    // 2. Clean Insert
    await supabase.from(table).delete().neq("id", 0);
    
    const rows = csv.map(r => ({
      difficulty: normalizeDifficulty(r.difficulty),
      question_type: normalizeQType(r.question_type),
      question_text: r.question_text,
      scenario_reason_text: r.scenario_reason_text || "",
      option_a: r.option_a, option_b: r.option_b, option_c: r.option_c, option_d: r.option_d,
      correct_answer_key: r.correct_answer_key
    }));
    
    const { error } = await supabase.from(table).insert(rows);
    if (error) throw error;

    // 3. GitHub Update
    await updateCurriculumForChapter(meta, table);

    res.status(200).json({ ok: true, table_name: table, count: rows.length });

  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
