import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "POST only" });

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const meta = body?.meta;
    if (!meta)
      return res.status(400).json({ ok: false, error: "Missing meta" });

    const prompt = `
You are a school teacher preparing practice questions.

For the following syllabus details, create exactly THREE multiple-choice questions:

Board: Telangana State Board (SCERT)
Class: ${meta.class_name}
Subject: ${meta.subject}
Chapter: ${meta.chapter}

Requirements:
- Question 1: Simple difficulty
- Question 2: Medium difficulty
- Question 3: Advanced difficulty
- Each question should have 4 options (A, B, C, D)
- Clearly mention the correct answer for each question

Just write the questions naturally the way a teacher would.
`;

    const client = new GoogleGenerativeAI(GEMINI_API_KEY);

    // ✅ CORRECT MODEL
    const model = client.getGenerativeModel({ model: "gemini-pro" });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return res.status(200).json({
      ok: true,
      mode: "diagnostic-raw",
      output: text
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
