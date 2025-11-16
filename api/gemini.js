// /api/gemini.js
// Final Production Version - JSON Only Parsing
import { getCorsHeaders } from "./cors.js";
export const config = { runtime: "nodejs" };

// Required fields Supabase + Quiz Engine depend on
const REQUIRED_FIELDS = [
  "difficulty",
  "question_type",
  "question_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_answer_key"
];

// Universal JSON extractor for Gemini responses
function extractJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {}
  const fenced = raw.match(/```(?:json)?([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }
  const block = raw.match(/\{[\s\S]*\}$/);
  if (block) {
    try {
      return JSON.parse(block[0]);
    } catch {}
  }
  throw new Error("No valid JSON found in response");
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  Object.entries({
    ...getCorsHeaders(origin),
    "Content-Type": "application/json",
  }).forEach(([k, v]) => res.setHeader(k, v));

  // CORS preflight
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta } = body || {};
    if (!meta)
      return res.status(400).json({ ok: false, error: "Missing 'meta' field" });

    const apiKey = process.env.GEMINI_API_KEY || process.env.google_api;
    if (!apiKey) throw new Error("Missing Gemini API key in env");

    const { class_name, subject, chapter } = meta;
    const model = "gemini-2.5-flash";

    // Prompt designed for JSON stability
    const prompt = `
Return ONLY valid JSON. No Markdown, no text outside JSON.

Generate exactly 60 NCERT exam-style questions.

Class: ${class_name}
Subject: ${subject}
Chapter: ${chapter}

Field rules:
- difficulty: Simple, Medium, Advanced
- question_type: MCQ, AR, Case-Based
- correct_answer_key: A/B/C/D uppercase
- scenario_reason_text ONLY IF needed

Final output shape (STRICT):
{
"questions": [
 {
  "difficulty": "Medium",
  "question_type": "MCQ",
  "question_text": ".....",
  "scenario_reason_text": "",
  "option_a": "...",
  "option_b": "...",
  "option_c": "...",
  "option_d": "...",
  "correct_answer_key": "A"
 }
]
}
`;

    const result = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
      }
    );

    const raw = await result.text();
    // console.log("🧾 RAW GEMINI:", raw);

    let outer;
    try {
      outer = JSON.parse(raw);
    } catch {
      outer = { output_text: raw };
    }

    const inner =
      outer?.candidates?.[0]?.content?.parts?.[0]?.text ||
      outer?.output_text ||
      raw;

    const parsed = extractJSON(inner);
    const questions = parsed?.questions;

    if (!Array.isArray(questions) || questions.length < 1) {
      throw new Error("No questions found in JSON returned by Gemini.");
    }

    // Validate JSON format
    for (const q of questions) {
      for (const h of REQUIRED_FIELDS) {
        if (!(h in q)) {
          throw new Error(`Missing required field: ${h}`);
        }
      }
    }

    return res.status(200).json({
      ok: true,
      questions,
      model,
      count: questions.length,
    });
  } catch (err) {
    console.error("❌ Gemini Error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
