// ============================================================================
// /api/gemini.js — FINAL PRODUCTION VERSION (Node + CORS + Gemini 2.5 Flash)
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;   // (kept but disabled)

// ============================================================================
// CORS HEADERS
// ============================================================================
function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

// ============================================================================
// ULTRA-ROBUST JSON EXTRACTOR — FIXES GEMINI_INVALID_JSON
// ============================================================================
function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let txt = raw.trim();

  // Remove markdown code fences
  txt = txt.replace(/```json/gi, "").replace(/```/g, "");

  // ---- 1️⃣ Try extracting JSON array directly ----
  const arrayMatch = txt.match(/\[\s*{[\s\S]*}\s*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      return { ok: true, questions: parsed };
    } catch (e) {
      // continue repairing if fails
    }
  }

  // ---- 2️⃣ Extract JSON object and convert to array if needed ----
  const objectMatch = txt.match(/{[\s\S]*}/);
  if (objectMatch) {
    try {
      const obj = JSON.parse(objectMatch[0]);
      if (Array.isArray(obj)) return { ok: true, questions: obj };
      if (Array.isArray(obj.questions)) return { ok: true, questions: obj.questions };
    } catch (e) {
      // continue repairing
    }
  }

  // ---- 3️⃣ Remove trailing commas which break JSON ----
  txt = txt.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

  // ---- 4️⃣ Last attempt to parse everything ----
  try {
    const parsed = JSON.parse(txt);
    if (Array.isArray(parsed)) return { ok: true, questions: parsed };
    if (Array.isArray(parsed.questions)) return { ok: true, questions: parsed.questions };
  } catch (err) {
    return { ok: false, error: "INVALID_JSON_PARSE" };
  }

  return { ok: false, error: "INVALID_JSON" };
}

// ============================================================================
// GEMINI CALL — UPDATED TO gemini-2.5-flash
// ============================================================================
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);

  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash"
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ============================================================================
// (DISABLED) PERPLEXITY FALLBACK — PRESERVED BUT NOT USED
// ============================================================================

// async function callPerplexity(prompt) {
//   const url = "https://api.perplexity.ai/chat/completions";

//   try {
//     const res = await fetch(url, {
//       method: "POST",
//       headers: {
//         Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
//         "Content-Type": "application/json"
//       },
//       body: JSON.stringify({
//         model: "sonar-pro",
//         max_tokens: 4000,
//         messages: [{ role: "user", content: prompt }]
//       })
//     });

//     const text = await res.text();
//     return text;
//   } catch (err) {
//     return null;
//   }
// }

// ============================================================================
// MAIN HANDLER
// ============================================================================
export default async function handler(req, res) {
  setCORS(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "ONLY_POST_ALLOWED" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta) {
      return res.status(400).json({ ok: false, error: "NO_META_PROVIDED" });
    }

    // ==============================================
