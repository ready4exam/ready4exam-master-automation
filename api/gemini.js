import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

// SAFETY CHECK: Ensure API Key is loaded
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error("SERVER CONFIG ERROR: GEMINI_API_KEY is missing in Vercel.");
}

// 1. MATCHING YOUR SUCCESSFUL CURL MODEL
const MODEL_NAME = "gemini-1.5-flash-latest";

function cleanJSON(text) {
  if (!text) return null;
  // 1. Remove Markdown Wrappers
  let clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  
  // 2. Find the Array brackets [ ... ]
  const first = clean.indexOf("[");
  const last = clean.lastIndexOf("]");
  
  if (first === -1 || last === -1) return null;
  
  // 3. Extract and Parse
  clean = clean.substring(first, last + 1);
  try {
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;
    if (!meta) return res.status(400).json({ ok: false, error: "Missing meta" });

    const client = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = client.getGenerativeModel({ model: MODEL_NAME });

    // 2. SIMPLIFIED PROMPT (Mimics your Curl)
    // We request 10 questions first to ensure stability. 
    // Once this passes, we can increase it.
    const prompt = `
    You are a strict API. Return ONLY a JSON Array.
    Task: Generate 10 MCQ Questions for Class ${meta.class_name}, Subject: ${meta.subject}, Chapter: ${meta.chapter}.
    
    Format:
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

    const result = await model.generateContent(prompt);
    const rawText = result.response.text();

    // 3. PARSE
    const questions = cleanJSON(rawText);

    if (!questions || !Array.isArray(questions)) {
      // 4. DEBUGGING: Return the ACTUAL bad output to the frontend
      console.error("BAD OUTPUT:", rawText);
      return res.status(500).json({ 
        ok: false, 
        error: "INVALID_JSON", 
        raw_output: rawText // This will show up in your Network Tab
      });
    }

    return res.status(200).json({
      ok: true,
      count: questions.length,
      questions
    });

  } catch (err) {
    console.error("API FAIL:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
