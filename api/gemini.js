// /api/gemini.js — Node Runtime + Full CORS Support
import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

// ------------------------------------------------------
// CORS HEADERS (Required for GitHub Pages frontend)
// ------------------------------------------------------
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

// ------------------------------------------------------
// API KEYS
// ------------------------------------------------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// ------------------------------------------------------
// JSON Extractor
// ------------------------------------------------------
function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let text = raw.trim();
  text = text.replace(/```json/gi, "").replace(/```/g, "");

  const first = text.indexOf("{");
  if (first > 0) text = text.slice(first);

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

// ------------------------------------------------------
// Gemini Call
// ------------------------------------------------------
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });
  const out = await model.generateContent(prompt);
  return out.response.text();
}

// ------------------------------------------------------
// Perplexity Call
// ------------------------------------------------------
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

// ------------------------------------------------------
// MAIN HANDLER — NOW WITH CORS
// ------------------------------------------------------
export default async function handler(req, res) {
  // Apply CORS for all requests
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Only POST allowed" });
  }

  try {
    // Parse frontend payload
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta) {
      return res.status(400).json({ ok: false, error: "NO_META" });
    }

    const prompt = `
      Generate 60 high-quality questions for:
      Class: ${meta.class_name}
      Subject: ${meta.subject}
      Chapter: ${meta.chapter}

      Return ONLY RAW JSON array:
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

    // 1️⃣ Try Gemini (3 attempts)
    for (let i = 1; i <= 3; i++) {
      try {
        const raw = await callGemini(prompt);
        const parsed = extractJSON(raw);

        if (parsed.ok) {
          return res.status(200).json({
            ok: true,
            engine: "gemini",
            attempts: i,
            geminiAttempts: i,
            questions: parsed.questions,
            count: parsed.questions.length,
            durationMs: Date.now() - start
          });
        }
      } catch (e) {
        if (String(e).includes("quota")) break;
      }
    }

    // 2️⃣ Perplexity fallback (3 attempts)
    for (let i = 1; i <= 3; i++) {
      const raw = await callPerplexity(prompt);
      const parsed = extractJSON(raw);

      if (parsed.ok) {
        return res.status(200).json({
          ok: true,
          engine: "perplexity",
          attempts: i,
          geminiAttempts: 3,
          questions: parsed.questions,
          count: parsed.questions.length,
          durationMs: Date.now() - start
        });
      }
    }

    // 3️⃣ Total failure
    return res.status(500).json({
      ok: false,
      error: "PERPLEXITY_INVALID_JSON"
    });

  } catch (err) {
    console.error("❌ GEMINI ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
