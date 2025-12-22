import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const MODEL_CHAIN = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest"
];

async function getBatch(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);

  for (const modelName of MODEL_CHAIN) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json"
        }
      });

      const result = await model.generateContent(prompt);
      const raw = result.response.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!raw) continue;

      const parsed = JSON.parse(raw);

      // CRITICAL FIX: Handle both Raw Array and Object Wrapper
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (parsed && Array.isArray(parsed.questions)) {
        return parsed.questions;
      }

    } catch (err) {
      continue;
    }
  }
  return [];
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
    Generate 30 MCQ questions.
    Board: ${board}
    Class: ${rawClass}
    Subject: ${meta.subject}
    Chapter: ${meta.chapter}

    Strict Requirements:
    - Return ONLY a JSON array.
    - Mix Simple, Medium, Advanced.
    - correct_answer_key must be "A", "B", "C", or "D".

    JSON Format:
    [
      {
        "difficulty": "Simple|Medium|Advanced",
        "question_type": "MCQ",
        "question_text": "string",
        "scenario_reason_text": "string",
        "option_a": "string",
        "option_b": "string",
        "option_c": "string",
        "option_d": "string",
        "correct_answer_key": "A"
      }
    ]
    `;

    // Retry Loop
    for (let attempt = 1; attempt <= 3; attempt++) {
      const questions = await getBatch(prompt);
      if (questions.length >= 5) {
        return res.status(200).json({
          ok: true,
          board,
          count: questions.length,
          attempts: attempt,
          questions
        });
      }
    }

    return res.status(500).json({ ok: false, error: "Gemini failed to generate valid JSON." });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
