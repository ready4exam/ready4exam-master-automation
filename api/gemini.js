// ============================================================================
//  /api/gemini.js — FINAL PRODUCTION VERSION (CORS + 2.5-FLASH + JSON SAFE)
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

// API Keys
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ============================================================================
//  CORS HEADERS
// ============================================================================
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://ready4exam.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

function sendCORS(res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
}

// ============================================================================
//  JSON Extractor (very safe, handles markdown, text garbage, etc.)
// ============================================================================
function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let text = raw.trim();

  // Remove markdown fences
  text = text.replace(/```json/gi, "").replace(/```/g, "");

  // Cut everything before first {
  const first = text.indexOf("{");
  if (first > 0) text = text.slice(first);

  // Brace balancing
  const open = (text.match(/{/g) || []).length;
  const close = (text.match(/}/g) || []).length;
  if (open > close) text += "}".repeat(open - close);

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
//  GEMINI CALL (using correct model: gemini-2.5-flash)
// ============================================================================
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);

  // IMPORTANT — YOUR FREE TIER SUPPORTS ONLY THIS MODEL
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash"
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ============================================================================
//  (OPTIONAL) Perplexity Backup — Disabled But Kept
// ============================================================================
// async function callPerplexity(prompt) {
//   return "";  // disabled for now
// }

// ============================================================================
//  MAIN HANDLER
// ============================================================================
export default async function handler(req, res) {
  sendCORS(res);

  // Handle OPTIONS
  if (req.method === "OPTIONS") return res.status(200).end();

  // Allow ONLY POST
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Only POST allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta) {
      return res.status(400).json({ ok: false, error: "NO_META" });
    }

    // ========================================================================
    // BUILD PROMPT
    // ========================================================================
    const prompt = `
Generate 60 high-quality exam questions for:

Class: ${meta.class_name}
Subject: ${meta.subject}
Chapter: ${meta.chapter}

Return ONLY pure JSON array (no explanation, no markdown):

[
  {
    "difficulty": "Simple|Medium|Advanced",
    "question_type": "MCQ|AR|Case-Based",
    "question_text": "...",
    "scenario_reason_text": "...",
    "option_a": "...",
    "option_b": "...",
    "option_c": "...",
    "option_d": "...",
    "correct_answer_key": "A|B|C|D"
  }
]
`;

    const start = Date.now();

    // ========================================================================
    // 1️⃣ GEMINI — 3 Attempts
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
        console.error("Gemini attempt failed:", err);

        // Specific: quota exceeded → stop retrying
        if (String(err).includes("quota")) break;
      }
    }

    // ========================================================================
    // 2️⃣ PERPLEXITY DISABLED (for safety)
    // ========================================================================
    // const backup = await callPerplexity(prompt);
    // return res.status(500).json({ ok: false, error: "PERPLEXITY_DISABLED" });

    // ========================================================================
    // FAILURE
    // ========================================================================
    return res.status(500).json({
      ok: false,
      error: "GEMINI_INVALID_JSON"
    });

  } catch (err) {
    console.error("❌ GEMINI ROUTE ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
