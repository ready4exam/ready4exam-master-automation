// ============================================================================
// /api/tel_gemini.js — TELANGANA VERSION (Restored + Safe Math Fix)
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ============================================================================
//  MODEL FAILOVER CHAIN (Restored)
// ============================================================================
const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite"
];

// ============================================================================
//  JSON CLEANER (Restored robust version)
// ============================================================================
function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let text = raw.trim()
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/[\u0000-\u001F]+/g, " ")
    .replace(/\n+/g, " ")
    .replace(/“|”/g, '"')
    .replace(/‘|’/g, "'")
    .replace(/,\s*]/g, "]")
    .replace(/,\s*}/g, "}");

  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");

  if (first !== -1 && last !== -1)
    text = text.slice(first, last + 1);

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { ok: true, questions: parsed };
    if (Array.isArray(parsed.questions)) return { ok: true, questions: parsed.questions };
    return { ok: false, error: "INVALID_JSON_SHAPE", raw: text };
  } catch (err) {
    return { ok: false, error: "INVALID_JSON_PARSE", raw: text };
  }
}

// ============================================================================
//  GEMINI CALLER
// ============================================================================
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  let lastErr = null;

  for (const model of MODEL_CHAIN) {
    try {
      console.log("⚡ Trying model:", model);
      const g = client.getGenerativeModel({ model });
      const output = await g.generateContent(prompt);
      const txt = output.response.text();

      if (!txt || !txt.trim()) {
        console.log("⚠ Empty output → switching model");
        continue;
      }
      return txt;

    } catch (err) {
      lastErr = err;
      const status = err?.status;
      console.log(`❌ Model ${model} failed (${status}):`, err.message);

      if (status === 429 || status === 500 || status === 503) {
        await new Promise(r => setTimeout(r, 800));
        continue; 
      }
      continue;
    }
  }
  throw lastErr || new Error("All models failed");
}

// ============================================================================
//  MAIN HANDLER
// ============================================================================
export default async function handler(req, res) {
  
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "ONLY_POST_ALLOWED" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta) return res.status(400).json({ ok: false, error: "NO_META_PROVIDED" });

    // ========================================================================
    //  ⭐ RESTORED WORKING PROMPT + SAFE MATH INJECTION
    // ========================================================================
    const prompt = `
You MUST output ONLY a valid JSON array.
No text before it.
No text after it.
No commentary.
No markdown.
No headings.

STRICT FORMAT FOR EVERY QUESTION:
[
  {
    "difficulty": "Simple | Medium | Advanced",
    "question_type": "MCQ | Case-Based | AR",
    "question_text": "Example: What is the value of (3+√2)? (Use Unicode symbols like √, ², π for math)",
    "scenario_reason_text": "",
    "option_a": "Option A text",
    "option_b": "Option B text",
    "option_c": "Option C text",
    "option_d": "Option D text",
    "correct_answer_key": "A"
  }
]

==============================
  CLASS: ${meta.class_name}
  SUBJECT: ${meta.subject}
  CHAPTER: ${meta.chapter}
  BOARD: Telangana State Board / SCERT
==============================

REQUIREMENTS:
- Generate EXACTLY 60 SCERT/Telangana Board standard questions
- Strictly follow the Telangana State Board (BSE) academic syllabus
- Distribution:
    • 20 Simple  
    • 20 Medium  
    • 20 Advanced  
- At least **10 Case-Based or Assertion-Reason**
- Simple/Medium/Advanced should reflect cognitive depth
- All MCQ types → scenario_reason_text MUST be ""
- Case-Based & Assertion Reason → scenario_reason_text MUST NOT be empty
- No multiline text in any JSON field
- No escape characters or newline characters within strings
- No duplicate questions

**MATH RENDERING RULE:**
- For Mathematical expressions, use **Unicode symbols** (e.g., √, π, ², ³, θ, ÷, ×) directly in the text.
- Do NOT use LaTeX code (e.g., do NOT use \\frac, \\sqrt, \\text). 
- Make expressions readable as plain text (e.g., write "1/(3+√2)" instead of complex fraction code).

FINAL RULE:
Return ONLY the JSON array. NOTHING else.
`;

    const start = Date.now();

    // ========================================================================
    // 3 ATTEMPTS
    // ========================================================================
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log("🔁 Attempt:", attempt);

      try {
        const raw = await callGemini(prompt);
        const parsed = extractJSON(raw);

        if (parsed.ok) {
          return res.status(200).json({
            ok: true,
            engine: "gemini_telangana_v1",
            attempts: attempt,
            count: parsed.questions.length,
            durationMs: Date.now() - start,
            questions: parsed.questions,
          });
        }

        console.log("⚠ JSON invalid → retrying...");
      } catch (err) {
        console.log("Attempt failed:", err);
      }
    }

    return res.status(500).json({ ok: false, error: "GEMINI_INVALID_JSON" });

  } catch (err) {
    console.error("❌ API ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
