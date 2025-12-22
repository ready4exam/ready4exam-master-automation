// ============================================================================
// /api/gemini.js — UNIVERSAL PRODUCTION VERSION (20 MCQ ONLY)
// ============================================================================
// BEHAVIOR:
// - Generates ONLY 20 MCQ questions
// - No AR / No Case-Based
// - HARD FAIL if zero questions
// - JSON-safe prompting
// - Model failover chain
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

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// --------------------------------------------------------------------
// SINGLE BATCH GENERATOR
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

    // --------------------------------------------------
    // MCQ FORMAT ONLY
    // --------------------------------------------------
    const baseFormat = `[
      {
        "difficulty": "Simple|Medium|Advanced",
        "question_type": "MCQ",
        "question_text": "",
        "scenario_reason_text": "",
        "option_a": "",
        "option_b": "",
        "option_c": "",
        "option_d": "",
        "correct_answer_key": "A"
      }
    ]`;

    const rules = `
STRICT RULES:
- Generate ONLY MCQ questions
- Generate EXACTLY 20 questions
- Output MUST be valid JSON
- Output MUST start with '[' and end with ']'
- Do NOT add explanations
- Do NOT add markdown
- Do NOT add comments
- Do NOT add trailing commas
`;

    const prompt = `
Generate questions for ${board}
Class: ${rawClass}
Subject: ${meta.subject}
Chapter: ${meta.chapter}

Create EXACTLY 20 MCQ questions:
- 8 Simple
- 7 Medium
- 5 Advanced

${rules}
FORMAT: ${baseFormat}
`;

    let questions = [];

    // --------------------------------------------------
    // RETRY LOOP
    // --------------------------------------------------
    for (let attempt = 1; attempt <= 3; attempt++) {
      questions = await getBatch(prompt);

      if (questions.length >= 15) {
        return res.status(200).json({
          ok: true,
          board,
          count: questions.length,
          attempts: attempt,
          questions
        });
      }
    }

    // --------------------------------------------------
    // HARD FAIL IF ZERO QUESTIONS
    // --------------------------------------------------
    if (questions.length === 0) {
      return res.status(500).json({
        ok: false,
        error: "Gemini returned zero valid MCQ questions after retries"
      });
    }

    // --------------------------------------------------
    // PARTIAL SUCCESS (NON-ZERO)
    // --------------------------------------------------
    return res.status(200).json({
      ok: true,
      board,
      count: questions.length,
      partial: true,
      questions
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
