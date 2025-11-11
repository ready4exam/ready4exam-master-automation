// -------------------- /api/gemini.js --------------------
// Gemini 2.5 Flash stable working version (used in Phase-2 baseline)
// --------------------------------------------------------

import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { class_name, subject, book = "", chapter } = body || {};
    if (!class_name || !subject || !chapter)
      return res.status(400).json({ ok: false, error: "Missing required parameters" });

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("Gemini API key missing");

    const prompt = `
Generate exactly 60 structured school exam questions for:
Class ${class_name}, Subject: ${subject}, Book: ${book}, Chapter: ${chapter}

Include:
• 20 Simple (10 MCQ, 5 AR, 5 Case)
• 20 Medium (10 MCQ, 5 AR, 5 Case)
• 20 Advanced (10 MCQ, 5 AR, 5 Case)

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

Return only JSON array.
`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
        }),
      }
    );

    if (!geminiRes.ok) {
      const text = await geminiRes.text();
      console.error("❌ Gemini API error:", text);
      return res.status(400).json({ ok: false, error: "Gemini API error" });
    }

    const geminiData = await geminiRes.json();
    const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    let questions = [];

    try {
      questions = JSON.parse(raw);
    } catch (err) {
      console.error("❌ JSON parse error:", err);
      return res.status(400).json({ ok: false, error: "Invalid Gemini output" });
    }

    console.log(`✅ Gemini generated ${questions.length} questions.`);
    return res.status(200).json({ ok: true, questions });
  } catch (err) {
    console.error("❌ Gemini.js error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
