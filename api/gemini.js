// ============================================================================
// /api/gemini.js — FINAL PRODUCTION VERSION (Balanced Difficulty + Ultra JSON Extractor)
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

  // Extract only array [ ... ]
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");

  if (first !== -1 && last !== -1) {
    text = text.slice(first, last + 1);
  }

  // Remove trailing commas
  text = text.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");

  // Replace fancy quotes
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
  // CORS support
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "ONLY_POST_ALLOWED" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta) {
      return res.status(400).json({ ok: false, error: "NO_META_PROVIDED" });
    }

    // ============================================================================
    //  ⭐ FINAL PRODUCTION PROMPT — Balanced Difficulty, JSON-only
    // ============================================================================
    const prompt = `
YOU MUST OUTPUT ONLY A VALID JSON ARRAY.
NO explanations, NO markdown, NO headings, NO commentary.

Generate EXACTLY 60 NCERT-grade questions for:

Class: ${meta.class_name}
Subject: ${meta.subject}
Chapter: ${meta.chapter}

== JSON FORMAT (EVERY OBJECT MUST MATCH) ==
{
  "difficulty": "Simple" | "Medium" | "Advanced",
  "question_type": "MCQ" | "AR" | "Case-Based",
  "question_text": "...",
  "scenario_reason_text": "...",
  "option_a": "...",
  "option_b": "...",
  "option_c": "...",
  "option_d": "...",
  "correct_answer_key": "A" | "B" | "C" | "D"
}

== REQUIRED DISTRIBUTION ==
- 20 Simple
- 20 Medium
- 20 Advanced
- At least 10 must be AR or Case-Based

== RULES ==
- MCQ MUST have scenario_reason_text = ""
- AR & Case-Based MUST have meaningful scenario_reason_text
- correct_answer_key MUST be uppercase A/B/C/D
- No duplicate questions
- No answers outside A/B/C/D

== OUTPUT ONLY ==
[
  { ... 60 QUESTIONS ... }
]
`;

    const start = Date.now();

    // ========================================================================
    //  GEMINI ATTEMPTS (3 tries)
    // ========================================================================
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const raw = await callGemini(prompt);
        const parsed = extractJSON(raw);

        if (parsed.ok) {
          return res.status(200).json({
            ok: true,
            engine: "gemini",
            attempts: attempt,
            questions: parsed.questions,
            count: parsed.questions.length,
            durationMs: Date.now() - start
          });
        }
      } catch (err) {
        console.error(`❌ Gemini attempt ${attempt} failed:`, err);
      }
    }

    // All attempts failed
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
