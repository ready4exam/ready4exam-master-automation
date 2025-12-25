// ============================================================================
// /api/tel_gemini.js — TELANGANA (SCERT) + READABLE MATH FIX
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ============================================================================
//  1. MODEL FAILOVER CHAIN
// ============================================================================
const MODEL_CHAIN = [
  "gemini-2.5-flash",        // Primary
  "gemini-flash-latest",     // Backup 1
  "gemini-2.0-flash",        // Backup 2
  "gemini-1.5-flash"         // Legacy
];

// ============================================================================
//  2. JSON CLEANER & PARSER
// ============================================================================
function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  // Strip markdown, code blocks, and newlines
  let text = raw.trim()
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/[\u0000-\u001F]+/g, " ") 
    .replace(/\n+/g, " ")
    .replace(/“|”/g, '"')
    .replace(/‘|’/g, "'");

  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");

  if (first !== -1 && last !== -1) {
    text = text.slice(first, last + 1);
  }

  try {
    const parsed = JSON.parse(text);
    // Validate array shape
    if (Array.isArray(parsed)) return { ok: true, questions: parsed };
    if (parsed.questions && Array.isArray(parsed.questions)) return { ok: true, questions: parsed.questions };
    return { ok: false, error: "INVALID_JSON_SHAPE", raw: text };
  } catch (err) {
    return { ok: false, error: "INVALID_JSON_PARSE", raw: text };
  }
}

// ============================================================================
//  3. GEMINI CALLER
// ============================================================================
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  let lastErr = null;

  for (const model of MODEL_CHAIN) {
    try {
      console.log(`⚡ [tel_gemini] Trying model: ${model}`);
      const g = client.getGenerativeModel({ model });
      const output = await g.generateContent(prompt);
      const txt = output.response.text();

      if (!txt || !txt.trim()) {
        console.warn("⚠ Empty output → switching");
        continue;
      }
      return txt;

    } catch (err) {
      lastErr = err;
      const status = err?.status;
      if (status === 429 || status === 500 || status === 503) {
        await new Promise(r => setTimeout(r, 1000));
        continue; 
      }
      continue;
    }
  }
  throw lastErr || new Error("All models failed.");
}

// ============================================================================
//  4. MAIN HANDLER
// ============================================================================
export default async function handler(req, res) {
  
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta) return res.status(400).json({ ok: false, error: "Missing metadata" });

    // ========================================================================
    //  ⭐ UPDATED PROMPT: STRICT READABLE MATH
    // ========================================================================
    const prompt = `
You are an expert academic content creator for the **Telangana State Board (SCERT)** curriculum.

TASK: Generate a strictly formatted JSON array of questions.

CONTEXT:
- Class: ${meta.class_name} (Telangana State Board)
- Subject: ${meta.subject}
- Chapter: ${meta.chapter}

FORMATTING RULES (CRITICAL):
1. **NO RAW LATEX**: Do NOT use LaTeX delimiters like \\( ... \\) or commands like \\sqrt{}, \\frac{}{}, \\textbf{}.
2. **USE UNICODE**: Use readable Unicode symbols for math equations so they display correctly as plain text.
   - Use '√' instead of \\sqrt (e.g., "√2" not "\\sqrt{2}")
   - Use '/' for fractions (e.g., "1/2" not "\\frac{1}{2}")
   - Use '²' for square (e.g., "x²" not "x^2")
   - Use 'π' instead of \\pi
   - Use 'θ' instead of \\theta
   - Use '°' for degrees.
3. **READABILITY**: The question_text must be readable by a 9th-grade student without needing a Markdown/LaTeX parser.

REQUIREMENTS:
1. **Quantity:** EXACTLY 60 Questions.
2. **Syllabus:** Strictly follow the SCERT Telangana textbook.
3. **Mix:** 20 Simple, 20 Medium, 20 Advanced.
4. **Types:** Majority MCQ; at least 10 "Assertion-Reason" or "Case-Based".
5. **Structure:** Strictly valid JSON Array.

JSON STRUCTURE:
[
  {
    "difficulty": "Medium", 
    "question_type": "MCQ",
    "question_text": "Rationalize the denominator of 1/(3+√2).",
    "scenario_reason_text": "",
    "option_a": "(3-√2)/7",
    "option_b": "(3+√2)/7",
    "option_c": "(3-√2)/11",
    "option_d": "(3+√2)/11",
    "correct_answer_key": "A"
  }
]

FINAL INSTRUCTION: Return ONLY the JSON array.
`;

    const start = Date.now();

    // ========================================================================
    //  RETRY LOOP
    // ========================================================================
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`🔁 Attempt ${attempt}/3 for ${meta.chapter}`);

      try {
        const raw = await callGemini(prompt);
        const result = extractJSON(raw);

        if (result.ok) {
          return res.status(200).json({
            ok: true,
            engine: "tel_gemini_math_v2",
            attempts: attempt,
            count: result.questions.length,
            durationMs: Date.now() - start,
            questions: result.questions,
          });
        }
      } catch (innerErr) {
        console.error(`Attempt ${attempt} error:`, innerErr.message);
      }
    }

    return res.status(500).json({ ok: false, error: "Failed to generate valid JSON." });

  } catch (err) {
    console.error("❌ API CRITICAL FAIL:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
