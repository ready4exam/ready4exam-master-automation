// ============================================================================
// /api/gemini.js — FINAL PRODUCTION VERSION (PROTOCOL-LEVEL JSON)
// ============================================================================
// CORE FIX:
// - Uses responseMimeType: "application/json"
// - Stops relying on response.text()
// - Eliminates JSON drift, prose, markdown, truncation
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
// SINGLE BATCH GENERATOR (NATIVE JSON MODE)
// --------------------------------------------------------------------
async function getBatch(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);

  for (const modelName of MODEL_CHAIN) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json"
        }
      });

      const result = await model.generateContent(prompt);

      // Gemini guarantees JSON at protocol level
      const raw =
        result.response.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;

    } catch (err) {
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
    // MCQ-ONLY JSON SCHEMA (MODEL-ENFORCED)
    // --------------------------------------------------
    const baseFormat = `[
      {
        "difficulty": "Simple|Medium|Advanced",
        "question_type": "MCQ",
        "question_text": "string",
        "scenario_reason_text": "",
        "option_a": "string",
        "option_b": "string",
        "option_c": "string",
        "option_d": "string",
        "correct_answer_key": "A|B|C|D"
      }
    ]`;

    const prompt = `
You are an exam question generator.

Generate MCQ questions for:
Board: ${board}
Class: ${rawClass}
Subject: ${meta.subject}
Chapter: ${meta.chapter}

Requirements:
- Generate between 10 and 25 MCQ questions
- Use a mix of Simple, Medium, and Advanced
- Every question must have 4 options (A–D)
- correct_answer_key must be A, B, C, or D

Return ONLY a JSON array matching this format:
${baseFormat}
`;

    let questions = [];

    // --------------------------------------------------
    // RETRY LOOP (NOW MEANINGFUL)
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
    // OPTION A — HARD FAIL ON ZERO
    // --------------------------------------------------
    if (questions.length === 0) {
      return res.status(500).json({
        ok: false,
        error: "Gemini returned zero valid questions (protocol JSON enforced)"
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
