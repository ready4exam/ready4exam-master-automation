import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  // 1. Set CORS headers manually to ensure they work
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { meta } = req.body;
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Adaptive Prompt based on your discussed requirements
    const prompt = `Act as an NCERT Educator. For Class ${meta.classId}, Subject ${meta.subject}, Discipline ${meta.discipline}, and Chapter "${meta.chapterTitle}", generate a high-density JSON summary.
    REQUIREMENTS:
    1. Mathematics: Provide a full 'formulaVault' with LaTeX.
    2. Science: Include Chemical Formulas, Equations, SI Units, and Laws.
    3. Social Science: Provide a 'historyData' timeline and 'keyFigures'.
    4. General: Include 'majorPoints', 'oneLineDefinitions', and 'tipsAndTricks'.
    
    RETURN ONLY RAW JSON matching this structure:
    { "majorPoints": [], "oneLineDefinitions": [{ "term": "", "definition": "" }], "tipsAndTricks": [], "formulaVault": [], "historyData": { "timeline": [], "keyFigures": [] } }`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const cleanJson = responseText.replace(/```json|```/g, "").trim();

    return res.status(200).json(JSON.parse(cleanJson));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
