// ✅ /api/gemini.js — Final Node Runtime Version
// Phase-2 Automation: Generate structured MCQs from Gemini 2.5 Flash
// Compatible with: Vercel NodeJS Runtime + Supabase automation
// Author: Ready4Exam

import { getCorsHeaders } from "./cors.js";

// ✅ Ensure Vercel runs this as Node (not Edge)
export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta = {} } = body;
    const { class_name, subject, book = "", chapter, num = 20, difficulty = "medium" } = meta;

    if (!class_name || !subject || !chapter)
      return res.status(400).json({ ok: false, error: "Missing meta parameters." });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY in environment variables.");

    const GEMINI_ENDPOINT =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

    // -------------------------------
    // 1️⃣ Build generation prompt
    // -------------------------------
    const userPrompt = `
Generate ${num} ${difficulty} level multiple choice questions (MCQs) for:
Class: ${class_name}
Subject: ${subject}
Book: ${book}
Chapter: ${chapter}

Return ONLY valid JSON with this structure:
{
  "questions": [
    {
      "difficulty": "medium",
      "question_type": "mcq",
      "question_text": "What is velocity?",
      "scenario_reason_text": "Velocity is rate of displacement.",
      "option_a": "Rate of change of speed",
      "option_b": "Rate of change of displacement",
      "option_c": "Rate of change of energy",
      "option_d": "Rate of change of force",
      "correct_answer_key": "b"
    }
  ]
}

Do not include markdown, commentary, or code fences. Return pure JSON only.
`;

    // -------------------------------
    // 2️⃣ Call Gemini API
    // -------------------------------
    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 1600,
      },
    };

    const geminiRes = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("❌ Gemini API error:", errText);
      return res.status(500).json({ ok: false, error: "Gemini API request failed.", detail: errText });
    }

    const data = await geminiRes.json();

    // -------------------------------
    // 3️⃣ Extract text response safely
    // -------------------------------
    let text = null;
    function extractText(obj) {
      if (!obj || typeof obj !== "object") return null;
      if (typeof obj.text === "string" && obj.text.trim().startsWith("{")) return obj.text;
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (typeof val === "string" && val.trim().startsWith("{")) return val;
        if (typeof val === "object") {
          const found = extractText(val);
          if (found) return found;
        }
      }
      return null;
    }
    text = extractText(data) || "";

    // -------------------------------
    // 4️⃣ Parse and validate JSON
    // -------------------------------
    let parsed;
    try {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        parsed = JSON.parse(text.slice(start, end + 1));
      } else {
        parsed = JSON.parse(text);
      }
    } catch (e) {
      console.error("⚠️ Failed to parse Gemini output:", text);
      return res.status(500).json({
        ok: false,
        error: "Failed to parse Gemini JSON output.",
        raw: text.slice(0, 500),
      });
    }

    if (!parsed || !Array.isArray(parsed.questions))
      return res.status(500).json({
        ok: false,
        error: "Invalid Gemini response structure.",
        parsed,
      });

    // -------------------------------
    // 5️⃣ Normalize and sanitize data
    // -------------------------------
    const clean = parsed.questions.map((q) => ({
      difficulty: q.difficulty || difficulty,
      question_type: q.question_type || "mcq",
      question_text: (q.question_text || "").trim(),
      scenario_reason_text: (q.scenario_reason_text || "").trim(),
      option_a: (q.option_a || "").trim(),
      option_b: (q.option_b || "").trim(),
      option_c: (q.option_c || "").trim(),
      option_d: (q.option_d || "").trim(),
      correct_answer_key: (["a", "b", "c", "d"].includes((q.correct_answer_key || "").toLowerCase())
        ? q.correct_answer_key.toLowerCase()
        : "a"),
    }));

    // -------------------------------
    // ✅ Success
    // -------------------------------
    console.log(`✅ Gemini generated ${clean.length} questions for ${chapter}`);
    return res.status(200).json({ ok: true, questions: clean });
  } catch (err) {
    console.error("❌ /api/gemini.js error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal server error" });
  }
}
