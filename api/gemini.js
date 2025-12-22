// ============================================================================
// /api/gemini.js — PRODUCTION STABLE VERSION
// Logic: Robust Text-Mode Extraction + Stable Model Names
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 1. STABLE MODEL CONFIGURATION
// These are the canonical names supported by the Google Node.js SDK.
// We removed "latest" aliases to prevent 404 errors.
const MODEL_CHAIN = [
  "gemini-1.5-flash",  // Primary: Fast & Cheap
  "gemini-1.5-pro",    // Fallback: Higher Reasoning
  "gemini-1.0-pro"     // Last Resort: Legacy Stable
];

// 2. ROBUST JSON PARSER
// This allows the AI to return "Here is your JSON: [...]" without breaking the app.
function cleanJSON(text) {
  if (!text) return null;

  // A. Strip Markdown wrappers
  let clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();

  // B. Locate the array brackets [ ... ]
  const first = clean.indexOf("[");
  const last = clean.lastIndexOf("]");

  if (first === -1 || last === -1) return null;

  // C. Parse the valid substring
  clean = clean.substring(first, last + 1);
  try {
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
}

async function getBatch(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  let lastError = null;

  // 3. FAILOVER CHAIN
  // If Flash fails (rare), it automatically tries Pro.
  for (const modelName of MODEL_CHAIN) {
    try {
      const model = client.getGenerativeModel({ model: modelName });
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // 4. VALIDATION
      const parsed = cleanJSON(text);
      
      // Handle wrapped responses { "questions": [...] } vs raw [...]
      if (parsed) {
        if (Array.isArray(parsed)) return parsed;
        if (parsed.questions && Array.isArray(parsed.questions)) return parsed.questions;
      }

    } catch (err) {
      console.error(`Model ${modelName} failed:`, err.message);
      lastError = err;
      continue; // Try next model in chain
    }
  }
  
  // If we get here, all models failed or returned bad JSON
  throw lastError || new Error("AI generated invalid structure after multiple attempts.");
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta) return res.status(400).json({ ok: false, error: "Missing meta" });

    // 5. PROMPT ENGINEERING
    // We explicitly ask for 30 questions. The "Stable" models handle this context window easily.
    const rawClass = meta.class_name || "";
    const isCBSE = !isNaN(rawClass);
    const board = !isCBSE && rawClass.includes("Telangana") ? "Telangana State Board (SCERT)" : "CBSE / NCERT";

    const prompt = `
    Role: Expert Exam Setter for ${board}.
    Task: Generate EXACTLY 30 Multiple Choice Questions (MCQ).
    Target: Class ${rawClass}, Subject: ${meta.subject}, Chapter: ${meta.chapter}
    
    Format Requirement:
    Return ONLY a raw JSON Array. Do not include introductory text.
    
    JSON Structure:
    [
      {
        "difficulty": "Simple",
        "question_type": "MCQ",
        "question_text": "Question goes here?",
        "option_a": "Option A",
        "option_b": "Option B",
        "option_c": "Option C",
        "option_d": "Option D",
        "correct_answer_key": "A"
      }
    ]
    `;

    const questions = await getBatch(prompt);

    return res.status(200).json({
      ok: true,
      board,
      count: questions.length,
      questions
    });

  } catch (err) {
    return res.status(500).json({ 
        ok: false, 
        error: err.message
    });
  }
}
