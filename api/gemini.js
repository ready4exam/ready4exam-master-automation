// ============================================================================
// /api/gemini.js — UNIVERSAL PRODUCTION VERSION (BATCHED & ROBUST)
// Includes: Parallel Batching (Fixes 500 error), Failover Chain, & JSON Cleaner
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Model chain for failover
const MODEL_CHAIN = [
  "gemini-2.0-flash",        
  "gemini-1.5-flash",        
  "gemini-1.5-flash-latest"
];

// =====================================================================
// AGGRESSIVE JSON CLEANER
// =====================================================================
function extractJSON(raw) {
  if (!raw) return [];
  try {
    let text = raw.trim()
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .replace(/[\u0000-\u001F]+/g, " ")
      .replace(/“|”/g, '"')
      .replace(/‘|’/g, "'");

    const first = text.indexOf("[");
    const last = text.lastIndexOf("]");
    if (first === -1 || last === -1) return [];

    text = text.slice(first, last + 1);
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : (parsed.questions || []);
  } catch (err) {
    console.error("❌ JSON Clean/Parse Error:", err.message);
    return [];
  }
}

// =====================================================================
// BATCH GENERATOR (Parallelized)
// =====================================================================
async function getBatch(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  let lastErr = null;

  for (const modelName of MODEL_CHAIN) {
    try {
      const g = client.getGenerativeModel({ model: modelName });
      const output = await g.generateContent(prompt);
      const text = output.response.text();
      const questions = extractJSON(text);
      if (questions.length > 0) return questions;
    } catch (err) {
      lastErr = err;
      console.log(`⚠ Model ${modelName} batch failed, trying next...`);
      continue;
    }
  }
  return []; // Return empty if all fail
}

// =====================================================================
// MAIN HANDLER
// =====================================================================
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;
    if (!meta) return res.status(400).json({ ok: false, error: "Missing Meta" });

    const rawClass = meta.class_name || "";
    const isCBSE = !isNaN(rawClass);
    const board = !isCBSE && rawClass.includes("Telangana") ? "Telangana State Board (SCERT)" : "CBSE/NCERT";

    const baseFormat = `[{ "difficulty": "Simple|Medium|Advanced", "question_type": "MCQ|Case-Based|AR", "question_text": "", "scenario_reason_text": "", "option_a": "", "option_b": "", "option_c": "", "option_d": "", "correct_answer_key": "A" }]`;

    // PROMPTS SPLIT INTO TWO BATCHES TO PREVENT JSON CUT-OFF
    const prompt1 = `Generate EXACTLY 30 questions (15 Simple, 15 Medium) for ${board} Class ${rawClass}, Subject: ${meta.subject}, Chapter: ${meta.chapter}. Output ONLY a JSON array. Format: ${baseFormat}`;
    const prompt2 = `Generate EXACTLY 30 questions (10 Advanced MCQ, 10 Assertion-Reason, 10 Case-Based) for ${board} Class ${rawClass}, Subject: ${meta.subject}, Chapter: ${meta.chapter}. For AR/Case questions, scenario_reason_text MUST NOT BE EMPTY. Output ONLY a JSON array. Format: ${baseFormat}`;

    let finalQuestions = [];

    // Global Attempt Loop (Up to 3 times)
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`🔄 Global Attempt ${attempt} for ${meta.chapter}`);

      // Run both batches in parallel for speed
      const [batch1, batch2] = await Promise.all([
        getBatch(prompt1),
        getBatch(prompt2)
      ]);

      const combined = [...batch1, ...batch2];

      if (combined.length >= 40) { // Success threshold
        return res.status(200).json({
          ok: true,
          board,
          count: combined.length,
          attempts: attempt,
          questions: combined
        });
      }
      console.log(`⚠ Attempt ${attempt} incomplete (${combined.length} questions), retrying...`);
    }

    throw new Error("GEMINI_INVALID_JSON_AFTER_RETRIES_OR_INCOMPLETE_BATCH");

  } catch (err) {
    console.error("❌ API ERROR:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
