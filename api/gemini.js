// /api/gemini.js - Final JSON + Validated Distribution
import { getCorsHeaders } from "./cors.js";
export const config = { runtime: "nodejs" };

const REQUIRED_FIELDS = [
  "difficulty",
  "question_type",
  "question_text",
  "scenario_reason_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_answer_key"
];

const DIFFICULTIES = ["Simple", "Medium", "Advanced"];
const TYPES = ["MCQ", "AR", "Case-Based"];

// Extract valid JSON from Gemini output
function extractJSON(raw) {
  raw = raw.trim();
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?([\s\S]*?)```/i);
  if (fenced) try { return JSON.parse(fenced[1]); } catch {}
  const block = raw.match(/\{[\s\S]*\}$/);
  if (block) try { return JSON.parse(block[0]); } catch {}
  throw new Error("Gemini returned non-JSON — Please re-run Automation.");
}

// Normalize quiz fields
function normalize(q) {
  const type = (q.question_type || "").toLowerCase();
  const qt = type.includes("case") ? "Case-Based"
      : type.includes("assertion") ? "AR"
      : q.question_type || "MCQ";

  return {
    difficulty: (q.difficulty || "").trim(),
    question_type: qt,
    question_text: (q.question_text || "").trim(),
    scenario_reason_text:
      qt === "MCQ"
        ? ""
        : (q.scenario_reason_text || "").trim(),
    option_a: (q.option_a || "").trim(),
    option_b: (q.option_b || "").trim(),
    option_c: (q.option_c || "").trim(),
    option_d: (q.option_d || "").trim(),
    correct_answer_key: (q.correct_answer_key || "A").trim().toUpperCase()
  };
}

// Validate distribution: 60 Q → 3 difficulty groups
function validateDistribution(questions) {
  for (const d of DIFFICULTIES) {
    const dq = questions.filter(q => q.difficulty === d);
    if (dq.length !== 20)
      throw new Error(`${d} group incorrect — retry Automation`);

    const mcq = dq.filter(q => q.question_type === "MCQ");
    const ar = dq.filter(q => q.question_type === "AR");
    const cb = dq.filter(q => q.question_type === "Case-Based");

    if (mcq.length !== 10 || ar.length !== 5 || cb.length !== 5)
      throw new Error(`${d} group format incorrect — retry Automation`);
  }
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
    if (!meta)
      throw new Error("Missing request data — retry Automation");

    const model = "gemini-2.5-flash";
    const apiKey = process.env.GEMINI_API_KEY || process.env.google_api;
    if (!apiKey)
      throw new Error("Server missing API key — contact Admin");

    const prompt = `
Return ONLY clean JSON. No Markdown.

Generate EXACTLY 60 NCERT Exam Questions:

PER difficulty (Simple, Medium, Advanced):
- 10 MCQ
- 5 AR
- 5 Case-Based
(total = 60)

💡 Rules:
- correct_answer_key MUST be A/B/C/D
- Scenario text only for AR & Case-Based

STRICT JSON ONLY:
{
"questions":[
 {...}
]
}

Subject: ${meta.subject}
Chapter: ${meta.chapter}
`;

    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }]
        })
      }
    );

    const raw = await apiRes.text();
    let outer;
    try { outer = JSON.parse(raw); } catch { outer = {}; }
    const text =
      outer?.candidates?.[0]?.content?.parts?.[0]?.text ||
      raw;

    const parsed = extractJSON(text);
    const questions = parsed?.questions;
    if (!Array.isArray(questions) || questions.length !== 60)
      throw new Error("Incorrect count — retry Automation");

    const cleaned = questions.map(normalize);

    // Distribution enforcement 🔥
    validateDistribution(cleaned);

    return res.status(200).json({
      ok: true,
      model,
      count: cleaned.length,
      questions: cleaned
    });

  } catch (err) {
    console.error("Gemini ❌", err.message);
    return res.status(500).json({
      ok: false,
      retry: true,
      error: `${err.message} — Please re-run Automation.`
    });
  }
}
