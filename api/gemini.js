// /api/gemini.js - Stable JSON Generator (B: MCQ+AR+Case-Based)
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

function extractJSON(raw) {
  raw = raw.trim();
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?([\s\S]*?)```/i);
  if (fenced) try { return JSON.parse(fenced[1]); } catch {}
  const block = raw.match(/\{[\s\S]*\}$/);
  if (block) try { return JSON.parse(block[0]); } catch {}
  throw new Error("Gemini returned non-JSON. Click RE-RUN Automation.");
}

function normalize(q) {
  q.correct_answer_key = (q.correct_answer_key || "A").trim().toUpperCase();
  if (!["A", "B", "C", "D"].includes(q.correct_answer_key)) {
    q.correct_answer_key = "A";
  }
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
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Only POST allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta } = body;
    if (!meta) throw new Error("Missing meta");

    const { class_name, subject, chapter } = meta;
    const apiKey = process.env.GEMINI_API_KEY || process.env.google_api;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    const prompt = `
Return ONLY valid JSON. No markdown. No text outside JSON.

Generate exactly 60+ NCERT exam-grade questions for:
Class: ${class_name}
Subject: ${subject}
Chapter: ${chapter}

Structure strictly:
{
 "questions": [
    // Simple → 10 MCQ + 5 AR + 5 Case-Based
    // Medium → 10 MCQ + 5 AR + 5 Case-Based
    // Advanced → 10 MCQ + 5 AR + 5 Case-Based
 ]
}

Rules:
- difficulty values: "Simple", "Medium", "Advanced"
- question_type values: "MCQ", "AR", "Case-Based"
- MCQ must have scenario_reason_text = ""
- AR & Case-Based MUST include scenario_reason_text explaining context
- correct_answer_key must be A/B/C/D uppercase
- All text must be based ONLY on NCERT content

Every entry must include:
difficulty, question_type, question_text, scenario_reason_text,
option_a, option_b, option_c, option_d, correct_answer_key
`;

    const model = "gemini-2.5-flash";
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }]
        })
      }
    );

    const raw = await response.text();
    let outer;
    try { outer = JSON.parse(raw); } catch { outer = { output_text: raw }; }

    const innerText =
      outer?.candidates?.[0]?.content?.parts?.[0]?.text ||
      outer?.output_text ||
      raw;

    const parsed = extractJSON(innerText);
    const questions = parsed?.questions || [];

    // 🔴 OLD (too strict):
    // if (questions.length !== 60) {
    //   throw new Error(`Expected 60 questions but received ${questions.length}. Re-run Automation.`);
    // }

    // 🟢 NEW: allow 60 or more, only fail if less than 60
    if (questions.length < 60) {
      throw new Error(
        `Gemini returned only ${questions.length} questions (need at least 60). Please re-run Automation.`
      );
    }

    for (const q of questions) {
      for (const f of REQUIRED_FIELDS) {
        if (!(f in q)) throw new Error(`Missing field "${f}" — re-run automation.`);
      }
    }

    return res.status(200).json({
      ok: true,
      questions: questions.map(normalize),
      count: questions.length
    });

  } catch (err) {
    console.error("❌ Gemini", err);
    return res.status(500).json({
      ok: false,
      error: err.message + " — re-run automation."
    });
  }
}
