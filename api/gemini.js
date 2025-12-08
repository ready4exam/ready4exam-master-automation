// ============================================================================
// /api/gemini.js — Node Runtime + CORS + Gemini Only (Perplexity commented)
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

// -----------------------------------------------
// ENV KEYS
// -----------------------------------------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;   // (commented)

// -----------------------------------------------
// CORS
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
// JSON EXTRACTOR
// -----------------------------------------------
function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let text = raw.trim();

  // Remove ```json fences
  text = text.replace(/```json/gi, "").replace(/```/g, "");

  // Remove BEFORE first {
  const first = text.indexOf("{");
  if (first > 0) text = text.slice(first);

  // Balance braces
  const opens = (text.match(/{/g) || []).length;
  const closes = (text.match(/}/g) || []).length;
  if (opens > closes) text += "}".repeat(opens - closes);

  try {
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) return { ok: true, questions: parsed };
    if (Array.isArray(parsed.questions)) return { ok: true, questions: parsed.questions };

    return { ok: false, error: "INVALID_JSON_SHAPE", raw: text };
  } catch (err) {
    return { ok: false, error: "INVALID_JSON_PARSE", raw: text };
  }
}

// -----------------------------------------------
// GEMINI CALL
// -----------------------------------------------
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// -----------------------------------------------
// PERPLEXITY CALL (COMMENTED OUT - NOT USED)
// -----------------------------------------------
/*
async function callPerplexity(prompt) {
  const url = "https://api.perplexity.ai/chat/completions";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "sonar-pro",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const json = await res.json();
    return json?.choices?.[0]?.message?.content || "";
  } catch (err) {
    return "";
  }
}
*/

// -----------------------------------------------
// MAIN HANDLER
// -----------------------------------------------
export default async function handler(req, res) {
  // ---------------------- CORS ----------------------
  const origin = req.headers.origin || "*";
  const h = corsHeaders(origin);
  Object.entries(h).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    // --------------------- Read Body ------------------------
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta) {
      return res.status(400).json({ ok: false, error: "NO_META" });
    }

    // --------------------- Build Prompt ---------------------
    const prompt = `
      Generate exactly 60 high-quality questions for:
      Class: ${meta.class_name}
      Subject: ${meta.subject}
      Chapter: ${meta.chapter}

      Return ONLY a JSON array:
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

      NO markdown.
      NO explanations.
      NO notes.
      Only valid JSON.
    `;

    const start = Date.now();

    // ----------------------------------------------------
    // 1️⃣ GEMINI ONLY (3 Attempts)
    // ----------------------------------------------------
    for (let i = 1; i <= 3; i++) {
      try {
        const raw = await callGemini(prompt);
        const parsed = extractJSON(raw);

        if (parsed.ok) {
          return res.status(200).json({
            ok: true,
            engine: "gemini",
            attempts: i,
            questions: parsed.questions,
            count: parsed.questions.length,
            durationMs: Date.now() - start
          });
        }
      } catch (err) {
        // Continue to next attempt
      }
    }

    // ----------------------------------------------------
    // 2️⃣ PERPLEXITY FALLBACK DISABLED
    // ----------------------------------------------------
    /*
    for (let i = 1; i <= 3; i++) {
      const raw = await callPerplexity(prompt);
      const parsed = extractJSON(raw);

      if (parsed.ok) {
        return res.status(200).json({
          ok: true,
          engine: "perplexity",
          attempts: i,
          questions: parsed.questions,
          count: parsed.questions.length,
          durationMs: Date.now() - start
        });
      }
    }
    */

    // ----------------------------------------------------
    // 3️⃣ TOTAL FAILURE
    // ----------------------------------------------------
    return res.status(500).json({
      ok: false,
      error: "GEMINI_INVALID_JSON"
    });

  } catch (err) {
    console.error("❌ GEMINI ROUTE ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
