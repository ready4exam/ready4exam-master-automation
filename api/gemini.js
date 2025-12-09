// ============================================================================
// /api/gemini.js — PRODUCTION VERSION (Free Tier Failover + Strong JSON Mode)
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ============================================================================
//  MODEL FAILOVER CHAIN (Free Tier Safe)
// ============================================================================

const MODEL_CHAIN = [
  "gemini-2.5-flash",        // Best free-tier model
  "gemini-flash-latest",     // Backup
  "gemini-2.0-flash",        // Backup
  "gemini-2.5-flash-lite"    // Last fallback
];

// ============================================================================
//  BULLETPROOF JSON EXTRACTOR
// ============================================================================
function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let text = raw.trim();

  text = text.replace(/```json/gi, "").replace(/```/g, "");
  text = text.replace(/[\u0000-\u001F]+/g, " ");
  text = text.replace(/\n+/g, " ");

  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");

  if (first !== -1 && last !== -1) {
    text = text.slice(first, last + 1);
  }

  text = text.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");
  text = text.replace(/‘|’/g, "'").replace(/“|”/g, '"');

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

  for (const modelName of MODEL_CHAIN) {
    try {
      console.log(`⚡ Trying model: ${modelName}`);
      const model = client.getGenerativeModel({ model: modelName });

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      if (!text || !text.trim()) {
        console.log("⚠ Empty response → switching model");
        continue;
      }

      console.log(`✅ Success with model: ${modelName}`);
      return text;

    } catch (err) {
      lastErr = err;
      const status = err?.status;

      console.log(`❌ ${modelName} failed (${status}): ${err.message}`);

      if (status === 429) {
        console.log("🔄 Quota exceeded → trying next model");
        continue;
      }

      if (status === 500 || status === 503) {
        console.log("🔁 Transient error → retrying same model...");
        await new Promise(res => setTimeout(res, 800));
        continue;
      }

      console.log("⏭ Non-recoverable → switching model");
      continue;
    }
  }

  throw lastErr || new Error("All models failed");
}

// ============================================================================
//  MAIN HANDLER — WITH CORS (RESTORED)
// ============================================================================
export default async function handler(req, res) {

  // --------------------------------------------
  // 🔥 CORS BLOCK (RESTORED EXACTLY AS YOU WANTED)
  // --------------------------------------------
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
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
    //  STRICT JSON-ONLY PROMPT
    // ========================================================================
    const prompt = `
You MUST output ONLY a valid JSON array.
Nothing before it.
Nothing after it.
No explanations.

[
  {
    "difficulty": "Simple",
    "question_type": "MCQ",
    "question_text": "",
    "scenario_reason_text": "",
    "option_a": "",
    "option_b": "",
    "option_c": "",
    "option_d": "",
    "correct_answer_key": "A"
  }
]

CLASS: ${meta.class_name}
SUBJECT: ${meta.subject}
CHAPTER: ${meta.chapter}

Generate EXACTLY 60 NCERT-grade questions:
- 20 Simple
- 20 Medium
- 20 Advanced
- At least 10 Case-based/Assertion-Reason

Rules:
- MCQ → scenario_reason_text = ""
- Case/AR → scenario_reason_text must NOT be empty
- No nested JSON
- No multiline strings
- No escape sequences
`;

    const start = Date.now();

    // ========================================================================
    //  TRY UP TO 3 TIMES (EACH WITH MODEL FAILOVER)
    // ========================================================================
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`\n🔁 Attempt ${attempt}...`);

      try {
        const raw = await callGemini(prompt);
        const parsed = extractJSON(raw);

        if (parsed.ok) {
          return res.status(200).json({
            ok: true,
            engine: "gemini_failover",
            attempts: attempt,
            count: parsed.questions.length,
            durationMs: Date.now() - start,
            questions: parsed.questions,
          });
        }

        console.log("⚠ JSON invalid → retrying...");
      } catch (err) {
        console.error(`❌ Attempt ${attempt} failed:`, err);
      }
    }

    // If all fails:
    return res.status(500).json({
      ok: false,
      error: "GEMINI_INVALID_JSON",
    });

  } catch (err) {
    console.error("❌ FATAL:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
