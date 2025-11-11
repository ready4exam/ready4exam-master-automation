// /api/testGemini.js
import fetch from "node-fetch";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return res.status(400).json({ error: "Missing GEMINI_API_KEY in environment." });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const prompt = "Who are you?";

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error || "Gemini API request failed" });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "(no response)";
    return res.status(200).json({
      ok: true,
      model: "gemini-2.5-flash",
      reply: text,
    });
  } catch (err) {
    console.error("❌ Error in /api/testGemini:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
}
