// /api/gemini.js — FINAL PRODUCTION VERSION (Stable, Frontend-Compatible)
import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "edge" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// ========================================================
//  JSON EXTRACTOR — Strong & Compact
// ========================================================
function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let text = raw.trim();

  // Remove Markdown fences
  text = text.replace(/```json/gi, "").replace(/```/g, "");

  // Remove explanation before first "{"
  const first = text.indexOf("{");
  if (first > 0) text = text.slice(first);

  // Balanced braces
  const openCount = (text.match(/{/g) || []).length;
  const closeCount = (text.match(/}/g) || []).length;
  if (openCount > closeCount) {
    text += "}".repeat(openCount - closeCount);
  }

  // Parse JSON
  try {
    const parsed = JSON.parse(text);

    // Standardize structure
    if (Array.isArray(parsed)) return { ok: true, questions: parsed };
    if (Array.isArray(parsed.questions)) return { ok: true, questions: parsed.questions };
    if (parsed && typeof parsed === "object") return { ok: true, questions: parsed };

    return { ok: false, error: "INVALID_JSON_SHAPE", raw: text };
  } catch (e) {
    return { ok: false, error: "INVALID_JSON_PARSE", raw: text };
  }
}

// ========================================================
//  GEMINI CALL
// ========================================================
async function callGemini(prompt) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ========================================================
//  PERPLEXITY CALL
// ========================================================
async function callPerplexity(prompt) {
  const url = "https://api.perplexity.ai/chat/completions";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "sonar-pro",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// ========================================================
//  MAIN HANDLER
// ========================================================
export default async function handler(req) {
  try {
    const { meta } = await req.json();
    const prompt = `
      Generate 60 high-quality questions for:
      Class ${meta.class_name}
      Subject: ${meta.subject}
      Chapter: ${meta.chapter}

      Return ONLY JSON array:
      [
        {
          "difficulty": "Simple|Medium|Advanced",
          "question_type": "MCQ|AR|Case-Based",
          "question_text": "...",
          "scenario_reason_text": "...",
          "option_a": "...",
          "option_b": "...",
          "option_c": "...",
          "option_d": "...",
          "correct_answer_key": "A|B|C|D"
        }
      ]
    `;

    const start = Date.now();

    // ----------------------------------------------------
    // 1️⃣ GEMINI (3 attempts)
    // ----------------------------------------------------
    for (let i = 1; i <= 3; i++) {
      try {
        const out = await callGemini(prompt);
        const parsed = extractJSON(out);

        if (parsed.ok) {
          const duration = Date.now() - start;

          return new Response(
            JSON.stringify({
              ok: true,
              engine: "gemini",
              attempts: i,
              geminiAttempts: i,
              durationMs: duration,
              questions: parsed.questions,
              count: parsed.questions.length
            }),
            { status: 200 }
          );
        }
      } catch (err) {
        if (String(err).includes("quota")) break;
      }
    }

    // ----------------------------------------------------
    // 2️⃣ PERPLEXITY FALLBACK (3 attempts)
    // ----------------------------------------------------
    for (let i = 1; i <= 3; i++) {
      const out = await callPerplexity(prompt);
      const parsed = extractJSON(out);

      if (parsed.ok) {
        const duration = Date.now() - start;

        return new Response(
          JSON.stringify({
            ok: true,
            engine: "perplexity",
            attempts: i,
            geminiAttempts: 3, // Gemini used all retries
            durationMs: duration,
            questions: parsed.questions,
            count: parsed.questions.length
          }),
          { status: 200 }
        );
      }
    }

    // ----------------------------------------------------
    // 3️⃣ TOTAL FAILURE
    // ----------------------------------------------------
    return new Response(
      JSON.stringify({
        ok: false,
        error: "PERPLEXITY_INVALID_JSON"
      }),
      { status: 500 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500 }
    );
  }
}