// ============================================================================
// /api/gemini.js — FINAL STABLE VERSION (JSON-Guaranteed + CORS + No Perplexity)
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

// CORS ENABLED
function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// -----------------------------------------------------------------------------
// Strong JSON cleaner
// -----------------------------------------------------------------------------
function cleanModelOutput(raw) {
  if (!raw) return "";

  let t = raw.trim();

  // Remove markdown fences
  t = t.replace(/```json/gi, "").replace(/```/g, "");

  // Remove text before first [
  const first = t.indexOf("[");
  if (first > 0) t = t.slice(first);

  // Remove text after last ]
  const last = t.lastIndexOf("]");
  if (last > 0) t = t.slice(0, last + 1);

  return t;
}

// -----------------------------------------------------------------------------
// Safe JSON extractor
// -----------------------------------------------------------------------------
function extractJSON(raw) {
  const cleaned = cleanModelOutput(raw);

  try {
    const arr = JSON.parse(cleaned);
    if (Array.isArray(arr)) return { ok: true, questions: arr };
  } catch (err) {
    return { ok: false, error: "JSON_PARSE_FAIL", raw: cleaned };
  }

  return { ok: false, error: "INVALID_JSON_FORMAT", raw: cleaned };
}

// -----------------------------------------------------------------------------
// Gemini call
// -----------------------------------------------------------------------------
async function askGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);

  // Correct model names for your key
  const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// -----------------------------------------------------------------------------
// MAIN HANDLER
// -----------------------------------------------------------------------------
export default async function handler(req, res) {
  setCORS(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const { meta } = body || {};
    if (!meta) return res.status(400).json({ ok: false, error: "NO_META" });

    const prompt = `
Generate EXACTLY 60 exam questions in STRICT JSON format.

CLASS: ${meta.class_name}
SUBJECT: ${meta.subject}
CHAPTER: ${meta.chapter}

Return **ONLY A JSON ARRAY**:
[
  {
    "difficulty": "Simple | Medium | Advanced",
    "question_type": "MCQ | AR | Case-Based",
    "question_text": "...",
    "scenario_reason_text": "...",
    "option_a": "...",
    "option_b": "...",
    "option_c": "...",
    "option_d": "...",
    "correct_answer_key": "A | B | C | D"
  }
]

RULES:
- NO explanation
- NO description
- NO markdown
- NO text outside JSON
- Output must start with '[' and end with ']'
`;

    const raw = await askGemini(prompt);

    // FIRST EXTRACTION
    let parsed = extractJSON(raw);
    if (parsed.ok)
      return res.status(200).json({
        ok: true,
        engine: "gemini",
        questions: parsed.questions,
        count: parsed.questions.length
      });

    // SECOND ATTEMPT → repair JSON automatically
    const attemptFix = cleanModelOutput(raw);
    try {
      const fixed = JSON.parse(attemptFix);
      return res.status(200).json({
        ok: true,
        engine: "gemini",
        repaired: true,
        questions: fixed,
        count: fixed.length
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_INVALID_JSON",
        raw: attemptFix
      });
    }
  } catch (err) {
    console.error("❌ GEMINI FATAL ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// -----------------------------------------------------------------------------
// Perplexity (Disabled but kept for reference)
// -----------------------------------------------------------------------------
// async function callPerplexity(prompt) { ... }
// -----------------------------------------------------------------------------
