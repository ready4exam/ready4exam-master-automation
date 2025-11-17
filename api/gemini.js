// /api/gemini.js - Future-Proof JSON Extractor (Stable)
import { getCorsHeaders } from "./cors.js";
export const config = { runtime: "nodejs" };

const REQUIRED_FIELDS = [
  "difficulty", "question_type", "question_text",
  "option_a", "option_b", "option_c", "option_d",
  "correct_answer_key", "scenario_reason_text"
];

// 🔍 Extract JSON object safely from ANY response text
function findJson(data) {
  const text = typeof data === "string" ? data : JSON.stringify(data);

  // Remove markdown fences if present
  const fenced = text.match(/```(?:json)?([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch {}
  }

  // Match JSON from first { to last }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }

  return null;
}

// 🧠 Universal extraction: recursive search
async function extractBestJson(obj) {
  const texts = [];

  function collect(o) {
    if (!o) return;
    if (typeof o === "string") texts.push(o);
    else if (Array.isArray(o)) o.forEach(collect);
    else if (typeof o === "object") Object.values(o).forEach(collect);
  }

  collect(obj);

  for (const t of texts) {
    const parsed = findJson(t);
    if (parsed?.questions) return parsed;
  }

  return null;
}

// Keep normalize as-is
function normalize(q) {
  q.correct_answer_key = (q.correct_answer_key || "A").trim().toUpperCase();
  if (!["A","B","C","D"].includes(q.correct_answer_key)) q.correct_answer_key = "A";

  return {
    difficulty: (q.difficulty || "").trim(),
    question_type: (q.question_type || "").trim(),
    question_text: (q.question_text || "").trim(),
    scenario_reason_text:
      (q.question_type || "").toUpperCase() === "MCQ"
        ? ""
        : (q.scenario_reason_text || "").trim(),
    option_a: (q.option_a || "").trim(),
    option_b: (q.option_b || "").trim(),
    option_c: (q.option_c || "").trim(),
    option_d: (q.option_d || "").trim(),
    correct_answer_key: q.correct_answer_key
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  Object.entries({ ...getCorsHeaders(origin), "Content-Type": "application/json" })
    .forEach(([k,v]) => res.setHeader(k,v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { meta } = body;
    if (!meta) throw new Error("Missing meta");

    const { class_name, subject, chapter } = meta;
    const apiKey = process.env.GEMINI_API_KEY || process.env.google_api;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    const prompt = `
Return ONLY valid JSON. No markdown. No explanation text.

Generate exactly 60+ NCERT exam-grade questions for:
Class: ${class_name}
Subject: ${subject}
Chapter: ${chapter}

JSON structure:
{
  "questions": [
     // 20 Simple → 10 MCQ + 5 AR + 5 Case-Based
     // 20 Medium → 10 MCQ + 5 AR + 5 Case-Based
     // 20 Advanced → 10 MCQ + 5 AR + 5 Case-Based
  ]
}

Rules:
- difficulty: Simple | Medium | Advanced
- question_type: MCQ | AR | Case-Based
- MCQ: scenario_reason_text = ""
- AR & Case-Based must include scenario_reason_text
- correct_answer_key: A/B/C/D only
`;

    const model = "gemini-2.5-flash";
    const request = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }]
        })
      }
    );

    const raw = await request.text();
    let outer;
    try { outer = JSON.parse(raw); }
    catch { outer = { rawText: raw }; }

    const parsed = await extractBestJson(outer);
    if (!parsed?.questions) {
      throw new Error("Gemini returned no valid questions in any format.");
    }

    const questions = parsed.questions;
    if (questions.length < 60) {
      throw new Error(`Gemini returned only ${questions.length} questions (need ≥ 60).`);
    }

    for (const q of questions) {
      for (const f of REQUIRED_FIELDS) {
        if (!(f in q)) throw new Error(`Missing field ${f}`);
      }
    }

    return res.status(200).json({
      ok: true,
      questions: questions.map(normalize),
      count: questions.length
    });

  } catch (err) {
    console.error("❌ Gemini Error", err);
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
