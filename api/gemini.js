// -------------------- /api/gemini.js --------------------
// Stable Gemini 2.5 Flash Integration for Ready4Exam
// Generates exactly 60 structured questions per chapter.
// --------------------------------------------------------

import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  // ----- Setup CORS -----
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    // ----- Parse Request -----
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { class_name, subject, book = "", chapter } = body || {};
    if (!class_name || !subject || !chapter)
      return res.status(400).json({ ok: false, error: "Missing required parameters" });

    // ----- API Key -----
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("Gemini API key missing");

    // ----- Prompt -----
    const prompt = `
Generate exactly 60 structured school exam questions for:
Class ${class_name}, Subject: ${subject}, Book: ${book}, Chapter: ${chapter}

Include:
• 20 Simple (10 MCQ, 5 Assertion-Reason, 5 Case)
• 20 Medium (10 MCQ, 5 Assertion-Reason, 5 Case)
• 20 Advanced (10 MCQ, 5 Assertion-Reason, 5 Case)

Each object must have:
{
  "difficulty": "Simple" | "Medium" | "Advanced",
  "question_type": "MCQ" | "AR" | "Case",
  "question_text": "...",
  "scenario_reason_text": "...",
  "option_a": "...",
  "option_b": "...",
  "option_c": "...",
  "option_d": "...",
  "correct_answer_key": "A" | "B" | "C" | "D"
}

Return ONLY valid JSON array, no markdown, no commentary.
    `;

    // ----- Call Gemini 2.5 Flash -----
  const geminiRes = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        responseMimeType: "application/json"
      }
    }),
  }
);
    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("❌ Gemini returned error:", errText.slice(0, 500));
      return res.status(400).json({
        ok: false,
        error: `Gemini API returned ${geminiRes.status}`,
      });
    }

    // ----- Parse Response -----
    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    let parsed = [];

    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      console.error("❌ Failed to parse Gemini output:", rawText.slice(0, 200));
      return res.status(400).json({
        ok: false,
        error: "Invalid JSON returned by Gemini model",
      });
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return res.status(400).json({ ok: false, error: "Empty or invalid data" });
    }

    const valid = parsed.filter(
      (q) =>
        q.question_text &&
        q.option_a &&
        q.option_b &&
        q.option_c &&
        q.option_d &&
        q.correct_answer_key
    );

    console.log(`✅ Gemini 2.5 Flash generated ${valid.length} questions for ${chapter}`);

    return res.status(200).json({ ok: true, questions: valid });
  } catch (err) {
    console.error("❌ Gemini.js Error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Internal Server Error",
    });
  }
}
