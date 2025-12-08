// /api/gemini.js — FINAL NODE VERSION (Full CORS + Gemini Retry + Perplexity Fallback)
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// ======================================================================
// JSON EXTRACTOR
// ======================================================================
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
    return { ok: true, questions: parsed };

  } catch (e) {
    return {
      ok: false,
      error: "INVALID_JSON_PARSE",
      raw: text
    };
  }
}

// ======================================================================
// GEMINI CALL
// ======================================================================
async function callGemini(prompt) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ======================================================================
// PERPLEXITY CALL
// ======================================================================
async function callPerplexity(prompt) {
  const url = "https://api.perplexity.ai/chat/completions";

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

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// ======================================================================
// MAIN HANDLER (Node + CORS)
// ======================================================================
export default async function handler(req, res) {
  // ---------------- CORS ----------------
  const origin = req.headers.origin || "*";

  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));

  // Force allow GitHub Pages
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Only POST allowed" });
  }

  try {
    const { meta } =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const prompt = `
      Generate 60 high-quality questions for:
      Class ${meta.class_name}
      Subject: ${meta.subject}
      Chapter: ${meta.chapter}

      Return ONLY JSON array:
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

    // ---------------- GEMINI (3 attempts) ----------------
    for (let i = 1; i <= 3; i++) {
      try {
        const out = await callGemini(prompt);
        const parsed = extractJSON(out);

        if (parsed.ok) {
          return res.status(200).json({
            ok: true,
            engine: "gemini",
            geminiAttempts: i,
            durationMs: Date.now() - start,
            questions: parsed.questions,
            count: parsed.questions.length
          });
        }
      } catch (err) {
        if (String(err).includes("quota")) break;
      }
    }

    // ---------------- PERPLEXITY FALLBACK (3 attempts) ----------------
    for (let i = 1; i <= 3; i++) {
      const out = await callPerplexity(prompt);
      const parsed = extractJSON(out);

      if (parsed.ok) {
        return res.status(200).json({
          ok: true,
          engine: "perplexity",
          geminiAttempts: 3,
          durationMs: Date.now() - start,
          questions: parsed.questions,
          count: parsed.questions.length
        });
      }
    }

    return res.status(500).json({
      ok: false,
      error: "PERPLEXITY_INVALID_JSON"
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
