import { GoogleGenerativeAI } from "@google/generative-ai";
import { getCorsHeaders } from "../cors.js";

export const config = {
  runtime: "nodejs"
};

// Helper function to parse one CSV line
function parseCSVLine(line) {
  const cols = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cols.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols.map((s) => s.trim());
}

// Parse entire CSV
function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (!cols.length) continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = cols[j] !== undefined ? cols[j] : "";
    }
    rows.push(obj);
  }
  return rows;
}

function buildPrompt(meta) {
  const { class_name, subject, chapter } = meta || {};
  return `
Generate exactly 60 unique exam-style questions strictly based on NCERT/CBSE syllabus:

Class: ${class_name}
Subject: ${subject}
Chapter: ${chapter}

Output MUST be ONLY CSV.

CSV headers EXACTLY:

difficulty,question_type,question_text,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key

Rules:
- difficulty: Simple, Medium, Advanced
- question_type: MCQ, AR, Case-Based
- Use double quotes around fields containing commas.
- NO extra commentary or explanation outside CSV.
`;
}

export default async function handler(req, res) {
  // Apply CORS headers FIRST
  const origin = req.headers.origin || "*";
  const headers = {
    ...getCorsHeaders(origin),
    "Content-Type": "application/json",
    "Access-Control-Max-Age": "86400"
  };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // Correct OPTIONS handling
  if (req.method.toUpperCase() === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method.toUpperCase() !== "POST") {
    res.status(405).json({ ok: false, error: "Only POST allowed" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta } = body || {};
    if (!meta) {
      res.status(400).json({ ok: false, error: "Missing meta in body." });
      return;
    }

    const API_KEY = process.env.GEMINI_API_KEY || process.env.google_api;
    if (!API_KEY) throw new Error("Missing Gemini API key in environment.");

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = buildPrompt(meta);
    const result = await model.generateContent(prompt);
    const raw = await result.response.text();
    const csvText = raw.trim();

    const rows = parseCSV(csvText);
    if (!rows.length) {
      res.status(500).json({ ok: false, error: "Gemini returned no valid CSV rows." });
      return;
    }

    const requiredHeaders = [
      "difficulty", "question_type", "question_text", "scenario_reason_text",
      "option_a", "option_b", "option_c", "option_d", "correct_answer_key"
    ];
    const first = rows[0];
    for (const h of requiredHeaders) {
      if (!(h in first)) {
        res.status(500).json({ ok: false, error: `Missing header "${h}" in generated CSV.` });
        return;
      }
    }

    const normalized = rows.map((r) => ({
      difficulty: (r.difficulty || "").trim(),
      question_type: (r.question_type || "").trim(),
      question_text: (r.question_text || "").trim(),
      scenario_reason_text: (r.scenario_reason_text || "").trim(),
      option_a: (r.option_a || "").trim(),
      option_b: (r.option_b || "").trim(),
      option_c: (r.option_c || "").trim(),
      option_d: (r.option_d || "").trim(),
      correct_answer_key: (r.correct_answer_key || "").trim().toUpperCase()
    }));

    res.status(200).json({ ok: true, questions: normalized });

  } catch (err) {
    console.error("❌ Gemini API error:", err);
    res.status(500).json({ ok: false, error: err.message || "Internal server error" });
  }
}
