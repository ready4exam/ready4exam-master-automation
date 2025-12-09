// ============================================================================
// /api/gemini.js — FINAL PRODUCTION VERSION (Unbreakable JSON Mode)
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ============================================================================
//  STRONG JSON EXTRACTOR (Bulletproof + Sanitizers)
// ============================================================================

function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let text = raw.trim();

  // Remove markdown fences
  text = text.replace(/```json/gi, "").replace(/```/g, "");

  // Remove invisible control chars (0–31)
  text = text.replace(/[\u0000-\u001F]+/g, " ");

  // Collapse multiline into single-line
  text = text.replace(/\n+/g, " ");

  // Extract only content inside first [...] array
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
  } catch (err) {
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

    // ========================================================================
    // ⭐ UNBREAKABLE JSON-ONLY PROMPT
    // ========================================================================
    const prompt = `
You MUST output ONLY a valid JSON array.
NO text before it.
NO text after it.
NO markdown.
NO headings.
NO explanations.
NO commentary.

=== STRICT FORMAT (EVERY OBJECT MUST MATCH EXACTLY) ===
[
  {
    "difficulty": "Simple",
    "question_type": "MCQ",
    "question_text": "",
    "scenario_reason_text": "",
    "option_a": "",
    "option_b": "",
    "option_c": "",
    "option_d": "",
    "correct_answer_key": "A"
  }
]

=== CONTENT REQUIREMENTS ===
Generate EXACTLY 60 NCERT-grade questions for:
Class: ${meta.class_name}
Subject: ${meta.subject}
Chapter: ${meta.chapter}

=== DISTRIBUTION ===
- 20 Simple
- 20 Medium
- 20 Advanced
- At least 10 must be AR or Case-Based

=== RULES ===
- MCQ → scenario_reason_text = ""
- AR & Case-Based → scenario_reason_text must NOT be empty
- correct_answer_key MUST be "A", "B", "C", or "D"
- No nested objects
- No duplicate questions
- No multiline text inside any field
- No escape characters

=== FINAL INSTRUCTION ===
OUTPUT ONLY THE JSON ARRAY. NOTHING ELSE.
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

    // All attempts failed → return hard error
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
