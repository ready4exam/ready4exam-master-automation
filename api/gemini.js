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
// Gemini Call
// -----------------------------------------------
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// -----------------------------------------------
// Perplexity — kept but NEVER CALLED
// -----------------------------------------------
/*
async function callPerplexity(prompt) {
  // preserved but unused
}
*/

// -----------------------------------------------
// HANDLER — GEMINI ONLY
// -----------------------------------------------
export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || "*";
  Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta) return res.status(400).json({ ok: false, error: "NO_META" });

    const prompt = `
      Generate exactly 60 questions for:
      Class ${meta.class_name}
      Subject ${meta.subject}
      Chapter ${meta.chapter}

      Return ONLY JSON array.
      No markdown.
      No explanation.
    `;

    const start = Date.now();

    // -----------------------------
    // 1️⃣ Gemini (3 attempts)
    // -----------------------------
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
        console.log("Gemini attempt failed:", err.message);
      }
    }

    // ❌ NO PERPLEXITY ATTEMPT HERE — COMPLETELY REMOVED

    return res.status(500).json({
      ok: false,
      error: "GEMINI_INVALID_JSON"
    });

  } catch (err) {
    console.error("❌ GEMINI ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
