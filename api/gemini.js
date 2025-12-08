// ============================================================================
// /api/gemini.js — Node Runtime + CORS + Hardened JSON Extractor
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ============================================================================
// CORS HELPER
// ============================================================================
function applyCors(req, res) {
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

// ============================================================================
// Hardened JSON Extractor
// ============================================================================
function safeExtractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let text = String(raw).trim();

  // Strip HTML output (MOST IMPORTANT)
  text = text.replace(/<[^>]+>/g, "");

  // Remove Markdown fencing
  text = text.replace(/```json/gi, "").replace(/```/g, "");

  // Ensure JSON starts at [
  const idx = text.indexOf("[");
  if (idx >= 0) text = text.slice(idx);

  // Fix missing closing brackets
  const opens = (text.match(/\[/g) || []).length;
  const closes = (text.match(/\]/g) || []).length;
  if (opens > closes) text += "]".repeat(opens - closes);

  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) return { ok: true, questions: arr };
    return { ok: false, error: "NOT_ARRAY", raw: text };
  } catch (e) {
    return { ok: false, error: "INVALID_JSON", raw: text };
  }
}

// ============================================================================
// Gemini JSON Call (FORCED JSON MIME TYPE)
// ============================================================================
async function callGeminiJSON(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);

  const model = client.getGenerativeModel({
    model: "gemini-1.5-flash"
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json"
    }
  });

  return result.response.text();
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
export default async function handler(req, res) {
  // Enable CORS
  if (applyCors(req, res)) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta) {
      return res.status(400).json({ ok: false, error: "NO_META" });
    }

    const prompt = `
      Return ONLY a JSON array of exactly 60 MCQ/AR/Case questions.
      NO text before JSON. NO markdown. NO explanation.

      Each object must follow:

      {
        "difficulty": "Simple|Medium|Advanced",
        "question_type": "MCQ|AR|Case-Based",
        "question_text": "...",
        "scenario_reason_text": "",
        "option_a": "...",
        "option_b": "...",
        "option_c": "...",
        "option_d": "...",
        "correct_answer_key": "A|B|C|D"
      }
    `;

    // Call Gemini
    const raw = await callGeminiJSON(prompt);

    // Parse
    const parsed = safeExtractJSON(raw);

    if (!parsed.ok) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_INVALID_JSON",
        details: parsed.error
      });
    }

    return res.status(200).json({
      ok: true,
      engine: "gemini",
      questions: parsed.questions,
      count: parsed.questions.length
    });

  } catch (err) {
    console.error("❌ GEMINI ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "SERVER_ERROR"
    });
  }
}
