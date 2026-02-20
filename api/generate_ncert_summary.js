import { GoogleGenerativeAI } from "@google/generative-ai";
import { getCorsHeaders } from "./cors";

export const config = { runtime: "nodejs" };
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  // -------- Unified CORS --------
  const origin = req.headers.origin || "";
  const headers = getCorsHeaders(origin);
  
  // FIX: Force a valid origin if cors.js returns '*' to avoid Credential conflict
  if (headers["Access-Control-Allow-Origin"] === "*") {
    headers["Access-Control-Allow-Origin"] = "https://ready4exam.github.io";
  }
  
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    // Safe body parsing for text/plain
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meta = body?.meta;

    if (!meta) return res.status(400).json({ error: "Missing meta payload" });

    // FIX: Changed "gemini-2.5-flash" to "gemini-1.5-flash"
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Act as an NCERT Educator. For Class ${meta.classId}, Subject ${meta.subject}, Discipline ${meta.discipline}, and Chapter "${meta.chapterTitle}", generate a high-density JSON summary...
    
    [... rest of your prompt logic ...]

    RETURN ONLY RAW JSON matching this structure:
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

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const cleanJson = responseText.replace(/```json|```/g, "").trim();

    return res.status(200).json(JSON.parse(cleanJson));

  } catch (error) {
    console.error("AI Generation Error:", error);
    return res.status(500).json({ error: "AI generation failed", details: error.message });
  }
}
