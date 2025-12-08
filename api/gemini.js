// /api/gemini.js — Gemini primary + Perplexity fallback
import { getCorsHeaders } from "./cors.js";
export const config = { runtime: "nodejs" };

// Required fields for Supabase
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

/* ---------------------------------------------
   JSON Helpers
----------------------------------------------*/
const tryParse = (str) => {
  try { return JSON.parse(str); } catch { return null; }
};

function clean(text) {
  return text
    ?.replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/\\n/g, " ")
    .replace(/\r/g, " ");
}

function extractQuestions(raw) {
  if (!raw) return null;
  const cleaned = clean(raw);

  // Direct JSON
  let obj = tryParse(cleaned);
  if (obj?.questions) return obj;

  // Fenced blocks
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = fence.exec(cleaned))) {
    const candidate = tryParse(clean(m[1]));
    if (candidate?.questions) return candidate;
  }

  // Arrays
  const arr = tryParse(cleaned);
  if (Array.isArray(arr)) return { questions: arr };

  // Deep brace extraction
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

  const collected = [];
  for (const blk of blocks) {
    const o = tryParse(clean(blk));
    if (o?.questions) collected.push(...o.questions);
    if (Array.isArray(o)) collected.push(...o);
  }

  return collected.length ? { questions: collected } : null;
}

function normalize(q) {
  const key = (q.correct_answer_key || "").trim().toUpperCase();
  return {
    difficulty: q.difficulty || "",
    question_type: q.question_type || "",
    question_text: q.question_text || "",
    option_a: q.option_a || "",
    option_b: q.option_b || "",
    option_c: q.option_c || "",
    option_d: q.option_d || "",
    scenario_reason_text:
      (q.question_type || "").toUpperCase() === "MCQ"
        ? ""
        : q.scenario_reason_text || "",
    correct_answer_key: ["A", "B", "C", "D"].includes(key) ? key : "A"
  };
}

/* ---------------------------------------------
   PRIMARY ENGINE — GOOGLE GEMINI (AI Studio)
----------------------------------------------*/
async function tryGemini(meta, prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  const raw = await resp.text();
  console.log("🔍 Gemini RAW:", raw.slice(0, 300));

  if (resp.status === 429 || raw.includes("resourceExhausted") || raw.includes("quota")) {
    throw new Error("__GEMINI_QUOTA__"); // trigger fallback
  }

  let json;
  try { json = JSON.parse(raw); }
  catch { throw new Error("Gemini returned non-JSON output."); }

  const text =
    json?.candidates?.[0]?.content?.parts?.[0]?.text ||
    json?.candidates?.[0]?.output_text ||
    raw;

  return extractQuestions(text);
}

/* ---------------------------------------------
   FALLBACK ENGINE — PERPLEXITY
----------------------------------------------*/
async function tryPerplexity(meta, prompt) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("Missing PERPLEXITY_API_KEY");

  const resp = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "X-API-Key": apiKey
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [{ role: "user", content: prompt }]
    })
  });

  const raw = await resp.text();
  console.log("🔍 Perplexity RAW:", raw.slice(0, 300));

  if (raw.startsWith("<html") || raw.includes("cloudflare")) {
    throw new Error("Perplexity returned HTML / Cloudflare block");
  }

  let json;
  try { json = JSON.parse(raw); }
  catch { json = {}; }

  const text = json?.choices?.[0]?.message?.content || raw;
  return extractQuestions(text);
}

/* ---------------------------------------------
   MAIN HANDLER
----------------------------------------------*/
export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSO
