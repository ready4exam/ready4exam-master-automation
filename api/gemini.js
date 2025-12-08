// ============================================================================
// /api/gemini.js — Node Runtime + CORS + Gemini Only (Perplexity Fully Disabled)
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;   // kept but unused

// -----------------------------------------------
// CORS HEADERS
// -----------------------------------------------
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true"
  };
}

// -----------------------------------------------
// JSON Extractor
// -----------------------------------------------
function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let text = raw.trim();
  text = text.replace(/```json/gi, "").replace(/```/g, "");

  const first = text.indexOf("{");
  if (first > 0) text = text.slice(first);

  const opens = (text.match(/{/g) || []).length;
  const closes = (text.match(/}/g) || []).length;
  if (opens > closes) text += "}".repeat(opens - closes);

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { ok: true, questions: parsed };
    if (Array.isArray(parsed.questions)) return { ok: true, questions: parsed.questions };
    return { ok: false, error: "INVALID_JSON_SHAPE", raw: text };
  } catch {
    return { ok: false, error: "INVALID_JSON_PARSE", raw: text };
  }
}

// -----------------------------------------------
// G
