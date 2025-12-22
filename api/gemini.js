// ============================================================================
// /api/gemini.js — UNIVERSAL PRODUCTION VERSION
// Supports: CBSE (NCERT), Telangana, ICSE, Karnataka, etc.
// Includes: Failover Chain, JSON Cleaner, and Dynamic Board Prompting
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ============================================================================
//  MODEL FAILOVER CHAIN (FREE-TIER SAFE)
// ============================================================================
const MODEL_CHAIN = [
  "gemini-2.0-flash",        // Newest high-speed model
  "gemini-1.5-flash",        // Reliable backup
  "gemini-1.5-flash-latest", // Backup
  "gemini-2.0-flash-lite-preview" // Fallback
];

// ============================================================================
//  JSON CLEANER (Preserved Full Robustness)
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
//  GEMINI FAILOVER ENGINE
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

      console.log("✅ Success with model:", model);
      return txt;

    } catch (err) {
      lastErr = err;
      const status = err?.status;
      console.log(`❌ Model ${model} failed (${status}):`, err.message);

      if (status === 429) {
        console.log("🔄 Quota exceeded → trying next model");
        continue; 
      }

      if (status === 500 || status === 503) {
        console.log("🔁 Server error → retry after delay");
        await new Promise(r => setTimeout(r, 800));
        continue;
      }

      console.log("⏭ Non-recoverable → switching model");
      continue;
    }
  }

  throw lastErr || new Error("All models failed");
}

// ============================================================================
//  MAIN API HANDLER — UNIVERSAL VERSION
// ============================================================================
export default async function handler(req, res) {
  
  // ------------ CORS BLOCK ------------
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "ONLY_POST_ALLOWED" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta)
      return res.status(400).json({ ok: false, error: "NO_META_PROVIDED" });

    // ========================================================================
    //  ⭐ DYNAMIC BOARD DETECTION (Universal Logic)
    // ========================================================================
    const rawClass = meta.class_name || "";
    const isCBSE = !isNaN(rawClass); // If strictly numeric (e.g., "9"), it's CBSE
    
    let boardLabel = "NCERT / CBSE";
    let specialGuidance = "Follow NCERT textbook standards strictly.";

    if (!isCBSE) {
      if (rawClass.includes("Telangana")) {
        boardLabel = "Telangana State Board (SCERT)";
        specialGuidance = "Follow Telangana SCERT textbook patterns and specific terminology.";
      } else if (rawClass.includes("ICSE")) {
        boardLabel = "ICSE (CISCE) Board";
        specialGuidance = "Follow ICSE application-based curriculum. Questions should be rigorous.";
      } else if (rawClass.includes("Karnataka")) {
        boardLabel = "Karnataka State Board (KSEEB)";
        specialGuidance = "Follow Karnataka State syllabus and textbook concepts.";
      }
    }

    const prompt = `
You MUST output ONLY a valid JSON array.
No text before it. No text after it. No commentary. No markdown.

You are an expert examiner for the ${boardLabel}.
Generate EXACTLY 60 questions for Class ${rawClass}, Subject: ${meta.subject}, Chapter: ${meta.chapter}.

STRICT FORMAT FOR EVERY QUESTION:
[
  {
    "difficulty": "Simple | Medium | Advanced",
    "question_type": "MCQ | Case-Based | AR",
    "question_text": "",
    "scenario_reason_text": "",
    "option_a": "",
    "option_b": "",
    "option_c": "",
    "option_d": "",
    "correct_answer_key": "A"
  }
]

REQUIREMENTS:
- BOARD STANDARDS: ${boardLabel}. ${specialGuidance}
- Distribution: 20 Simple, 20 Medium, 20 Advanced.
- At least 10 Case-Based or Assertion-Reason (AR) questions.
- For MCQ, scenario_reason_text MUST be "".
- For Case-Based & AR, scenario_reason_text MUST contain the passage or logic.
- Ensure no duplicate questions and no nested structures.
- Return ONLY the JSON array.
`;

    const start = Date.now();

    // ========================================================================
    // 3 ATTEMPTS (each attempt includes model failover chain)
    // ========================================================================
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log("🔁 Global Attempt:", attempt);

      try {
        const raw = await callGemini(prompt);
        const parsed = extractJSON(raw);

        if (parsed.ok) {
          return res.status(200).json({
            ok: true,
            board: boardLabel,
            engine: "gemini_universal_v2_failover",
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

    return res.status(500).json({ ok: false, error: "GEMINI_INVALID_JSON_AFTER_RETRIES" });

  } catch (err) {
    console.error("❌ API ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
