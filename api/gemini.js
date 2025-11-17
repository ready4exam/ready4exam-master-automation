// /api/gemini.js - Stable JSON Generator (FINAL ROBUST VERSION)
// Handles messy Gemini output with nested JSON, markdown, or extra text.

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

// -------------------- Helpers --------------------

function tryParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Extract the best JSON object that has a `questions` array.
 * Strategy:
 *  1) Try whole text as JSON
 *  2) Try ```json ... ``` fenced blocks
 *  3) Balanced-brace scanning to handle nested objects
 */
function extractQuestionsObject(text) {
  if (!text || typeof text !== "string") return null;

  // 1️⃣ Whole text
  let obj = tryParseJson(text);
  if (obj && Array.isArray(obj.questions)) return obj;

  // 2️⃣ Fenced ```json``` or ``` ``` blocks
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fenceRegex.exec(text)) !== null) {
    const candidate = tryParseJson(match[1]);
    if (candidate && Array.isArray(candidate.questions)) {
      return candidate;
    }
  }

  // 3️⃣ Balanced-brace scanning for { ... } with nested objects
  const results = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        const slice = text.slice(start, i + 1);
        results.push(slice);
        start = -1;
      }
    }
  }

  let best = null;
  for (const slice of results) {
    const candidate = tryParseJson(slice);
    if (candidate && Array.isArray(candidate.questions)) {
      if (!best || candidate.questions.length > best.questions.length) {
        best = candidate;
      }
    }
  }

  return best;
}

// Normalize & validate final fields
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

// -------------------- Handler --------------------

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
Return ONLY valid JSON. No markdown. No comments. No explanation.

Generate 60+ NCERT exam-grade questions:
Class: ${class_name}
Subject: ${subject}
Chapter: ${chapter}

Valid structure:
{
 "questions": [
   {
     "difficulty": "Simple" | "Medium" | "Advanced",
     "question_type": "MCQ" | "AR" | "Case-Based",
     "question_text": "...",
     "scenario_reason_text": "...", // "" for MCQ
     "option_a": "...",
     "option_b": "...",
     "option_c": "...",
     "option_d": "...",
     "correct_answer_key": "A" | "B" | "C" | "D"
   }
 ]
}

Rules:
- difficulty: "Simple", "Medium", "Advanced"
- question_type: "MCQ", "AR", "Case-Based"
- AR & Case-Based MUST have scenario_reason_text explaining reason/context
- MCQ must have scenario_reason_text = ""
- correct_answer_key: A/B/C/D uppercase
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

    const rawText = await response.text();

    let outer;
    try {
      outer = JSON.parse(rawText);
    } catch {
      outer = { output_text: rawText };
    }

    const innerText =
      outer?.candidates?.[0]?.content?.parts?.[0]?.text ||
      outer?.output_text ||
      rawText;

    // Debug (truncated) – visible only in Vercel logs
    console.log("🧪 Gemini raw snippet:", innerText.slice(0, 500));

    const parsed = extractQuestionsObject(innerText);
    if (!parsed) {
      throw new Error("Gemini returned no valid JSON questions — re-run automation.");
    }

    const questions = parsed.questions || [];

    if (questions.length < 60) {
      throw new Error(
        `Gemini returned only ${questions.length} questions (need at least 60). Please re-run automation.`
      );
    }

    for (const q of questions) {
      for (const f of REQUIRED_FIELDS) {
        if (!(f in q)) {
          throw new Error(`Missing field "${f}" — re-run automation.`);
        }
      }
    }

    return res.status(200).json({
      ok: true,
      questions: questions.map(normalize),
      count: questions.length
    });

  } catch (err) {
    console.error("❌ Gemini error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Gemini endpoint failed — re-run automation."
    });
  }
}
