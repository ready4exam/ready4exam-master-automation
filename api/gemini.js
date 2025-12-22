import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Using 1.5-flash as primary because it is the most stable for large JSON tasks
const MODEL_CHAIN = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.0-pro"
];

// Helper: robustly extract JSON from a text block (Markdown or plain)
function cleanAndExtractJSON(text) {
  if (!text) return null;
  
  // 1. Try to find a JSON array block [...]
  const firstOpen = text.indexOf("[");
  const lastClose = text.lastIndexOf("]");
  
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    const jsonCandidate = text.substring(firstOpen, lastClose + 1);
    try {
      return JSON.parse(jsonCandidate);
    } catch (e) {
      // Continue to other cleanup methods if simple extraction fails
    }
  }

  // 2. Remove Markdown code blocks if strictly wrapped
  const cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    return null;
  }
}

async function getBatch(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);

  let lastError = null;
  let rawOutput = "";

  for (const modelName of MODEL_CHAIN) {
    try {
      const model = client.getGenerativeModel({ model: modelName });
      
      // Standard text generation (mimics your successful CURL)
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      rawOutput = text; // Save for debugging

      const parsed = cleanAndExtractJSON(text);

      // Handle wrapping: { "questions": [...] } vs [...]
      if (parsed) {
        if (Array.isArray(parsed)) return parsed;
        if (parsed.questions && Array.isArray(parsed.questions)) return parsed.questions;
      }

    } catch (err) {
      console.error(`Model ${modelName} failed:`, err.message);
      lastError = err;
      continue;
    }
  }

  // Throw specific error with the raw output for debugging
  throw new Error(`Failed to parse JSON. Raw Output: ${rawOutput.substring(0, 100)}...`);
}

export default async function handler(req, res) {
  // CORS Setup
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

    // 2-Batch Strategy: Split the load to avoid token limits (30 + 30 is safer than 60)
    // BUT for stability now, let's do ONE batch of 30 to prove it works first.
    
    const prompt = `
    You are an expert exam setter for ${board}.
    Target: Class ${rawClass}, Subject: ${meta.subject}, Chapter: ${meta.chapter}

    Generate EXACTLY 30 Multiple Choice Questions (MCQ).
    
    OUTPUT FORMAT:
    Return ONLY a valid JSON Array. Do not wrap in markdown 'json' tags if possible.
    
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

    // Try up to 2 times
    for (let i = 0; i < 2; i++) {
        try {
            const questions = await getBatch(prompt);
            if (questions && questions.length > 0) {
                return res.status(200).json({
                    ok: true,
                    board,
                    count: questions.length,
                    questions
                });
            }
        } catch (e) {
            console.log(`Attempt ${i+1} failed: ${e.message}`);
            if (i === 1) throw e; // Throw on last attempt
        }
    }

  } catch (err) {
    return res.status(500).json({ 
        ok: false, 
        error: err.message || "Unknown Gemini Error" 
    });
  }
}
