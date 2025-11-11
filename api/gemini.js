// ✅ /api/gemini.js — Ready4Exam Production Gemini Automation
// Generates 60 exam questions using Gemini 2.5 Flash and returns them to frontend.
// Works with manageSupabase.js → inserts into Supabase tables automatically.

import fetch from "node-fetch";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // Allow preflight CORS
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY in environment.");

    // -----------------------------
    // Parse input from frontend
    // -----------------------------
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { class_name, subject, book, chapter } = body || {};

    if (!class_name || !subject || !chapter) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // -----------------------------
    // Define generation prompt
    // -----------------------------
    const prompt = `
You are a question generator for a learning platform "Ready4Exam".

Generate exactly 60 unique questions for:
- Class: ${class_name}
- Subject: ${subject}
- Book: ${book || "N/A"}
- Chapter: ${chapter}

Breakdown:
- 20 Easy (10 MCQ, 5 Assertion-Reason, 5 Case-Based)
- 20 Medium (same mix)
- 20 Advanced (same mix)

Output JSON array strictly in this format (no markdown, no extra text):

[
  {
    "difficulty": "Easy",
    "question_type": "MCQ",
    "question_text": "Question text here",
    "scenario_reason_text": "",
    "option_a": "A",
    "option_b": "B",
    "option_c": "C",
    "option_d": "D",
    "correct_answer_key": "A"
  },
  ...
]
    `;

    // -----------------------------
    // Gemini API request
    // -----------------------------
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Gemini error response:", data);
      return res.status(response.status).json({ error: data.error?.message || "Gemini request failed" });
    }

    // -----------------------------
    // Extract text safely
    // -----------------------------
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error("Empty Gemini response.");

    // Clean JSON
    const jsonMatch = text.match(/\[([\s\S]*)\]/);
    if (!jsonMatch) throw new Error("Gemini did not return JSON format.");
    const jsonText = `[${jsonMatch[1]}]`;

    let questions;
    try {
      questions = JSON.parse(jsonText);
    } catch (err) {
      console.error("❌ JSON parse failed:", err);
      throw new Error("Invalid JSON in Gemini response.");
    }

    if (!Array.isArray(questions) || questions.length === 0)
      throw new Error("Gemini returned no questions.");

    console.log(`✅ Gemini generated ${questions.length} questions for ${subject} - ${chapter}`);

    // -----------------------------
    // Return to frontend
    // -----------------------------
    return res.status(200).json({
      ok: true,
      count: questions.length,
      questions,
    });
  } catch (err) {
    console.error("❌ /api/gemini error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
}
