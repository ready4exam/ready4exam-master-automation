// ============================================================================
// /api/gemini.js — UNIVERSAL PRODUCTION VERSION (LENIENT MCQ MODE)
// ============================================================================
// CHANGES APPLIED:
// - Relaxed prompt (10–25 MCQs, no exact split)
// - JSON-only output rules
// - Success threshold lowered (>= 8)
// - HARD FAIL if zero questions (Option A)
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

    // --------------------------------------------------
    // RELAXED, JSON-ONLY RULES (CRITICAL CHANGE)
    // --------------------------------------------------
    const rules = `
STRICT RULES:
- Output ONLY a valid JSON array
- Output MUST start with '[' and end with ']'
- Do NOT include explanations or text outside JSON
- Do NOT include markdown
`;

    const prompt = `
Generate MCQ questions for ${board}
Class: ${rawClass}
Subject: ${meta.subject}
Chapter: ${meta.chapter}

Requirements:
- Generate between 10 and 25 MCQ questions
- Use a mix of Simple, Medium, and Advanced
- Each question must have exactly 4 options (A, B, C, D)
- correct_answer_key must be one of A, B, C, or D

${rules}
FORMAT: ${baseFormat}
`;

    let questions = [];

    // --------------------------------------------------
    // RETRY LOOP
    // --------------------------------------------------
    for (let attempt = 1; attempt <= 3; attempt++) {
      questions = await getBatch(prompt);

      if (questions.length >= 8) {
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
    // OPTION A — HARD FAIL ON ZERO QUESTIONS
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
