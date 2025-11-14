// api/manageSupabase.js
// -------------------------------------------------------------
// Phase-3 Stable Version
// • Strict difficulty normalization
// • Strict question_type normalization
// • AR + Case-Based auto-correction
// • Full table replace (delete → insert)
// • Zero side-effects to existing flows
// -------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

// -------------------------------------------------------------
// NORMALIZATION HELPERS
// -------------------------------------------------------------
function normalizeDifficulty(d) {
  if (!d) return "Simple";

  d = d.toLowerCase().trim();

  if (["simple", "easy", "basic"].includes(d)) return "Simple";
  if (["medium", "med", "moderate"].includes(d)) return "Medium";
  if (["hard", "advanced", "adv"].includes(d)) return "Advanced";

  return "Simple"; // fallback
}

function normalizeType(t) {
  if (!t) return "MCQ";

  t = t.toLowerCase().trim();

  if (["mcq", "multiple", "objective"].includes(t)) return "MCQ";
  if (["ar", "assertionreason", "assertion-reason", "assertion_reason"].includes(t))
    return "AR";
  if (
    ["case", "case-based", "casebased", "case study", "casestudy"].includes(t)
  )
    return "Case-Based";

  return "MCQ";
}

// -------------------------------------------------------------
// AR Auto-correct (Assertion / Reason detection)
// -------------------------------------------------------------
function fixAR(question) {
  // If AR but Reason missing → extract from question_text
  if (question.question_type !== "AR") return question;

  let A = question.question_text || "";
  let R = question.scenario_reason_text || "";

  // Auto-extract if Gemini merged A & R
  if (!R && A.includes("Reason")) {
    const parts = A.split(/Reason[:\-]/i);
    A = parts[0].replace(/Assertion[:\-]/i, "").trim();
    R = parts[1]?.trim() || "";
  }

  // Standard AR options
  return {
    ...question,
    question_text: A,
    scenario_reason_text: R,
    option_a: "Both A and R are true, and R is the correct explanation of A.",
    option_b: "Both A and R are true, but R is not the correct explanation of A.",
    option_c: "A is true, but R is false.",
    option_d: "A is false, but R is true."
  };
}

// -------------------------------------------------------------
// Case-Based Auto-correct
// -------------------------------------------------------------
function fixCaseBased(question) {
  if (question.question_type !== "Case-Based") return question;

  // Ensure scenario present
  if (!question.scenario_reason_text) {
    question.scenario_reason_text =
      "Read the following case carefully and answer the question.";
  }

  return question;
}

// -------------------------------------------------------------
// MCQ Auto-correct
// -------------------------------------------------------------
function fixMCQ(question) {
  if (question.question_type !== "MCQ") return question;
  question.scenario_reason_text = "";
  return question;
}

// -------------------------------------------------------------
// APPLY NORMALIZATION PIPELINE
// -------------------------------------------------------------
function normalizeRow(row) {
  const q = { ...row };

  q.difficulty = normalizeDifficulty(q.difficulty);
  q.question_type = normalizeType(q.question_type);

  if (q.question_type === "AR") return fixAR(q);
  if (q.question_type === "Case-Based") return fixCaseBased(q);
  return fixMCQ(q);
}

// -------------------------------------------------------------
// MAIN HANDLER
// -------------------------------------------------------------
export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = {
    ...getCorsHeaders(origin),
    "Content-Type": "application/json",
  };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Only POST allowed" });

  try {
    const { meta, csv } = req.body;

    if (!meta || !csv)
      return res.status(400).json({
        ok: false,
        error: "Missing meta or csv in request body",
      });

    const supabase = createClient(
      process.env.SUPABASE_URL_11,
      process.env.SUPABASE_SERVICE_KEY_11
    );

    // -------------------------------------------------------------
    // Build table name (first + last word style)
    // -------------------------------------------------------------
    const slug = meta.chapter
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/);

    const table =
      slug.length === 1
        ? `${slug[0]}_quiz`
        : `${slug[0]}_${slug[slug.length - 1]}_quiz`;

    // -------------------------------------------------------------
    // Normalize rows
    // -------------------------------------------------------------
    const cleanRows = csv.map((row) => normalizeRow(row));

    // -------------------------------------------------------------
    // Replace-mode upload
    // -------------------------------------------------------------
    await supabase.from(table).delete().neq("id", 0);

    const { error: insertErr } = await supabase.from(table).insert(cleanRows);

    if (insertErr) throw insertErr;

    return res.status(200).json({
      ok: true,
      table,
      inserted: cleanRows.length,
    });
  } catch (err) {
    console.error("❌ manageSupabase.js error:", err);
    return res
      .status(500)
      .json({ ok: false, error: err.message || "Internal server error" });
  }
}
