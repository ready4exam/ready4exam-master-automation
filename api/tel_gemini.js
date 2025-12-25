// ============================================================================
// /api/tel_gemini.js — TELANGANA + SMART LOGGING + FINAL CHECK
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

// Increase timeout for the "Smart Pause" logic
export const config = { 
  runtime: "nodejs",
  maxDuration: 60 
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ============================================================================
//  1. VERIFIED MODEL CHAIN
// ============================================================================
const MODEL_CHAIN = [
  "gemini-2.5-flash",        // Primary
  "gemini-flash-latest",     // Backup
  "gemini-2.0-flash",        // Stable Fallback
  "gemini-2.5-pro",          // Smart Fallback
  "gemini-3-flash-preview"   // Experimental
];

// ============================================================================
//  2. JSON CLEANER
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

  if (first !== -1 && last !== -1) {
    text = text.slice(first, last + 1);
  }

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { ok: true, questions: parsed };
    if (parsed.questions && Array.isArray(parsed.questions)) return { ok: true, questions: parsed.questions };
    return { ok: false, error: "INVALID_JSON_SHAPE", raw: text };
  } catch (err) {
    return { ok: false, error: "INVALID_JSON_PARSE", raw: text };
  }
}

// ============================================================================
//  3. GEMINI CALLER WITH FINAL CHECK
// ============================================================================
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  let lastErr = null;
  let hitRateLimit = false; // Flag to track if we faced 429s

  // --- PASS 1: Try all models in the chain ---
  for (const model of MODEL_CHAIN) {
    try {
      console.log(`⚡ [tel_gemini] Trying model: ${model}`);
      const g = client.getGenerativeModel({ model });
      const output = await g.generateContent(prompt);
      const txt = output.response.text();

      if (!txt || !txt.trim()) {
        console.warn(`⚠ [${model}] Returned empty output. Skipping.`);
        continue;
      }
      return txt; // Success!

    } catch (err) {
      lastErr = err;
      const status = err?.status;
      
      // ⭐ LOGGING: Rate Limit vs Quota vs Crash
      if (status === 429) {
        hitRateLimit = true;
        console.warn(`⏳ [${model}] Rate Limit Hit (429). Pausing 5s to cool down...`);
        // Pause 5 seconds before trying the next model
        await new Promise(r => setTimeout(r, 5000));
        continue;
      } 
      
      if (status === 403) {
        console.error(`⛔ [${model}] Quota Exceeded or API Key Invalid (403).`);
        // 403 usually means Daily Limit is done, but we keep trying other models just in case.
        continue;
      }

      console.error(`❌ [${model}] Failed with status ${status}:`, err.message);
      continue;
    }
  }

  // --- PASS 2: FINAL HAIL MARY CHECK ---
  // If we tried everything and failed, but we hit Rate Limits earlier, 
  // it might just be a "busy" moment. Let's try ONE LAST TIME.
  if (hitRateLimit) {
    console.log("🛑 All primary attempts failed. attempting FINAL CHECK with 'gemini-2.0-flash'...");
    try {
      // Wait 3 more seconds for a final cooldown
      await new Promise(r => setTimeout(r, 3000));
      
      const g = client.getGenerativeModel({ model: "gemini-2.0-flash" }); // Use the most stable one
      const output = await g.generateContent(prompt);
      const txt = output.response.text();
      
      if (txt) {
        console.log("✅ Final Check SUCCEEDED! Saved from error.");
        return txt;
      }
    } catch (finalErr) {
      console.error("💀 Final Check also failed. The quota is definitely exhausted.");
    }
  }

  // If we reach here, we are truly done.
  throw new Error("CRITICAL_FAILURE: API Quota Likely Exhausted. All models failed.");
}

// ============================================================================
//  4. MAIN HANDLER
// ============================================================================
export default async function handler(req, res) {
  
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
    //  PROMPT
    // ========================================================================
    const prompt = `
You MUST output ONLY a valid JSON array.
No text before it. No text after it. No commentary. No markdown.

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
1. **Quantity:** EXACTLY 60 Questions.
2. **Syllabus:** Strictly follow the SCERT Telangana textbook.
3. **Mix:** 20 Simple, 20 Medium, 20 Advanced.
4. **Types:** Majority MCQ; at least 10 "Assertion-Reason" or "Case-Based".
5. **Math Rendering (CRITICAL):**
   - Use **Unicode symbols** (e.g., √, π, ², ³, θ, ÷, ×, °) directly.
   - **DO NOT** use LaTeX code (e.g., no \\frac, no \\sqrt, no \\text). 
   - Write fractions like "1/2" or "(3+√2)/5".
   - Make it readable as plain text.

FINAL RULE:
Return ONLY the JSON array.
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
            engine: "tel_gemini_final_robust",
            attempts: attempt,
            count: result.questions.length,
            durationMs: Date.now() - start,
            questions: result.questions,
          });
        }
      } catch (innerErr) {
        console.error(`Attempt ${attempt} error:`, innerErr.message);
        
        // If it's the specific "Quota Exhausted" error from our function, stop retrying immediately.
        if (innerErr.message.includes("CRITICAL_FAILURE")) {
           return res.status(429).json({ 
             ok: false, 
             error: "API_QUOTA_EXHAUSTED", 
             message: "Daily quota reached or all models busy. Please try again later."
           });
        }
      }
    }

    return res.status(500).json({ ok: false, error: "Failed to generate valid JSON." });

  } catch (err) {
    console.error("❌ API CRITICAL FAIL:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
