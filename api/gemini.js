// /api/gemini.js — FINAL PRODUCTION VERSION (v1beta + gemini-2.5-flash)
// Fully stable, JSON repair, handles all Gemini output issues.

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

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------
function tryParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

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

// Extract valid JSON from messy Gemini output
function extractQuestionsObject(text) {
  if (!text) return null;

  const cleaned = repairJson(text);

  // Whole JSON
  let obj = tryParseJson(cleaned);
  if (obj && Array.isArray(obj.questions)) return obj;

  // Fenced blocks
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fenceRegex.exec(cleaned)) !== null) {
    const candidate = tryParseJson(repairJson(match[1]));
    if (candidate && Array.isArray(candidate.questions)) return candidate;
  }

  // Top-level array
  const arr = tryParseJson(cleaned);
  if (Array.isArray(arr)) return { questions: arr };

  // Balanced braces extraction
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

// ------------------------------------------------------------------
// MAIN HANDLER
// ------------------------------------------------------------------
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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    const prompt = `
Return ONLY valid JSON. No markdown.

Generate 60 NCERT exam-grade questions:
Class: ${meta.class_name}
Subject: ${meta.subject}
Chapter: ${meta.chapter}

Format:
{
 "questions": [
   {
     "difficulty": "Simple" | "Medium" | "Advanced",
     "question_type": "MCQ" | "AR" | "Case-Based",
     "question_text": "...",
     "scenario_reason_text": "",
     "option_a": "...",
     "option_b": "...",
     "option_c": "...",
     "option_d": "...",
     "correct_answer_key": "A" | "B" | "C" | "D"
   }
 ]
}
    `;

    // ✔ Use the endpoint that matched your successful curl
    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      })
    });

    const rawText = await response.text();
    console.log("🧪 Gemini RAW snippet:", rawText.slice(0, 500));

    let outer;
    try {
      outer = JSON.parse(rawText);
    } catch {
      outer = { output_text: rawText };
    }

    // Detect quota exceeded
    if (outer?.error?.code === 429) {
      throw new Error("Gemini quota exceeded — try again later.");
    }

    const innerText =
      outer?.candidates?.[0]?.content?.parts?.[0]?.text ||
      outer?.output_text ||
      rawText;

    let parsed = extractQuestionsObject(innerText);

    if (!parsed || !parsed.questions || parsed.questions.length === 0) {
      throw new Error(
        "Gemini returned invalid JSON. Snippet: " + innerText.slice(0, 300)
      );
    }

    const questions = parsed.questions;

    if (questions.length < 40) {
      console.warn(`⚠ Only ${questions.length} questions generated — continuing.`);
    }

    // Validate fields
    for (const q of questions) {
      for (const f of REQUIRED_FIELDS) {
        if (!(f in q)) q[f] = "";
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
      error: err.message || "Gemini failed — try again."
    });
  }
}
