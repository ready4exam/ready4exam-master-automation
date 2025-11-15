// /api/gemini.js
// Robust question generator wrapper
// - Accepts { meta } in POST
// - Prefers JSON (parsed) response then falls back to robust CSV parsing
// - Returns { ok: true, questions: [...] } with normalized objects

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

// Robust CSV parser (handles quoted fields and commas inside quotes)
function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    // If cols < headers, try to concatenate subsequent lines (very rare)
    if (cols.length < headers.length) {
      // attempt best-effort: join with next line and reparse (not ideal but helps)
      // fallback: skip malformed rows
      continue;
    }
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = cols[j] !== undefined ? cols[j] : "";
    }
    rows.push(obj);
  }
  return rows;
}

// Parse a single CSV line into columns (handles quoted strings with commas)
function parseCSVLine(line) {
  const cols = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' ) {
      // If double quote and next char is double quote, it's an escaped quote
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++; // skip escaped quote
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
  return cols.map(s => s.trim());
}

function extractCSV(geminiText) {
  // If JSON present, prefer it
  // Try to find first JSON object in the text
  try {
    const jsonMatch = geminiText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && (parsed.csv || parsed.questions)) {
        if (parsed.csv) return parsed.csv;
        if (Array.isArray(parsed.questions)) {
          // Convert questions array to CSV-like rows if needed later; but return questions directly
          return { asJSONQuestions: parsed.questions };
        }
      }
    }
  } catch (e) {
    // ignore JSON parse errors; fall back to CSV path
  }

  // Otherwise assume entire response is CSV
  return geminiText.trim();
}

function buildPrompt(meta) {
  const { class_name, subject, chapter } = meta || {};
  return `
Generate exactly 60 unique quiz questions strictly based on NCERT/CBSE syllabus for:

Class: ${class_name}
Subject: ${subject}
Chapter: ${chapter}

Output MUST BE ONLY CSV (or JSON object with 'questions' array or 'csv' string). No explanation.

CSV headers EXACTLY:

difficulty,question_type,question_text,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key

Difficulty values: Simple, Medium, Advanced.
question_type: MCQ, AR, Case-Based.

For CSV: use double quotes for fields that contain commas. Use standard CSV quoting.
  `;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta } = body || {};
    if (!meta) return res.status(400).json({ ok: false, error: "Missing meta in request body." });

    const API_KEY = process.env.google_api || process.env.GEMINI_API_KEY;
    if (!API_KEY) throw new Error("Missing Gemini API key in environment variables.");

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = buildPrompt(meta);
    const result = await model.generateContent(prompt);
    const raw = await result.response.text();
    const extracted = extractCSV(raw);

    // If model returned an object with questions array (parsed earlier), return directly
    if (typeof extracted === "object" && extracted.asJSONQuestions) {
      const questions = extracted.asJSONQuestions;
      return res.status(200).json({ ok: true, questions, raw });
    }

    // If extractCSV returned an object with csv string, handle
    let csvText = extracted;
    if (typeof extracted === "object" && extracted.csv) csvText = extracted.csv;

    // Parse CSV robustly
    const rows = parseCSV(csvText);

    // Validate required headers exist in first row objects
    if (!rows.length) {
      return res.status(500).json({ ok: false, error: "Gemini returned no valid CSV rows." });
    }

    const requiredHeaders = ["difficulty", "question_type", "question_text", "scenario_reason_text", "option_a", "option_b", "option_c", "option_d", "correct_answer_key"];
    const first = rows[0];
    for (const h of requiredHeaders) {
      if (!(h in first)) {
        return res.status(500).json({ ok: false, error: `Missing expected header "${h}" in generated CSV.` });
      }
    }

    return res.status(200).json({ ok: true, questions: rows, raw: csvText });
  } catch (err) {
    console.error("❌ Gemini API Error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal server error" });
  }
}
