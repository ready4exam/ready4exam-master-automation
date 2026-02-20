// ============================================================================
// /api/generate_ncert_summary.js — ROBUST FAILOVER VERSION
// ============================================================================
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getCorsHeaders } from "./cors";

export const config = { runtime: "nodejs" };
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Failover chain to handle model retirements and quota (Mirroring gemini.js logic)
const MODEL_CHAIN = [
  "gemini-1.5-flash",        // Primary stable model
  "gemini-1.5-flash-latest", // Standard backup
  "gemini-2.0-flash",        // High-speed backup
  "gemini-pro"               // Legacy fallback
];

// ----------------------------------------------------------------------------
// JSON CLEANER (Ensures valid object even if AI adds markdown)
// ----------------------------------------------------------------------------
function extractSummaryJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let text = raw.trim()
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/[\u0000-\u001F]+/g, " ")
    .replace(/\n+/g, " ")
    .replace(/“|”/g, '"')
    .replace(/‘|’/g, "'");

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");

  if (first !== -1 && last !== -1) {
    text = text.slice(first, last + 1);
  }

  try {
    const parsed = JSON.parse(text);
    // Validate required key to ensure it's the correct structure
    if (parsed && parsed.majorPoints) return { ok: true, data: parsed };
    return { ok: false, error: "INVALID_SHAPE", raw: text };
  } catch (err) {
    return { ok: false, error: "JSON_PARSE_FAILED", raw: text };
  }
}

// ----------------------------------------------------------------------------
// FAILOVER ENGINE
// ----------------------------------------------------------------------------
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  let lastErr = null;

  for (const modelId of MODEL_CHAIN) {
    try {
      const model = client.getGenerativeModel({ model: modelId });
      const output = await model.generateContent(prompt);
      const txt = output.response.text();
      if (txt && txt.trim()) return txt;
    } catch (err) {
      lastErr = err;
      console.warn(`Model ${modelId} failed, trying next...`);
      continue;
    }
  }
  throw lastErr || new Error("All models failed");
}

// ----------------------------------------------------------------------------
// MAIN HANDLER
// ----------------------------------------------------------------------------
export default async function handler(req, res) {
  // 1. Set CORS headers immediately from shared utility
  const headers = getCorsHeaders(req.headers.origin || "");
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    // 2. Robust Body Parsing (handles text/plain from frontend)
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { meta } = body;

    if (!meta) return res.status(400).json({ error: "Missing meta" });

    const prompt = `Act as an NCERT Educator. For Class ${meta.classId}, Subject ${meta.subject}, Discipline ${meta.discipline}, and Chapter "${meta.chapterTitle}", generate a high-density JSON summary.

    INSTRUCTIONS BY DISCIPLINE:
    1. Mathematics: Provide 'formulaVault' with LaTeX.
    2. Science: Include 'chemicalData', 'physicsData', or 'biologyData'.
    3. History: Provide 'historyData' (timeline and 'whoIsWho').
    4. Geography: Provide 'geographyData' (Map-points and classifications).
    5. Civics: Provide 'civicsData' (Articles and Provisions).
    6. Economics: Provide 'economicsData' (Indicators and formulas).

    ALWAYS INCLUDE: 'majorPoints', 'oneLineDefinitions', and 'tipsAndTricks'.

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

    // 3. Multi-attempt logic with failover
    for (let i = 0; i < 3; i++) {
      try {
        const raw = await callGemini(prompt);
        const parsed = extractSummaryJSON(raw);
        if (parsed.ok) return res.status(200).json(parsed.data);
      } catch (err) {
        if (i === 2) throw err;
      }
    }
  } catch (error) {
    console.error("Summary Crash:", error);
    return res.status(500).json({ error: "Generation Failed", details: error.message });
  }
}
