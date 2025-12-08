// /api/gemini.js — Node Runtime Compatible (NO EDGE)
import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// -------------------------------------------------------
// JSON Extractor — Stable, Compact, 100% Compatible
// -------------------------------------------------------
function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let text = raw.trim();

  // Remove ```json fences
  text = text.replace(/```json/gi, "").replace(/```/g, "");

  // Remove anything before first {
  const first = text.indexOf("{");
  if (first > 0) text = text.slice(first);

  // Brace balancing
  const opens = (text.match(/{/g) || []).length;
  const closes = (text.match(/}/g) || []).length;
  if (opens > closes) {
    text += "}".repeat(opens - closes);
  }

  try {
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) return { ok: true, questions: parsed };
    if (Array.isArray(parsed.questions)) return { ok: true, questions: parsed.questions };

    return { ok: false, error: "INVALID_JSON_SHAPE", raw: text };
  } catch (e) {
    return { ok: false, error: "INVALID_JSON_PARSE", raw: text };
  }
}

// -------------------------------------------------------
// Gemini Call
// -------------------------------------------------------
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });

  const out = await model.generateContent(prompt);
  return out.response.text();
}

// -------------------------------------------------------
// Perplexity Call
// -------------------------------------------------------
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
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// -------------------------------------------------------
// MAIN HANDLER — Node Compatible
// -------------------------------------------------------
export default async function handler(req, res) {
  try {
    // ★ Correct body parsing for Node
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const meta = body?.meta;

    if (!meta) {
      return res.status(400).json({ ok: false, error: "NO_META" });
    }

    const prompt = `
      Generate 60 high-quality questions for:
      Class: ${meta.class_name}
      Subject: ${meta.subject}
      Chapter: ${meta.chapter}

      Return ONLY a JSON array like:
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

      Do NOT add explanations.
      Do NOT add notes.
      Do NOT add markdown.
      Only raw JSON array.
    `;

    const start = Date.now();

    // ---------------------------------------------------
    // 1️⃣ GEMINI (3 tries)
    // ---------------------------------------------------
    for (let i = 1; i <= 3; i++) {
      try {
        const out = await callGemini(prompt);
        const parsed = extractJSON(out);

        if (parsed.ok) {
          return res.status(200).json({
            ok: true,
            engine: "gemini",
            attempts: i,
            geminiAttempts: i,
            questions: parsed.questions,
            count: parsed.questions.length,
            durationMs: Date.now() - start
          });
        }
      } catch (err) {
        // If quota exhausted → fallback immediately
        if (String(err).toLowerCase().includes("quota")) break;
      }
    }

    // ---------------------------------------------------
    // 2️⃣ PERPLEXITY FALLBACK (3 tries)
    // ---------------------------------------------------
    for (let i = 1; i <= 3; i++) {
      const out = await callPerplexity(prompt);
      const parsed = extractJSON(out);

      if (parsed.ok) {
        return res.status(200).json({
          ok: true,
          engine: "perplexity",
          attempts: i,
          geminiAttempts: 3,
          questions: parsed.questions,
          count: parsed.questions.length,
          durationMs: Date.now() - start
        });
      }
    }

    // ---------------------------------------------------
    // 3️⃣ TOTAL FAILURE
    // ---------------------------------------------------
    return res.status(500).json({
      ok: false,
      error: "PERPLEXITY_INVALID_JSON"
    });

  } catch (err) {
    console.error("❌ GEMINI ROUTE ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
