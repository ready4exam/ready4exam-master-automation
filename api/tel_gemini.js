// ============================================================================
// /api/tel_gemini.js — TELANGANA STATE BOARD (SCERT) VERSION
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ============================================================================
//  1. MODEL FAILOVER CHAIN (Free-Tier Resilience)
// ============================================================================
const MODEL_CHAIN = [
  "gemini-2.5-flash",        // Primary: Fast & High Quality
  "gemini-flash-latest",     // Backup 1
  "gemini-2.0-flash",        // Backup 2
  "gemini-1.5-flash"         // Legacy Backup
];

// ============================================================================
//  2. JSON CLEANER & PARSER
// ============================================================================
function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  // aggressively strip markdown and code blocks
  let text = raw.trim()
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/[\u0000-\u001F]+/g, " ") // Remove control chars
    .replace(/\n+/g, " ")               // Flatten newlines
    .replace(/“|”/g, '"')               // Fix smart quotes
    .replace(/‘|’/g, "'");

  // Extract content between the first [ and last ]
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");

  if (first !== -1 && last !== -1) {
    text = text.slice(first, last + 1);
  }

  // Attempt parse
  try {
    const parsed = JSON.parse(text);
    
    // Validate shape
    if (Array.isArray(parsed)) return { ok: true, questions: parsed };
    if (parsed.questions && Array.isArray(parsed.questions)) return { ok: true, questions: parsed.questions };
    
    return { ok: false, error: "INVALID_JSON_SHAPE", raw: text };
  } catch (err) {
    return { ok: false, error: "INVALID_JSON_PARSE", raw: text };
  }
}

// ============================================================================
//  3. GEMINI CALLER WITH FAILOVER
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
        console.warn("⚠ Empty output → switching model");
        continue;
      }

      console.log(`✅ Success with ${model}`);
      return txt;

    } catch (err) {
      lastErr = err;
      const status = err?.status;
      console.error(`❌ ${model} failed (${status}):`, err.message);

      // Handle Quota (429) or Server Error (500/503)
      if (status === 429 || status === 500 || status === 503) {
        await new Promise(r => setTimeout(r, 1000)); // Brief pause before next model
        continue; 
      }
      
      // If it's a content blocking error, likely won't work on other models either, but we try.
      continue;
    }
  }

  throw lastErr || new Error("All models failed to generate content.");
}

// ============================================================================
//  4. MAIN HANDLER
// ============================================================================
export default async function handler(req, res) {
  
  // ------------ CORS ------------
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
    //  ⭐ PROMPT: TELANGANA STATE BOARD / SCERT FOCUS
    // ========================================================================
    const prompt = `
You are an expert academic content creator for the **Telangana State Board (SCERT)** curriculum.

TASK: Generate a strictly formatted JSON array of questions.

CONTEXT:
- Class: ${meta.class_name} (Telangana State Board)
- Subject: ${meta.subject}
- Chapter: ${meta.chapter}

REQUIREMENTS:
1. **Quantity:** EXACTLY 60 Questions.
2. **Syllabus:** Strictly follow the SCERT Telangana textbook content.
3. **Difficulty Mix:** - 20 Simple (Recall/Definition)
   - 20 Medium (Conceptual/Application)
   - 20 Advanced (Critical Thinking/Analysis)
4. **Question Types:**
   - Majority: Multiple Choice Questions (MCQ)
   - Required: At least 10 "Assertion-Reason" or "Case-Based" questions.
5. **Formatting Rules:**
   - Output MUST be a valid JSON Array.
   - No markdown, no "Here is the JSON", no code blocks. Just the raw array.
   - For MCQs: "scenario_reason_text" must be empty string "".
   - For Case-Based/AR: "scenario_reason_text" contains the Case or Assertion/Reason text.

JSON STRUCTURE (Strictly enforce this):
[
  {
    "difficulty": "Simple", 
    "question_type": "MCQ",
    "question_text": "The capital of Telangana is?",
    "scenario_reason_text": "",
    "option_a": "Warangal",
    "option_b": "Hyderabad",
    "option_c": "Nizamabad",
    "option_d": "Karimnagar",
    "correct_answer_key": "B"
  }
]

FINAL INSTRUCTION: Return ONLY the JSON array.
`;

    const start = Date.now();

    // ========================================================================
    //  RETRY LOOP (3 Attempts)
    // ========================================================================
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`🔁 Attempt ${attempt}/3 for ${meta.chapter}`);

      try {
        const raw = await callGemini(prompt);
        const result = extractJSON(raw);

        if (result.ok) {
          return res.status(200).json({
            ok: true,
            engine: "tel_gemini_v1",
            attempts: attempt,
            count: result.questions.length,
            durationMs: Date.now() - start,
            questions: result.questions,
          });
        }
        console.warn("⚠ JSON Parse failed on attempt " + attempt);

      } catch (innerErr) {
        console.error(`Attempt ${attempt} error:`, innerErr.message);
      }
    }

    // Fail state
    return res.status(500).json({ ok: false, error: "Failed to generate valid JSON after 3 attempts." });

  } catch (err) {
    console.error("❌ API CRITICAL FAIL:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
