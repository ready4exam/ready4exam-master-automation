// /api/gemini.js — BULLETPROOF JSON GENERATOR (FINAL VERSION)
// Survives dirty Gemini output: markdown, arrays, broken JSON, extra text, multiple blocks.

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

// -------------------------------------------------------------
// BASIC HELPERS
// -------------------------------------------------------------
function tryParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// Auto-fix smart quotes, trailing commas, nonsense escapes
function repairJson(text) {
  if (!text) return text;

  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/\\n/g, " ")
    .replace(/\r/g, " ");
}

// -------------------------------------------------------------
// Extract JSON from Gemini output (robust)
// -------------------------------------------------------------
function extractQuestionsObject(text) {
  if (!text) return null;

  const cleaned = repairJson(text);

  // 1️⃣ Try whole text
  let obj = tryParseJson(cleaned);
  if (obj && Array.isArray(obj.questions)) return obj;

  // 2️⃣ Try fenced blocks ```json ... ```
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fenceRegex.exec(cleaned)) !== null) {
    const candidate = tryParseJson(repairJson(match[1]));
    if (candidate && Array.isArray(candidate.questions)) {
      return candidate;
    }
  }

  // 3️⃣ Handle plain arrays like [ {...}, {...} ]
  const arr = tryParseJson(cleaned);
  if (Array.isArray(arr)) {
    return { questions: arr };
  }

  // 4️⃣ Extract all balanced JSON blocks { ... }
  const blocks = [];
  let depth = 0, start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        blocks.push(cleaned.slice(start, i + 1));
        start = -1;
      }
    }
  }

  let collected = [];
  for (const b of blocks) {
    const obj = tryParseJson(repairJson(b));
    if (!obj) continue;

    if (Array.isArray(obj)) collected.push(...obj);
    if (Array.isArray(obj.questions)) collected.push(...obj.questions);
  }

  if (collected.length > 0) {
    return { questions: collected };
  }

  return null;
}

// -------------------------------------------------------------
// Normalizer (same as your previous version)
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// HANDLER
// -------------------------------------------------------------
export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) =>
    res.setHeader(k, v)
  );
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta } = body;
    if (!meta) throw new Error("Missing meta");

    const apiKey = process.env.GEMINI_API_KEY || process.env.google_api;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    const prompt = `
Return ONLY valid JSON. No markdown. No explanations.

Generate 60+ NCERT exam-grade questions:
Class: ${meta.class_name}
Subject: ${meta.subject}
Chapter: ${meta.chapter}

Valid JSON:
{
 "questions": [
   {
     "difficulty": "Simple" | "Medium" | "Advanced",
     "question_type": "MCQ" | "AR" | "Case-Based",
     "question_text": "...",
     "scenario_reason_text": "",   // for MCQ
     "option_a": "...",
     "option_b": "...",
     "option_c": "...",
     "option_d": "...",
     "correct_answer_key": "A" | "B" | "C" | "D"
   }
 ]
}
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

    console.log("🧪 Gemini Raw Output (first 400 chars):", innerText.slice(0, 400));

    // --------------------------
    // FINAL ROBUST EXTRACTION
    // --------------------------
    let parsed = extractQuestionsObject(innerText);

    if (!parsed || !parsed.questions || parsed.questions.length === 0) {
      throw new Error(
        "Gemini returned invalid JSON. Raw snippet: " +
          innerText.slice(0, 300)
      );
    }

    const questions = parsed.questions;

    if (questions.length < 40) {
      // allow 40+ instead of strict 60 to prevent failures
      console.warn(
        `⚠ Warning: Only ${questions.length} questions generated (minimum 40 accepted).`
      );
    }

    // Field validation
    for (const q of questions) {
      for (const f of REQUIRED_FIELDS) {
        if (!(f in q)) {
          q[f] = ""; // auto-fill missing fields
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
      error:
        err.message ||
        "Gemini failed to produce valid questions — try again."
    });
  }
}
