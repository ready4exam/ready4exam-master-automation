// ✅ /api/gemini.js — Final Stable Version (Node.js Runtime)
// Ready4Exam Phase-2 Automation
// Handles question generation via Gemini → returns structured JSON

import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" }; // ⚙️ Force Node runtime for env vars + fetch

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);

  // 🧩 Handle preflight + method validation
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    // Parse incoming request
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta } = body || {};
    if (!meta) throw new Error("Missing 'meta' data.");

    const { class_name, subject, book, chapter, num = 5, difficulty = "medium" } = meta;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY environment variable.");

    // 🧠 Construct Gemini prompt
    const prompt = `
Generate ${num} structured multiple-choice questions (MCQs) in JSON format.

Each question must include:
difficulty, question_type, question_text, scenario_reason_text,
option_a, option_b, option_c, option_d, correct_answer_key.

Subject: ${subject}
Book: ${book}
Chapter: ${chapter}
Difficulty: ${difficulty}

Return ONLY valid JSON with a root key called "questions".
Example:
{
  "questions": [
    {
      "difficulty": "medium",
      "question_type": "mcq",
      "question_text": "...",
      "scenario_reason_text": "...",
      "option_a": "...",
      "option_b": "...",
      "option_c": "...",
      "option_d": "...",
      "correct_answer_key": "b"
    }
  ]
}
`;

    // 🧩 Call Gemini API
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
      }
    );

    const raw = await geminiRes.text();
    console.log("🧾 GEMINI RAW RESPONSE:", raw);

    let questions = [];

    // -------------------------------
    // 🧩 Safe Parsing Logic
    // -------------------------------
    try {
      const data = JSON.parse(raw);

      // Case 1️⃣: Normal Gemini structure (candidates array)
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
        data?.text ||
        raw;

      const parsed = JSON.parse(text);
      if (parsed?.questions && Array.isArray(parsed.questions)) {
        questions = parsed.questions;
      } else {
        throw new Error("No 'questions' array found in parsed JSON.");
      }
    } catch (parseErr) {
      console.warn("⚠️ Gemini parse fallback triggered:", parseErr.message);

      // Case 2️⃣: Fallback — Gemini returned JSON directly or wrapped in text
      if (raw.includes('"questions"')) {
        const match = raw.match(/\{[\s\S]*"questions"[\s\S]*\}/);
        if (match) {
          try {
            const safe = JSON.parse(match[0]);
            questions = safe.questions || [];
          } catch (innerErr) {
            console.error("⚠️ JSON fallback failed:", innerErr.message);
          }
        }
      }
    }

    if (!questions.length) {
      throw new Error("Failed to parse Gemini JSON output.");
    }

    // ✅ Success response
    return res.status(200).json({ ok: true, questions });
  } catch (err) {
    console.error("❌ /api/gemini.js error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}
