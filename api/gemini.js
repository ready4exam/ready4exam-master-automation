// ============================================================================
// /api/gemini.js — PRODUCTION FIX (CORRECT MODEL NAMES)
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// FIX: Use canonical model names supported by the Node SDK (v1)
// Removed "-latest" suffix which causes 404 errors
const MODEL_CHAIN = [
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-1.0-pro"
];

// Helper to reliably extract JSON from text
function cleanJSON(text) {
  if (!text) return null;
  
  // 1. Remove Markdown code blocks
  let clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  
  // 2. Find the JSON array brackets
  const first = clean.indexOf("[");
  const last = clean.lastIndexOf("]");
  
  if (first === -1 || last === -1) return null;
  
  // 3. Parse
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

  // Try models in order until one works
  for (const modelName of MODEL_CHAIN) {
    try {
      const model = client.getGenerativeModel({ model: modelName });
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      const parsed = cleanJSON(text);
      
      // Handle { "questions": [...] } vs [...]
      if (parsed) {
        if (Array.isArray(parsed)) return parsed;
        if (parsed.questions && Array.isArray(parsed.questions)) return parsed.questions;
      }

    } catch (err) {
      console.error(`Model ${modelName} failed:`, err.message);
      lastError = err;
      // If 404, strictly try the next model
      continue;
    }
  }
  
  throw lastError || new Error("All models failed to generate valid JSON");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta) return res.status(400).json({ ok: false, error: "Missing meta" });

    const rawClass = meta.class_name || "";
    const isCBSE = !isNaN(rawClass);
    const board = !isCBSE && rawClass.includes("Telangana") ? "Telangana State Board (SCERT)" : "CBSE / NCERT";

    const prompt = `
    You are an expert exam setter for ${board}.
    Target: Class ${rawClass}, Subject: ${meta.subject}, Chapter: ${meta.chapter}

    Generate EXACTLY 30 Multiple Choice Questions (MCQ).
    
    OUTPUT FORMAT:
    Return ONLY a valid JSON Array.
    
    Structure:
    [
      {
        "difficulty": "Simple",
        "question_type": "MCQ",
        "question_text": "Question?",
        "option_a": "A",
        "option_b": "B",
        "option_c": "C",
        "option_d": "D",
        "correct_answer_key": "A"
      }
    ]
    `;

    // Attempt generation
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
