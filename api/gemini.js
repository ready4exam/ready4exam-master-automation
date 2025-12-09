// ============================================================================
// /api/gemini.js — Vercel-compliant version (Free-tier failover + CORS)
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

// ENV KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// MODEL FAILOVER LIST
const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite"
];

// ============================================================================
// JSON CLEANER
// ============================================================================
function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY" };

  let text = raw.trim()
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/[\u0000-\u001F]+/g, " ") // control chars
    .replace(/\n+/g, " ")
    .replace(/,\s*]/g, "]")
    .replace(/,\s*}/g, "}")
    .replace(/“|”/g, '"')
    .replace(/‘|’/g, "'");

  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first !== -1 && last !== -1) text = text.slice(first, last + 1);

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { ok: true, questions: parsed };
    if (Array.isArray(parsed.questions)) return { ok: true, questions: parsed.questions };
    return { ok: false, error: "INVALID_SHAPE", raw: text };
  } catch (err) {
    return { ok: false, error: "PARSE_FAIL", raw: text };
  }
}

// ============================================================================
// GEMINI FAILOVER ENGINE
// ============================================================================
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  let lastErr = null;

  for (const model of MODEL_CHAIN) {
    try {
      console.log("Trying model:", model);

      const g = client.getGenerativeModel({ model });
      const output = await g.generateContent(prompt);
      const text = output.response.text();

      if (!text || !text.trim()) {
        console.log("Empty output → next model");
        continue;
      }

      console.log("Success with model:", model);
      return text;

    } catch (err) {
      lastErr = err;
      const status = err?.status;

      console.log("Model error:", model, status, err.message);

      if (status === 429) {
        console.log("Quota exceeded → moving on");
        continue;
      }

      if (status === 500 || status === 503) {
        console.log("Retry same model after delay...");
        await new Promise(r => setTimeout(r, 700));
        continue;
      }

      continue;
    }
  }

  throw lastErr || new Error("All models failed");
}

// ============================================================================
// MAIN VERCEL HANDLER (REQUIRED FORMAT)
// ============================================================================
export default async function handler(req, res) {

  // --- CORS ---
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "ONLY_POST_ALLOWED" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta) {
      return res.status(400).json({ ok: false, error: "NO_META_PROVIDED" });
    }

    // --- PROMPT ---
    const prompt = `
Output ONLY a JSON array. No text outside the array.

[
  {
    "difficulty": "Simple",
    "question_type": "MCQ",
    "question_text": "",
    "scenario_reason_text": "",
    "option_a": "",
    "option_b": "",
    "option_c": "",
    "option_d": "",
    "correct_answer_key": "A"
  }
]

Generate 60 questions for:
Class: ${meta.class_name}
Subject: ${meta.subject}
Chapter: ${meta.chapter}
`;

    const start = Date.now();

    // --- TRY 3 TIMES ---
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log("Attempt:", attempt);

      try {
        const raw = await callGemini(prompt);
        const parsed = extractJSON(raw);

        if (parsed.ok) {
          return res.status(200).json({
            ok: true,
            count: parsed.questions.length,
            questions: parsed.questions,
            attempts: attempt,
            durationMs: Date.now() - start,
          });
        }
      } catch (err) {
        console.log("Attempt failed:", err);
      }
    }

    return res.status(500).json({ ok: false, error: "GEMINI_JSON_FAILED" });

  } catch (err) {
    console.error("Fatal:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
