// api/gemini.js
// -------------------------------------------------------------
// Phase-3 Stable Gemini Question Generator
// • Uses NEW 60-question strict CBSE/NCERT CSV prompt
// • Universal extractor: survives malformed JSON / CSV
// • Always returns: { ok: true, questions: [...] }
// -------------------------------------------------------------

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

// -------------------------------------------------------------
// CLEAN CSV PARSER
// -------------------------------------------------------------
function parseCSV(csvText) {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(","); // assumes Gemini keeps commas stable
    if (cols.length < headers.length) continue;

    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] || "";
    });

    rows.push(obj);
  }

  return rows;
}

// -------------------------------------------------------------
// UNIVERSAL EXTRACTOR (CSV enforced)
// -------------------------------------------------------------
function extractCSV(geminiText) {
  // If the model returned JSON, extract the CSV string inside
  if (geminiText.includes("{") && geminiText.includes("}")) {
    try {
      const jsonMatch = geminiText.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.csv) return parsed.csv;
      }
    } catch (_) {
      // ignore
    }
  }

  // Otherwise assume the entire response *is* CSV
  return geminiText.trim();
}

// -------------------------------------------------------------
// MAIN PROMPT (applies your new 60-question rules)
// -------------------------------------------------------------
function buildPrompt(meta) {
  const { class_name, subject, chapter } = meta;

  return `
Generate exactly **60** unique quiz questions strictly based on **NCERT/CBSE** syllabus for:

Class: ${class_name}
Subject: ${subject}
Chapter: ${chapter}

Your output MUST BE **ONLY CSV**, no explanation, no markdown.

Follow EXACTLY this schema (headers must match exactly):

difficulty,question_type,question_text,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key

Use these **distribution rules**:

• Simple: 20 questions  
   - 10 MCQ  
   - 5 AR  
   - 5 Case-Based  

• Medium: 20 questions  
   - 10 MCQ  
   - 5 AR  
   - 5 Case-Based  

• Advanced: 20 questions  
   - 10 MCQ  
   - 5 AR  
   - 5 Case-Based  

Difficulty values MUST be exactly: Simple, Medium, Advanced.

question_type MUST be one of: MCQ, AR, Case-Based.

AR questions MUST use these exact standard options:
A: Both A and R are true, and R is the correct explanation of A.
B: Both A and R are true, but R is not the correct explanation of A.
C: A is true, but R is false.
D: A is false, but R is true.

• For MCQ: scenario_reason_text MUST be empty  
• For AR: scenario_reason_text MUST contain the Reason (R)  
• For Case-Based: scenario_reason_text MUST contain the scenario/case  

Output ONLY valid CSV data. No quotes unless necessary.
  `;
}

// -------------------------------------------------------------
// HANDLER
// -------------------------------------------------------------
export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const { meta } = req.body;
    if (!meta) return res.status(400).json({ ok: false, error: "Missing meta" });

    const API_KEY = process.env.google_api || process.env.GEMINI_API_KEY;

    if (!API_KEY)
      throw new Error("Missing Gemini API key in environment variables.");

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = buildPrompt(meta);

    const result = await model.generateContent(prompt);
    const raw = await result.response.text();

    const csvText = extractCSV(raw);
    const rows = parseCSV(csvText);

    if (!rows.length)
      return res.status(500).json({
        ok: false,
        error: "Gemini returned no valid CSV rows",
      });

    return res.status(200).json({
      ok: true,
      questions: rows,
      raw: csvText, // optional: remove if not needed
    });
  } catch (err) {
    console.error("❌ Gemini API Error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Internal server error",
    });
  }
}
