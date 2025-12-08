// ============================================================================
// /api/gemini.js — FINAL PRODUCTION VERSION (NodeJS + Ultra JSON Extractor)
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ============================================================================
//  STRONG JSON EXTRACTOR (Bulletproof)
// ============================================================================
function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let text = raw.trim();

  // Remove markdown fences
  text = text.replace(/```json/gi, "").replace(/```/g, "");

  // Extract only the JSON array
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");

  if (first !== -1 && last !== -1) {
    text = text.slice(first, last + 1);
  }

  // Remove trailing commas
  text = text.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");

  // Fix fancy quotes
  text = text.replace(/‘|’/g, "'").replace(/“|”/g, '"');

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { ok: true, questions: parsed };
    if (Array.isArray(parsed.questions)) return { ok: true, questions: parsed.questions };
    return { ok: false, error: "INVALID_JSON_SHAPE", raw: text };
  } catch (e) {
    return { ok: false, error: "INVALID_JSON_PARSE", raw: text };
  }
}

// ============================================================================
//  GEMINI CALL
// ============================================================================
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });

  const out = await model.generateContent(prompt);
  return out.response.text();
}

// ============================================================================
//  MAIN HANDLER — WITH CORS
// ============================================================================
export default async function handler(req, res) {
  // ---------------- CORS HEADERS ----------------
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "ONLY_POST_ALLOWED" });
  }

  try {
    // Parse body
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta) {
      return res.status(400).json({ ok: false, error: "NO_META_PROVIDED" });
    }

    // ========================================================================
    //  STRONG PROMPT — Forces JSON-ONLY output (Fixes invalid JSON issues)
    // ========================================================================
    const prompt = `
YOU MUST OUTPUT ONLY A VALID JSON ARRAY. 
NO explanations, NO markdown, NO headings, NO extra text.

Generate EXACTLY 60 questions for:

Class: ${meta.class_name}
Subject: ${meta.subject}
Chapter: ${meta.chapter}

Return ONLY the array below:

[
  {
    "difficulty": "Simple",
    "question_type": "MCQ",
    "question_text": "....",
    "scenario_reason_text": "....",
    "option_a": "....",
    "option_b": "....",
    "option_c": "....",
    "option_d": "....",
    "correct_answer_key": "A"
  }
]

If you output ANYTHING outside the array → you FAIL.
    `;

    const start = Date.now();

    // ========================================================================
    //  GEMINI ATTEMPTS (3 tries)
    // ========================================================================
    for (let i = 1; i <= 3; i++) {
      try {
        const raw = await callGemini(prompt);
        const parsed = extractJSON(raw);

        if (parsed.ok) {
          return res.status(200).json({
            ok: true,
            engine: "gemini",
            attempts: i,
            geminiAttempts: i,
            questions: parsed.questions,
            count: parsed.questions.length,
            durationMs: Date.now() - start
          });
        }
      } catch (e) {
        console.error("Gemini attempt failed:", e);
      }
    }

    return res.status(500).json({
      ok: false,
      error: "GEMINI_INVALID_JSON"
    });

  } catch (err) {
    console.error("❌ GEMINI FATAL ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
