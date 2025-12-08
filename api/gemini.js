// /api/gemini.js — FINAL PRODUCTION VERSION
// Primary: Gemini (AI Studio)
// Fallback: Perplexity (ONLY when Gemini quota exhausted)
// Includes: Retry logic, JSON extraction, CORS, and manageSupabase alignment

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

// -----------------------------------------------------------
// Helper utils
// -----------------------------------------------------------

function tryParseJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

/**
 * Extract JSON containing questions[] from messy LLM output.
 */
function extractQuestionsObject(text) {
  if (!text || typeof text !== "string") return null;

  // 1️⃣ Whole text
  let obj = tryParseJson(text);
  if (obj && Array.isArray(obj.questions)) return obj;

  // 2️⃣ Fenced blocks ```json ... ```
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fenceRegex.exec(text)) !== null) {
    const candidate = tryParseJson(match[1]);
    if (candidate && Array.isArray(candidate.questions)) return candidate;
  }

  // 3️⃣ Balanced braces { ... }
  const results = [];
  let depth = 0, start = -1;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        results.push(text.slice(start, i + 1));
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

function normalize(q) {
  const key = (q.correct_answer_key || "A").trim().toUpperCase();
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
    correct_answer_key: ["A","B","C","D"].includes(key) ? key : "A"
  };
}

// -----------------------------------------------------------
// GEMINI PRIMARY ENGINE
// -----------------------------------------------------------

async function callGemini(prompt, apiKey, meta, attempt) {
  const model = "gemini-2.5-flash";

  const t0 = Date.now();
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
  const elapsed = Date.now() - t0;

  const rawText = await response.text();
  console.log(
    `🔵 Gemini [${meta.class_name} | ${meta.subject} | ${meta.chapter}] attempt ${attempt} (${elapsed} ms)`
  );
  console.log("   ▸ raw snippet:", rawText.slice(0, 200));

  // Detect quota exhaustion
  if (
    response.status === 429 ||
    rawText.includes("quota") ||
    rawText.includes("exhausted") ||
    rawText.includes("RESOURCE_EXHAUSTED") ||
    rawText.toLowerCase().includes("rate limit") ||
    rawText.toLowerCase().includes("billing")
  ) {
    throw new Error("GEMINI_QUOTA");
  }

  let outer;
  try { outer = JSON.parse(rawText); }
  catch { outer = { output_text: rawText }; }

  const inner =
    outer?.candidates?.[0]?.content?.parts?.[0]?.text ||
    outer?.output_text ||
    rawText;

  const parsed = extractQuestionsObject(inner);
  if (!parsed) {
    throw new Error("INVALID_JSON");
  }

  return { questions: parsed.questions, durationMs: elapsed };
}

// -----------------------------------------------------------
// PERPLEXITY FALLBACK ENGINE
// -----------------------------------------------------------

async function callPerplexity(prompt, apiKey, meta) {
  const url = "https://api.perplexity.ai/chat/completions";

  const t0 = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [{ role: "user", content: prompt }]
    })
  });
  const elapsed = Date.now() - t0;

  const rawText = await response.text();
  console.log(
    `🟣 Perplexity [${meta.class_name} | ${meta.subject} | ${meta.chapter}] (${elapsed} ms)`
  );
  console.log("   ▸ raw snippet:", rawText.slice(0, 200));

  const outer = tryParseJson(rawText) || {};
  const content =
    outer?.choices?.[0]?.message?.content ||
    outer?.output_text ||
    rawText;

  const parsed = extractQuestionsObject(content);
  if (!parsed) throw new Error("PERPLEXITY_INVALID_JSON");

  return { questions: parsed.questions, durationMs: elapsed };
}

// -----------------------------------------------------------
// MAIN HANDLER
// -----------------------------------------------------------

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";

  // Base CORS from helper (if you want)
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) =>
    res.setHeader(k, v)
  );

  // Force GitHub Pages origin (like manageSupabase.js)
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta } = body;
    if (!meta) throw new Error("Missing meta");

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const PERPLEXITY_KEY = process.env.PERPLEXITY_API_KEY;

    if (!GEMINI_KEY) throw new Error("Missing GEMINI_API_KEY");

    const { class_name, subject, chapter } = meta;

    const prompt = `
Return ONLY valid JSON. No markdown.

Generate 60 NCERT exam-grade questions:
Class: ${class_name}
Subject: ${subject}
Chapter: ${chapter}

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

    let questions = null;
    let engineUsed = "gemini";
    let geminiAttempts = 0;
    let fallbackUsed = false;
    let durationMs = 0;

    // ----------------------------------------
    // 1️⃣ Try Gemini up to 3 times
    // ----------------------------------------
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        geminiAttempts = attempt;
        const result = await callGemini(prompt, GEMINI_KEY, meta, attempt);
        questions = result.questions;
        durationMs = result.durationMs;
        console.log(
          `✅ Gemini success [${class_name} | ${subject} | ${chapter}] attempt ${attempt}, Q=${questions.length}`
        );
        break; // Success
      } catch (err) {
        if (err.message === "GEMINI_QUOTA") {
          console.log("🔴 Gemini quota exhausted → fallback to Perplexity allowed.");
          fallbackUsed = true;
          questions = null;
          break;
        }

        console.warn(
          `⚠ Gemini attempt ${attempt} failed for [${class_name} | ${subject} | ${chapter}]:`,
          err.message
        );

        if (attempt === 3) {
          // On 3rd failure (non-quota), do NOT fallback — as per your rule A
          throw err;
        }
      }
    }

    // ----------------------------------------
    // 2️⃣ Fallback ONLY when Gemini quota exhausted
    // ----------------------------------------
    if (!questions && fallbackUsed) {
      if (!PERPLEXITY_KEY) {
        throw new Error("Gemini quota exhausted and PERPLEXITY_API_KEY is missing.");
      }
      engineUsed = "perplexity";
      const result = await callPerplexity(prompt, PERPLEXITY_KEY, meta);
      questions = result.questions;
      durationMs = result.durationMs;
      console.log(
        `✅ Perplexity success [${class_name} | ${subject} | ${chapter}] Q=${questions.length}`
      );
    }

    if (!questions) {
      throw new Error("No questions generated by Gemini or Perplexity.");
    }

    // ----------------------------------------
    // Validate minimum
    // ----------------------------------------
    if (questions.length < 40) {
      console.warn(
        `⚠ Only ${questions.length} questions generated for [${class_name} | ${subject} | ${chapter}].`
      );
    }

    // Validate fields present
    for (const q of questions) {
      for (const f of REQUIRED_FIELDS) {
        if (!(f in q)) {
          throw new Error(`Missing field "${f}" in one of the questions.`);
        }
      }
    }

    // ----------------------------------------
    // Success response
    // ----------------------------------------
    return res.status(200).json({
      ok: true,
      questions: questions.map(normalize),
      count: questions.length,
      engine: engineUsed,
      geminiAttempts,
      fallbackUsed,
      durationMs
    });

  } catch (err) {
    console.error("❌ Final Gemini/Perplexity error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
