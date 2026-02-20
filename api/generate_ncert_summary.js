// ============================================================================
// /api/generate_ncert_summary.js — ROBUST FAILOVER VERSION
// Uses the same engine as gemini.js for Summaries
// ============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getCorsHeaders } from "./cors";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Failover chain to handle model retirements and quota limits
const MODEL_CHAIN = [
  "gemini-1.5-flash",        // Primary stable model
  "gemini-1.5-flash-latest", // Standard backup
  "gemini-1.5-pro",          // Higher reasoning backup
  "gemini-pro"               // Legacy backup
];

// ----------------------------------------------------------------------------
// JSON CLEANER (Adapted for Summary Object)
// ----------------------------------------------------------------------------
function extractSummaryJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let text = raw.trim()
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/[\u0000-\u001F]+/g, " ") // Clean control characters
    .replace(/\n+/g, " ")
    .replace(/“|”/g, '"')
    .replace(/‘|’/g, "'");

  // Find the first { and last } to isolate the object
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");

  if (first !== -1 && last !== -1) {
    text = text.slice(first, last + 1);
  }

  try {
    const parsed = JSON.parse(text);
    // Ensure it's a valid object with at least majorPoints
    if (parsed && typeof parsed === 'object' && parsed.majorPoints) {
      return { ok: true, data: parsed };
    }
    return { ok: false, error: "INVALID_SUMMARY_SHAPE", raw: text };
  } catch (err) {
    return { ok: false, error: "JSON_PARSE_FAILED", raw: text };
  }
}

// ----------------------------------------------------------------------------
// FAILOVER ENGINE
// ----------------------------------------------------------------------------
async function callGeminiWithFailover(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  let lastErr = null;

  for (const modelName of MODEL_CHAIN) {
    try {
      console.log(`⚡ Attempting Summary with model: ${modelName}`);
      const model = client.getGenerativeModel({ model: modelName });
      const output = await model.generateContent(prompt);
      const text = output.response.text();

      if (!text || !text.trim()) continue;

      console.log(`✅ AI Success with model: ${modelName}`);
      return text;
    } catch (err) {
      lastErr = err;
      console.log(`❌ Model ${modelName} failed:`, err.message);
      // If quota or server error, continue to next model
      continue;
    }
  }
  throw lastErr || new Error("All models in the failover chain failed.");
}

// ----------------------------------------------------------------------------
// MAIN HANDLER
// ----------------------------------------------------------------------------
export default async function handler(req, res) {
  // Set CORS headers from your shared utility immediately
  const headers = getCorsHeaders(req.headers.origin || "");
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    // Support stringified text/plain or standard JSON
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { meta } = body;

    if (!meta) return res.status(400).json({ error: "Missing meta payload" });

    const prompt = `Act as an NCERT Educator. For Class ${meta.classId}, Subject ${meta.subject}, Discipline ${meta.discipline}, and Chapter "${meta.chapterTitle}", generate a high-density JSON summary.

    INSTRUCTIONS BY DISCIPLINE:
    1. Mathematics: Provide a full 'formulaVault' with LaTeX.
    2. Science: Include 'chemicalData', 'physicsData', or 'biologyData'.
    3. History: Provide 'historyData' (timeline and 'whoIsWho').
    4. Geography: Provide 'geographyData' (Map-points and classifications).
    5. Civics: Provide 'civicsData' (Articles and Provisions).
    6. Economics: Provide 'economicsData' (Indicators and formulas).

    ALWAYS INCLUDE: 'majorPoints' (5-7 items), 'oneLineDefinitions' (glossary), and 'tipsAndTricks'.

    RETURN ONLY RAW JSON matching this structure exactly:
    { 
      "majorPoints": [], 
      "oneLineDefinitions": [{ "term": "", "definition": "" }], 
      "tipsAndTricks": [],
      "formulaVault": [],
      "historyData": { "timeline": [], "whoIsWho": [] },
      "geographyData": { "mapPoints": [], "classifications": [] },
      "civicsData": { "articles": [], "provisions": [] },
      "economicsData": { "indicators": [], "formulas": [] }
    }`;

    // Run up to 3 attempts with failover
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const rawResponse = await callGeminiWithFailover(prompt);
        const parsed = extractSummaryJSON(rawResponse);

        if (parsed.ok) {
          return res.status(200).json(parsed.data);
        }
        console.warn(`Attempt ${attempt} produced invalid JSON. Retrying...`);
      } catch (err) {
        console.error(`Attempt ${attempt} failed:`, err.message);
      }
    }

    return res.status(500).json({ error: "Summary generation failed after all attempts." });

  } catch (error) {
    console.error("API Fatal Error:", error);
    return res.status(500).json({ error: "Server crashed", details: error.message });
  }
}
