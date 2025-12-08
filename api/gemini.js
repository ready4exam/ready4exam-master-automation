// ============================================================================
// /api/gemini.js — NodeJS Runtime + Full CORS + Stable JSON Extractor
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// ---------------------------------------------------------
// CORS
// ---------------------------------------------------------
function applyCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

// ---------------------------------------------------------
// JSON Extractor
// ---------------------------------------------------------
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
  } catch (e) {
    return { ok: false, error: "INVALID_JSON_PARSE", raw: text };
  }
}

// ---------------------------------------------------------
// Gemini Call
// ---------------------------------------------------------
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });
  const out = await model.generateContent(prompt);

  return out.response.text();
}

// ---------------------------------------------------------
// Perplexity Call (Safe)
// ---------------------------------------------------------
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

  if (!res.ok) {
    const text = await res.text();
    console.error("❌ Perplexity raw error:", text);
    throw new Error("PERPLEXITY_HTTP_ERROR");
  }

  const data = await res.json().catch(err => {
    console.error("❌ Perplexity returned non-JSON:", err);
    throw new Error("PERPLEXITY_INVALID_JSON_RESPONSE");
  });

  return data?.choices?.[0]?.message?.content || "";
}

// ---------------------------------------------------------
// Main Handler
// ---------------------------------------------------------
export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta) {
      return res.status(400).json({ ok: false, error: "NO_META" });
    }

    const prompt = `
Generate 60 questions for:
Class ${meta.class_name}
Subject: ${meta.subject}
Chapter: ${meta.chapter}

Return ONLY a JSON array of question objects.
No markdown. No explanation.
`;

    const start = Date.now();

    // ---------------- GEMINI (3 tries) ----------------
    for (let i = 1; i <= 3; i++) {
      try {
        const out = await callGemini(prompt);
        const parsed = extractJSON(out);

        if (parsed.ok) {
          return res.status(200).json({
            ok: true,
            engine: "gemini",
            geminiAttempts: i,
            questions: parsed.questions,
            count: parsed.questions.length,
            durationMs: Date.now() - start
          });
        }
      } catch (err) {
        if (String(err).includes("quota")) break;
      }
    }

    // ---------------- PERPLEXITY (3 tries) ----------------
    for (let i = 1; i <= 3; i++) {
      const out = await callPerplexity(prompt);
      const parsed = extractJSON(out);

      if (parsed.ok) {
        return res.status(200).json({
          ok: true,
          engine: "perplexity",
          geminiAttempts: 3,
          questions: parsed.questions,
          count: parsed.questions.length,
          durationMs: Date.now() - start
        });
      }
    }

    return res.status(500).json({ ok: false, error: "PERPLEXITY_INVALID_JSON" });

  } catch (err) {
    console.error("❌ GEMINI ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
