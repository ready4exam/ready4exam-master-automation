// ============================================================================
// /api/gemini.js — UNIVERSAL PRODUCTION VERSION (FIXED & ROBUST)
// Supports: CBSE, Telangana, ICSE, Karnataka, etc.
// Features: Failover Chain, Aggressive JSON Cleaning, and Multi-Board Logic
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Failover Chain using different model versions to ensure 200 OK
const MODEL_CHAIN = [
  "gemini-2.0-flash",        
  "gemini-1.5-flash",        
  "gemini-1.5-flash-latest", 
  "gemini-2.0-flash-lite-preview" 
];

// ============================================================================
// AGGRESSIVE JSON EXTRACTION (Fixes Parsing Errors)
// ============================================================================
function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  // Remove markdown tags and non-printable characters
  let text = raw.trim()
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/[\u0000-\u001F]+/g, " ")
    .replace(/“|”/g, '"')
    .replace(/‘|’/g, "'")
    .replace(/,\s*]/g, "]")
    .replace(/,\s*}/g, "}");

  // Locate the array boundaries
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");

  if (first !== -1 && last !== -1) {
    text = text.slice(first, last + 1);
  }

  try {
    const parsed = JSON.parse(text);
    const questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);
    if (questions.length > 0) return { ok: true, questions };
    return { ok: false, error: "ZERO_QUESTIONS_PARSED" };
  } catch (err) {
    return { ok: false, error: "INVALID_JSON_FORMAT", raw: text };
  }
}

// ============================================================================
// GEMINI ENGINE WITH FAILOVER
// ============================================================================
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  let lastErr = null;

  for (const model of MODEL_CHAIN) {
    try {
      const g = client.getGenerativeModel({ model });
      const output = await g.generateContent(prompt);
      const txt = output.response.text();

      if (txt && txt.trim().length > 0) return txt;
    } catch (err) {
      lastErr = err;
      console.log(`❌ Model ${model} failed. Trying next...`);
      continue;
    }
  }
  throw lastErr || new Error("All Gemini models failed to respond.");
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta || !meta.chapter) {
      return res.status(400).json({ error: "Missing metadata (chapter/subject)" });
    }

    // ⭐ DYNAMIC BOARD DETECTION
    const rawClass = meta.class_name || "";
    const isCBSE = !isNaN(rawClass); 
    
    let boardLabel = "NCERT / CBSE";
    let boardInstruction = "Strictly follow NCERT curriculum standards.";

    if (!isCBSE) {
      if (rawClass.includes("Telangana")) {
        boardLabel = "Telangana State Board (SCERT)";
        boardInstruction = "Follow Telangana SCERT textbook depth and specific scientific terminology.";
      } else if (rawClass.includes("ICSE")) {
        boardLabel = "ICSE (CISCE) Board";
        boardInstruction = "Follow ICSE application-based curriculum style.";
      }
    }

    // THE PROMPT
    const prompt = `
Output ONLY a valid JSON array. No conversational text or markdown.
Expert Examiner Mode: ${boardLabel}
Generate EXACTLY 60 questions for Class ${rawClass}, Subject: ${meta.subject}, Chapter: ${meta.chapter}.

STRICT JSON STRUCTURE:
[{
  "difficulty": "Simple | Medium | Advanced",
  "question_type": "MCQ | Case-Based | AR",
  "question_text": "",
  "scenario_reason_text": "",
  "option_a": "", "option_b": "", "option_c": "", "option_d": "",
  "correct_answer_key": "A"
}]

REQUIREMENTS:
1. Standards: ${boardInstruction}
2. Distribution: 20 Simple, 20 Medium, 20 Advanced.
3. Content: Include at least 10 Assertion-Reason or Case-Based questions.
4. Language: Clear and technically accurate.
`;

    // 3 ATTEMPTS GLOBAL LOOP
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const raw = await callGemini(prompt);
        const result = extractJSON(raw);

        if (result.ok) {
          return res.status(200).json({
            ok: true,
            questions: result.questions,
            board: boardLabel,
            attempts: attempt
          });
        }
      } catch (err) {
        console.error(`Attempt ${attempt} failed:`, err.message);
      }
    }

    res.status(500).json({ error: "GEMINI_INVALID_JSON_AFTER_RETRIES" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
