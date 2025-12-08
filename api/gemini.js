// /api/gemini.js — FINAL STABLE VERSION
import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";

export const config = {
  runtime: "edge",
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// ----------------------------
// JSON EXTRACTION UTIL
// ----------------------------
function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let text = raw.trim();

  // Remove markdown fences
  text = text.replace(/```json/gi, "").replace(/```/g, "");

  // Remove explanation before JSON
  const firstBrace = text.indexOf("{");
  if (firstBrace > 0) text = text.slice(firstBrace);

  // Balanced brace fix
  let open = (text.match(/{/g) || []).length;
  let close = (text.match(/}/g) || []).length;
  if (open > close) text += "}".repeat(open - close);

  // Try parse
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { ok: true, data: parsed };
    if (Array.isArray(parsed.questions)) return { ok: true, data: parsed.questions };
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: "INVALID_JSON_PARSE", raw: text };
  }
}

// ----------------------------
// GEMINI CALL
// ----------------------------
async function callGemini(prompt) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ----------------------------
// PERPLEXITY CALL
// ----------------------------
async function callPerplexity(prompt) {
  const url = "https://api.perplexity.ai/chat/completions";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "sonar-pro",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

// ----------------------------
// MAIN HANDLER
// ----------------------------
export default async function handler(req) {
  try {
    const { prompt } = await req.json();

    let final = null;

    // ----------------------------
    // 1. GEMINI (3 attempts)
    // ----------------------------
    for (let i = 1; i <= 3; i++) {
      try {
        const out = await callGemini(prompt);
        const parsed = extractJSON(out);

        if (parsed.ok) {
          return new Response(
            JSON.stringify({
              ok: true,
              engine: "gemini",
              attempts: i,
              questions: parsed.data
            }),
            { status: 200 }
          );
        }
      } catch (err) {
        if (String(err).includes("quota")) break; // go to fallback
      }
    }

    // If Gemini quota exhausted → fallback
    // OR Gemini JSON failed 3 times
    // ----------------------------
    // 2. PERPLEXITY (3 attempts)
    // ----------------------------
    for (let i = 1; i <= 3; i++) {
      const out = await callPerplexity(prompt);
      const parsed = extractJSON(out);

      if (parsed.ok) {
        return new Response(
          JSON.stringify({
            ok: true,
            engine: "perplexity",
            attempts: i,
            questions: parsed.data
          }),
          { status: 200 }
        );
      }
    }

    // ----------------------------
    // Total failure
    // ----------------------------
    return new Response(
      JSON.stringify({ ok: false, error: "PERPLEXITY_INVALID_JSON" }),
      { status: 500 }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500 }
    );
  }
}
