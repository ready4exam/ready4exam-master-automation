// ============================================================================
// /api/gemini.js — FINAL VERSION (gemini-2.5-flash + CORS + JSON Extraction)
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// -------------------------------------------------------
// CORS HEADERS
// -------------------------------------------------------
function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

// -------------------------------------------------------
// JSON Extractor (Stable)
// -------------------------------------------------------
function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let text = raw.trim();

  // Remove markdown
  text = text.replace(/```json/gi, "").replace(/```/g, "");

  const first = text.indexOf("{");
  if (first > 0) text = text.slice(first);

  const opens = (text.match(/{/g) || []).length;
  const closes = (text.match(/}/g) || []).length;

  if (opens > closes) {
    text += "}".repeat(opens - closes);
  }

  try {
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) return { ok: true, questions: parsed };
    if (Array.isArray(parsed.questions)) return { ok: true, questions: parsed.questions };

    return { ok: false, error: "INVALID_JSON_SHAPE" };
  } catch (err) {
    return { ok: false, error: "INVALID_JSON_PARSE" };
  }
}

// -------------------------------------------------------
// Gemini API Caller (gemini-2.5-flash)
// -------------------------------------------------------
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);

  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash"   // ★ IMPORTANT CORRECT MODEL
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// -------------------------------------------------------
// Optional Perplexity fallback (COMMENTED OUT)
// -------------------------------------------------------
/*
async function callPerplexity(prompt) {
  const url = "https://api.perplexity.ai/chat/completions";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
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
    console.error("❌ Perplexity error:", err);
    return "";
  }
}
*/

// -------------------------------------------------------
// MAIN HANDLER
// -------------------------------------------------------
export default async function handler(req, res) {
  setCORS(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "ONLY_POST_ALLOWED" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const meta = body?.meta;
    if (!meta) {
      return res.status(400).json({ ok: false, error: "NO_META" });
    }

    // ---------------------------------------------------
    // Prompt
    // ---------------------------------------------------
    const prompt = `
Generate 60 high-quality structured MCQs for:

Class: ${meta.class_name}
Subject: ${meta.subject}
Group/Book: ${meta.group || meta.book || ""}
Chapter: ${meta.chapter}

RETURN ONLY JSON ARRAY. NO TEXT. NO EXPLANATION.

FORMAT:
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

    // ---------------------------------------------------
    // 1️⃣ Gemini (3 attempts)
    // ---------------------------------------------------
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
        console.log("Gemini attempt failed:", err);
      }
    }

    // ---------------------------------------------------
    // 2️⃣ OPTIONAL Perplexity (DISABLED)
    // ---------------------------------------------------
    /*
    for (let i = 1; i <= 2; i++) {
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

    // ---------------------------------------------------
    // 3️⃣ FAILURE
    // ---------------------------------------------------
    return res.status(500).json({
      ok: false,
      error: "GEMINI_INVALID_JSON"
    });

  } catch (err) {
    console.error("❌ GEMINI ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
