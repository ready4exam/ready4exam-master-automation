// /api/gemini.js
import { getCorsHeaders } from "../cors.js";

export const config = { runtime: "nodejs" };

/**
 * Prompt ensures:
 * - EXACT 60 questions
 * - 3 difficulty levels
 * - Required type distribution per difficulty:
 *   - 10 MCQ
 *   - 5 AR (Assertion-Reason)
 *   - 5 Case-Based
 */
function buildPrompt(meta) {
  return `
Generate questions STRICTLY in pure JSON format.

=========
QUESTION SPECIFICATIONS
=========
Class: ${meta.class_name}
Subject: ${meta.subject}
Book: ${meta.book || "N/A"}
Chapter: ${meta.chapter}

Total MUST be exactly 60 questions:
- 20 Simple  → 10 MCQ + 5 AR + 5 Case-Based
- 20 Medium  → 10 MCQ + 5 AR + 5 Case-Based
- 20 Advanced → 10 MCQ + 5 AR + 5 Case-Based

=========
JSON RESPONSE FORMAT
=========
{
  "questions": [
    {
      "difficulty": "Simple" | "Medium" | "Advanced",
      "question_type": "MCQ" | "AR" | "Case-Based",
      "question_text": "...",
      "scenario_reason_text": "...",
      "option_a": "...",
      "option_b": "...",
      "option_c": "...",
      "option_d": "...",
      "correct_answer_key": "A" | "B" | "C" | "D"
    }
  ]
}

IMPORTANT RULES:
- Only valid JSON. No markdown. No commentary.
- Use **double quotes** only.
- Ensure counts & categories STRICTLY match above.
  `;
}

function normalizeAnswer(key) {
  key = (key || "").toString().trim().toUpperCase();
  return ["A", "B", "C", "D"].includes(key) ? key : "A";
}

function normalizeType(t) {
  t = (t || "").toLowerCase();
  if (t.includes("assertion")) return "AR";
  if (t.includes("case")) return "Case-Based";
  return "MCQ";
}

function normalizeDifficulty(d) {
  d = (d || "").toLowerCase();
  if (d.includes("medium")) return "Medium";
  if (d.includes("adv")) return "Advanced";
  return "Simple";
}

export default async function handler(req, res) {
  // CORS headers
  const origin = req.headers.origin || "*";
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const { meta } = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!meta) throw new Error("Missing meta in request.");

    const API_KEY = process.env.GEMINI_API_KEY || process.env.google_api;
    if (!API_KEY) throw new Error("Gemini API key missing.");

    const prompt = buildPrompt(meta);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: prompt }] }
          ]
        })
      }
    );

    const raw = await response.text();
    console.log("🧾 RAW RESPONSE:", raw.substring(0, 300));

    let parsed = {};
    try {
      const top = JSON.parse(raw);
      const inner = top?.candidates?.[0]?.content?.parts?.[0]?.text || raw;
      parsed = JSON.parse(inner.match(/\{[\s\S]*\}/)[0]);
    } catch (err) {
      console.warn("⚠ JSON parse fallback:", err.message);
      throw new Error("Model returned invalid JSON");
    }

    let questions = parsed?.questions || [];
    if (!Array.isArray(questions) || questions.length !== 60) {
      throw new Error(`Incorrect number of questions: expected 60, got ${questions.length}`);
    }

    // Data cleanup
    questions = questions.map(q => ({
      difficulty: normalizeDifficulty(q.difficulty),
      question_type: normalizeType(q.question_type),
      question_text: (q.question_text || "").trim(),
      scenario_reason_text: (q.scenario_reason_text || "").trim(),
      option_a: (q.option_a || "").trim(),
      option_b: (q.option_b || "").trim(),
      option_c: (q.option_c || "").trim(),
      option_d: (q.option_d || "").trim(),
      correct_answer_key: normalizeAnswer(q.correct_answer_key)
    }));

    return res.status(200).json({ ok: true, questions });

  } catch (err) {
    console.warn("⚠ Gemini validation failed:", err.message);
    return res.status(200).json({
      ok: false,
      retry: true,
      user_message:
        "Generation incomplete. Please click Generate again.",
      detail: err.message
    });
  }
}
