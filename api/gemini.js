// -------------------- /api/gemini.js --------------------
// Generates 60 structured quiz questions using Gemini 1.5 Flash
// and returns them to the frontend (tableautomation).
// Each set = 20 per difficulty (10 MCQ, 5 AR, 5 Case)

import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  // ----------------------------
  // Setup CORS headers
  // ----------------------------
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // Handle OPTIONS
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Only POST method allowed" });

  try {
    // ----------------------------
    // Validate request
    // ----------------------------
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { class_name, subject, book = "", chapter } = body || {};

    if (!class_name || !subject || !chapter) {
      return res.status(400).json({ ok: false, error: "Missing required parameters" });
    }

    // ----------------------------
    // Gemini API key
    // ----------------------------
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY)
      throw new Error("Gemini API key missing. Set GEMINI_API_KEY in environment.");

    // ----------------------------
    // Construct prompt for Gemini
    // ----------------------------
    const prompt = `
Generate exactly 60 high-quality exam-style questions for:
Class ${class_name} | Subject: ${subject} | Book: ${book} | Chapter: ${chapter}

The set must include:
• 20 Simple questions (10 MCQ, 5 Assertion-Reason, 5 Case)
• 20 Medium questions (10 MCQ, 5 Assertion-Reason, 5 Case)
• 20 Advanced questions (10 MCQ, 5 Assertion-Reason, 5 Case)

Each question must be an object with these keys:
{
  "difficulty": "Simple" | "Medium" | "Advanced",
  "question_type": "MCQ" | "AR" | "Case",
  "question_text": "<main question>",
  "scenario_reason_text": "<context or reason, empty if none>",
  "option_a": "<A>",
  "option_b": "<B>",
  "option_c": "<C>",
  "option_d": "<D>",
  "correct_answer_key": "A" | "B" | "C" | "D"
}

Return only a valid JSON array (no markdown, no commentary).
    `;

    // ----------------------------
    // Call Gemini 1.5 Flash API
    // ----------------------------
    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
        GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    // ----------------------------
    // Handle Gemini errors
    // ----------------------------
    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("❌ Gemini API failed:", errText);
      return res.status(400).json({
        ok: false,
        error: `Gemini API returned ${geminiRes.status}: ${errText}`,
      });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("❌ Failed to parse Gemini output:", rawText.slice(0, 200));
      return res.status(400).json({
        ok: false,
        error: "Invalid JSON returned by Gemini model.",
      });
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return res
        .status(400)
        .json({ ok: false, error: "Gemini returned empty or invalid data." });
    }

    // ----------------------------
    // Validate structure
    // ----------------------------
    const valid = parsed.filter(
      (q) =>
        q.question_text &&
        q.option_a &&
        q.option_b &&
        q.option_c &&
        q.option_d &&
        q.correct_answer_key
    );

    console.log(
      `✅ Gemini generated ${valid.length}/${parsed.length} questions for ${chapter}.`
    );

    // ----------------------------
    // Response
    // ----------------------------
    return res.status(200).json({ ok: true, questions: valid });
  } catch (err) {
    console.error("❌ Gemini.js Error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Internal Server Error",
    });
  }
}
