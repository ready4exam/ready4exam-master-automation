// /api/gemini.js — FINAL VERSION (SAFE, with Universal JSON Extractor)

import { getCorsHeaders } from "./cors.js";
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const { meta } = body || {};
    if (!meta) throw new Error("Missing meta block.");

    const { class_name, subject, book, chapter, num = 60 } = meta;

    if (!class_name || !subject || !chapter)
      throw new Error("Missing required fields (class_name, subject, chapter)");

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    const prompt = `
Generate ${num} multiple-choice questions in pure JSON.
Include fields:
difficulty, question_type, question_text, scenario_reason_text,
option_a, option_b, option_c, option_d, correct_answer_key.

Subject: ${subject}
Book: ${book}
Chapter: ${chapter}

Return ONLY valid JSON:
{
  "questions":[ ... ]
}
`;

    // Call Gemini
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

    // ================================================================
    // UNIVERSAL JSON EXTRACTOR — Bulletproof Gemini Response Handling
    // ================================================================
    function extractJSON(input) {

      // 1. Direct parse
      try {
        return JSON.parse(input);
      } catch (_) {}

      // 2. ```json Fenced block ```
      const fenced = input.match(/```(?:json)?([\s\S]*?)```/i);
      if (fenced) {
        try {
          return JSON.parse(fenced[1]);
        } catch (_) {}
      }

      // 3. Extract { ... } region
      const brace = input.match(/\{[\s\S]*\}/);
      if (brace) {
        try {
          return JSON.parse(brace[0]);
        } catch (_) {}
      }

      throw new Error("Failed to parse Gemini JSON output.");
    }

    // Final parse logic
    let parsed = {};

    try {
      const outer = JSON.parse(raw);

      const innerText =
        outer?.candidates?.[0]?.content?.parts?.[0]?.text ||
        outer?.output_text ||
        raw;

      parsed = extractJSON(innerText);
    } catch (err) {
      parsed = extractJSON(raw);
    }

    // Extract questions
    const questions = Array.isArray(parsed?.questions) ? parsed.questions : null;
    if (!questions) throw new Error("Failed to parse Gemini JSON output.");

    // Return EXACTLY what your frontend expects
    return res.status(200).json({
      ok: true,
      questions
    });

  } catch (err) {
    console.error("❌ /api/gemini.js Error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
