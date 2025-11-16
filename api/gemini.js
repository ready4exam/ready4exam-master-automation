// /api/gemini.js - Final JSON-Only Stable Version
import { getCorsHeaders } from "./cors.js";
export const config = { runtime: "nodejs" };

const REQUIRED_FIELDS = [
  "difficulty",
  "question_type",
  "question_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_answer_key",
  "scenario_reason_text"
];

// Extract valid JSON from any Gemini output
function extractJSON(raw) {
  raw = raw.trim();
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?([\s\S]*?)```/i);
  if (fenced) try { return JSON.parse(fenced[1]); } catch {}
  const block = raw.match(/\{[\s\S]*\}$/);
  if (block) try { return JSON.parse(block[0]); } catch {}
  throw new Error("Gemini returned non-JSON — please re-run Automation.");
}

// Normalize fields before storage
function normalize(q) {
  const type = (q.question_type || "").toLowerCase();
  return {
    difficulty: (q.difficulty || "").trim(),
    question_type: type === "assertion" ? "AR" : q.question_type,
    question_text: (q.question_text || "").trim(),
    scenario_reason_text:
      type === "mcq" || type === "objective"
        ? ""
        : (q.scenario_reason_text || "").trim(),
    option_a: (q.option_a || "").trim(),
    option_b: (q.option_b || "").trim(),
    option_c: (q.option_c || "").trim(),
    option_d: (q.option_d || "").trim(),
    correct_answer_key: (q.correct_answer_key || "A").trim().toUpperCase()
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  Object.entries({
    ...getCorsHeaders(origin),
    "Content-Type": "application/json"
  }).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta } = body || {};
    if (!meta) throw new Error("Missing meta");

    const { class_name, subject, chapter } = meta;
    const model = "gemini-2.5-flash";
    const apiKey = process.env.GEMINI_API_KEY || process.env.google_api;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    // 🔥 Strong enforced prompt
    const prompt = `
Return ONLY clean JSON. No Markdown. No comments.

Generate EXACTLY:
- 3 difficulty groups → Simple, Medium, Advanced
Each Group:
- 10 MCQ questions
- 5 AR questions
- 5 Case-Based questions
(total = 60)

Format STRICTLY:
{
"questions":[
 {
  "difficulty":"Simple",
  "question_type":"MCQ",
  "question_text":"...",
  "scenario_reason_text":"",
  "option_a":"...",
  "option_b":"...",
  "option_c":"...",
  "option_d":"...",
  "correct_answer_key":"A"
 }
]
}

Rules:
- Class: ${class_name}
- Subject: ${subject}
- Chapter: ${chapter}
- correct_answer_key must be A/B/C/D uppercase
`;

    const gemResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }]
        })
      }
    );

    const raw = await gemResp.text();
    let outer;
    try { outer = JSON.parse(raw); } catch { outer = { output_text: raw }; }

    const inner =
      outer?.candidates?.[0]?.content?.parts?.[0]?.text ||
      outer?.output_text ||
      raw;

    const parsed = extractJSON(inner);
    const questions = parsed?.questions;
    if (!Array.isArray(questions) || questions.length !== 60) {
      throw new Error("Incorrect question count — please re-run Automation.");
    }

    for (const q of questions) {
      for (const h of REQUIRED_FIELDS) {
        if (!(h in q)) {
          throw new Error(`Missing required field: ${h} — re-run Automation.`);
        }
      }
    }

    const cleaned = questions.map(normalize);

    return res.status(200).json({
      ok: true,
      model,
      count: cleaned.length,
      questions: cleaned
    });

  } catch (err) {
    console.error("❌ Gemini Error:", err);
    return res.status(500).json({
      ok: false,
      error: `${err.message} (Retry Automation)`
    });
  }
}
