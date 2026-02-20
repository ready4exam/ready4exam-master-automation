import { GoogleGenerativeAI } from "@google/generative-ai";
import { getCorsHeaders } from "./cors";

// Keep Node runtime (Gemini SDK requires it)
export const config = { runtime: "nodejs" };

// Ensure GEMINI_API_KEY exists
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {

  // -------- Unified CORS (critical) --------
  const headers = getCorsHeaders(req.headers.origin || "");
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // -------- Preflight --------
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // -------- Allow POST only --------
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { meta } = req.body || {};

    if (!meta) {
      return res.status(400).json({ error: "Missing meta payload" });
    }

    // Latest stable reasoning model
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Act as an NCERT Educator. For Class ${meta.classId}, Subject ${meta.subject}, Discipline ${meta.discipline}, and Chapter "${meta.chapterTitle}", generate a high-density JSON summary for student "Warm-up" priming.

INSTRUCTIONS BY DISCIPLINE:
1. If Mathematics: Provide a 100% complete 'formulaVault' with LaTeX strings.
2. If Science: Include 'chemicalData' (formulas/equations) or 'physicsData' (SI units/laws) or 'biologyData' (diagram labels/functions).
3. If History: Provide 'historyData' (timeline of dates and 'whoIsWho' figures).
4. If Geography: Provide 'geographyData' (Map-pointing items, climate zones, and resource classifications).
5. If Civics: Provide 'civicsData' (Articles, Constitutional Provisions, and Institutional Roles).
6. If Economics: Provide 'economicsData' (Statistical indicators, sectors, and growth formulas).

ALWAYS INCLUDE: 'majorPoints' (5-7 core takeaways), 'oneLineDefinitions' (glossary), and 'tipsAndTricks' (exam shortcuts).

RETURN ONLY RAW JSON matching this structure exactly (leave irrelevant discipline keys as empty arrays/objects):
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

    // Remove markdown wrappers if model adds them
    const cleanJson = responseText.replace(/```json|```/g, "").trim();

    return res.status(200).json(JSON.parse(cleanJson));

  } catch (error) {
    console.error("AI Generation Error:", error);

    return res.status(500).json({
      error: "AI generation failed",
      details: error?.message || "Unknown error"
    });
  }
}
