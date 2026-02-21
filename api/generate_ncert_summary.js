import { GoogleGenerativeAI } from "@google/generative-ai";
import { getCorsHeaders } from "./cors.js";

/**
 * Summary API request contract (canonical metadata schema):
 * {
 *   meta: {
 *     class_name: string,   // required
 *     subject: string,      // required
 *     chapter: string,      // required
 *     book?: string,
 *     topicSlug?: string
 *   }
 * }
 *
 * Backward-compatible aliases accepted from automation/frontend:
 * - classId -> class_name
 * - chapterTitle -> chapter
 */

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ⭐ EXACT MODEL CHAIN FROM WORKING gemini.js
const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-1.5-flash"
];

const REQUIRED_META_FIELDS = ["classId", "subject", "chapterTitle"];

function sendError(res, status, error, details) {
  const payload = { ok: false, error };
  if (details !== undefined) payload.details = details;
  return res.status(status).json(payload);
}

// Robust JSON extraction for objects
function extractJSON(raw) {
  if (!raw) return { ok: false };
  let text = raw.trim().replace(/```json/gi, "").replace(/```/g, "");
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1) text = text.slice(first, last + 1);
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function normalizeMeta(meta = {}) {
  const classId = meta.class_name || meta.classId;
  const subject = meta.subject;
  const chapterTitle = meta.chapter || meta.chapterTitle;
  const book = meta.book;
  const topicSlug = meta.topicSlug;

  return { classId, subject, chapterTitle, book, topicSlug };
}

async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  for (const modelId of MODEL_CHAIN) {
    try {
      console.log("⚡ Trying summary model:", modelId);
      const g = client.getGenerativeModel({ model: modelId });
      const output = await g.generateContent(prompt);
      return output.response.text();
    } catch (err) {
      console.log(`❌ ${modelId} failed:`, err.message);
      continue;
    }
  }
  throw new Error("All summary models failed");
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();

  if (!GEMINI_API_KEY) {
    return sendError(res, 503, "GEMINI_API_KEY not configured");
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta } = body || {};
    const normalizedMeta = normalizeMeta(meta);
    const missingFields = [];

    if (!normalizedMeta.classId) missingFields.push("class_name");
    if (!normalizedMeta.subject) missingFields.push("subject");
    if (!normalizedMeta.chapterTitle) missingFields.push("chapter");

    if (missingFields.length) {
      return res.status(400).json({
        error: `Missing required metadata fields after normalization: ${missingFields.join(", ")}`
      });
    }

    const prompt = `Act as an NCERT Educator. Class ${normalizedMeta.classId}, Subject ${normalizedMeta.subject}, Chapter "${normalizedMeta.chapterTitle}". 
    Return a high-density JSON summary with these exact keys: formulaVault, oneLineDefinitions, majorPoints, tipsAndTricks, historyData, geographyData, civicsData, economicsData.
    Return ONLY raw JSON.`;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const raw = await callGemini(prompt);
      const parsed = extractJSON(raw);
      if (parsed.ok) return res.status(200).json(parsed.data);
    }

    return sendError(res, 500, "Failed to generate valid JSON summary");
  } catch (err) {
    return sendError(res, 500, "Failed to generate summary", { message: err.message });
  }
}
