// ============================================================================
// /api/gemini.js — UNIVERSAL PRODUCTION VERSION (OPTION A ENFORCED)
// ============================================================================
// BEHAVIOR:
// - Accepts partial batches
// - Rejects ZERO-question output (HARD FAIL)
// - JSON-safe prompting
// - Model failover chain
// - No silent success
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --------------------------------------------------------------------
// MODEL FAILOVER CHAIN
// --------------------------------------------------------------------
const MODEL_CHAIN = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest"
];

// --------------------------------------------------------------------
// AGGRESSIVE JSON CLEANER
// --------------------------------------------------------------------
function extractJSON(raw) {
  if (!raw) return [];

  try {
    let text = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .replace(/[\u0000-\u001F]+/g, " ")
      .replace(/“|”/g, '"')
      .replace(/‘|’/g, "'")
      .trim();

    const first = text.indexOf("[");
    const last = text.lastIndexOf("]");

    if (first === -1 || last === -1) return [];

    text = text.slice(first, last + 1);
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.questions)) return parsed.questions;

    return [];
  } catch {
    return [];
  }
}

// --------------------------------------------------------------------
// SINGLE BATCH GENERATOR (WITH MODEL FAILOVER)
// --------------------------------------------------------------------
async function getBatch(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);

  for (const modelName of MODEL_CHAIN) {
    try {
      const model = client.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const questions = extractJSON(text);

      if (questions.length > 0) return questions;
    } catch {
      continue;
    }
  }

  return [];
}

// --------------------------------------------------------------------
// MAIN HANDLER
// --------------------------------------------------------------------
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "POST only" });

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const meta = body?.meta;
    if (!meta)
      return res.status(400).json({ ok: false, error: "Missing meta" });

    const rawClass = meta.class_name || "";
    const isCBSE = !isNaN(rawClass);

    const board =
      !isCBSE && rawClass.includes("Telangana")
        ? "Telangana State Board (SCERT)"
        : "CBSE / NCERT";

    const baseFormat = `[
      {
        "difficulty": "Simple|Medium|Advanced",
        "question_type": "MCQ|AR|Case-Based",
        "question_text": "",
        "scenario_reason_text": "",
        "option_a": "",
        "option_b": "",
        "option_c": "",
        "option_d": "",
        "correct_answer_key": "A"
      }
    ]`;

    // --------------------------------------------------
    // STRICT JSON RULES (CRITICAL)
    // --------------------------------------------------
    const rules = `
STRICT RULES:
- Output MUST be valid JSON
- Output MUST start with '[' and end with ']'
- Do NOT add explanations
- Do NOT add markdown
- Do NOT add comments
- Do NOT add trailing commas
`;

    const prompt1 = `
Generate questions for ${board}
Class: ${rawClass}
Subject: ${meta.subject}
Chapter: ${meta.chapter}

Create:
- 15 Simple MCQs
- 15 Medium MCQs

${rules}
FORMAT: ${baseFormat}
`;

    const prompt2 = `
Generate questions for ${board}
Class: ${rawClass}
Subject: ${meta.subject}
Chapter: ${meta.chapter}

Create:
- 10 Advanced MCQs
- 10 Assertion-Reason questions
- 10 Case-Based questions

For AR and Case-Based:
- scenario_reason_text MUST NOT be empty

${rules}
FORMAT: ${baseFormat}
`;

    let finalQuestions = [];

    // --------------------------------------------------
    // GLOBAL RETRY LOOP
    // --------------------------------------------------
    for (let attempt = 1; attempt <= 3; attempt++) {
      const [b1, b2] = await Promise.all([
        getBatch(prompt1),
        getBatch(prompt2)
      ]);

      finalQuestions = [...b1, ...b2].filter(Boolean);

      // SUCCESS THRESHOLD (RELAXED BUT NON-ZERO)
      if (finalQuestions.length >= 25) {
        return res.status(200).json({
          ok: true,
          board,
          count: finalQuestions.length,
          attempts: attempt,
          partial: finalQuestions.length < 40,
          questions: finalQuestions
        });
      }
    }

    // --------------------------------------------------
    // OPTION A — HARD FAIL ON ZERO QUESTIONS
    // --------------------------------------------------
    if (finalQuestions.length === 0) {
      return res.status(500).json({
        ok: false,
        error: "Gemini returned zero valid questions after retries"
      });
    }

    // --------------------------------------------------
    // PARTIAL SUCCESS (NON-ZERO)
    // --------------------------------------------------
    return res.status(200).json({
      ok: true,
      board,
      count: finalQuestions.length,
      partial: true,
      questions: finalQuestions
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
