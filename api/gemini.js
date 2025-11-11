// ✅ /api/gemini.js — Production-grade version
// Handles Gemini output in text, Markdown, or structured JSON forms

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
    if (!meta) throw new Error("Missing 'meta' data.");

    const { class_name, subject, book, chapter, num = 5, difficulty = "medium" } = meta;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY env var.");

    // Build the prompt
    const prompt = `
Generate ${num} multiple-choice questions in pure JSON.
Include fields:
difficulty, question_type, question_text, scenario_reason_text,
option_a, option_b, option_c, option_d, correct_answer_key.

Subject: ${subject}
Book: ${book}
Chapter: ${chapter}
Difficulty: ${difficulty}

Return only JSON (no Markdown, no extra text).
Example:
{
  "questions":[
    {"difficulty":"medium","question_type":"mcq","question_text":"...","scenario_reason_text":"...",
     "option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_answer_key":"b"}
  ]
}
`;

    // Fetch from Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
      }
    );

    const raw = await geminiRes.text();
    console.log("🧾 GEMINI RAW RESPONSE:", raw);

    // -----------------------------
    // 🔍 UNIVERSAL PARSER
    // -----------------------------
    const extractJSON = (input) => {
      try {
        // 1️⃣ Direct JSON
        return JSON.parse(input);
      } catch (_) {
        // 2️⃣ Strip Markdown fences ```json ... ```
        const matchFence = input.match(/```(?:json)?([\s\S]*?)```/i);
        if (matchFence) return JSON.parse(matchFence[1]);

        // 3️⃣ Extract first { ... } block that looks like JSON
        const matchBlock = input.match(/\{[\s\S]*\}/);
        if (matchBlock) return JSON.parse(matchBlock[0]);

        throw new Error("No valid JSON found.");
      }
    };

    let parsed = {};
    try {
      const outer = JSON.parse(raw);
      const innerText =
        outer?.candidates?.[0]?.content?.parts?.[0]?.text ||
        outer?.output_text ||
        raw;
      parsed = extractJSON(innerText);
    } catch (err) {
      console.warn("⚠️ Outer parse fallback:", err.message);
      parsed = extractJSON(raw);
    }

    const questions = parsed?.questions && Array.isArray(parsed.questions) ? parsed.questions : [];
    if (!questions.length) throw new Error("Failed to parse Gemini JSON output.");

    return res.status(200).json({ ok: true, questions });
  } catch (err) {
    console.error("❌ /api/gemini.js error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
