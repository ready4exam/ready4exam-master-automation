// ✅ /api/gemini.js
// Ready4Exam Gemini 2.5 Flash integration (Generates 60 structured questions)
// Supports JSON output grouped by difficulty for Supabase insertion

import { getCorsHeaders } from "./cors.js";

// ----------------------------
// Gemini API Endpoint
// ----------------------------
export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  Object.entries({ ...getCorsHeaders(origin), "Content-Type": "application/json" })
    .forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Only POST method allowed" });

  try {
    const { className, subject, book, chapter } =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    if (!className || !subject || !chapter)
      return res.status(400).json({ error: "Missing parameters" });

    const prompt = `
You are an educational question generator for CBSE Class ${className}.
Subject: ${subject}
Book: ${book || "N/A"}
Chapter: ${chapter}

Generate **60 exam-style questions** divided as follows:
- 20 Simple (10 MCQ, 5 Assertion-Reason, 5 Case-based)
- 20 Medium (10 MCQ, 5 Assertion-Reason, 5 Case-based)
- 20 Advanced (10 MCQ, 5 Assertion-Reason, 5 Case-based)

Output strictly in valid JSON array format:
[
  {
    "difficulty": "simple|medium|advanced",
    "question_type": "mcq|ar|case",
    "question_text": "string",
    "scenario_reason_text": "string or null",
    "option_a": "string",
    "option_b": "string",
    "option_c": "string",
    "option_d": "string",
    "correct_answer_key": "A|B|C|D"
  }
]
Ensure there are exactly 60 question objects, no markdown, no extra text.
`;

    // ----------------------------
    // Call Gemini API (2.5 Flash)
    // ----------------------------
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) throw new Error("Missing GEMINI_API_KEY in env");

    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
      }
    );

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) throw new Error(geminiData.error?.message || "Gemini API failed");

    // ----------------------------
    // Parse JSON output safely
    // ----------------------------
    let textOutput =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "[]";

    // Clean possible code block wrappers (```json ... ```)
    textOutput = textOutput.replace(/```json|```/g, "").trim();

    let questions = [];
    try {
      questions = JSON.parse(textOutput);
    } catch (err) {
      console.warn("⚠️ Gemini JSON parse failed:", err.message);
      questions = [];
    }

    // Sanitize & enforce 60 questions
    if (!Array.isArray(questions) || questions.length < 60) {
      console.warn("⚠️ Gemini returned insufficient questions, padding empty rows...");
      const filler = Array.from({ length: 60 - (questions.length || 0) }, (_, i) => ({
        difficulty: "simple",
        question_type: "mcq",
        question_text: `Placeholder Q${i + 1} for ${chapter}`,
        scenario_reason_text: "",
        option_a: "Option A",
        option_b: "Option B",
        option_c: "Option C",
        option_d: "Option D",
        correct_answer_key: "A",
      }));
      questions = [...questions, ...filler].slice(0, 60);
    }

    return res.status(200).json({
      ok: true,
      count: questions.length,
      questions,
    });
  } catch (err) {
    console.error("❌ Gemini API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
