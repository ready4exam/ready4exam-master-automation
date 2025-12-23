// ============================================================================
// /api/gemini.js — FINAL STABLE VERSION
// Fix: Uses ONLY "gemini-1.5-flash" (No experimental/deprecated chains)
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 1. STABLE MODEL CONFIGURATION
// We use ONLY this model because it is the current standard.
// Removing the chain prevents 404 errors from deprecated models.
const MODEL_NAME = "gemini-1.5-flash";

// 2. ROBUST JSON PARSER
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

    // 3. GENERATION LOGIC
    const client = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = client.getGenerativeModel({ model: MODEL_NAME });

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

    // Attempt generation
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse
    const questions = cleanJSON(text);
    
    // Validation
    if (!questions || !Array.isArray(questions)) {
        throw new Error("AI returned invalid JSON format.");
    }

    return res.status(200).json({
      ok: true,
      board,
      count: questions.length,
      questions
    });

  } catch (err) {
    console.error("Gemini API Error:", err.message);
    return res.status(500).json({ 
        ok: false, 
        error: err.message
    });
  }
}
