// api/gemini.js
import { getCorsHeaders } from "./cors.js";
export const config = { runtime: "nodejs" };

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta = {} } = body;
    const { class_name, subject, book = "", chapter, num = 20, difficulty = "medium" } = meta;

    if (!class_name || !subject || !chapter) return res.status(400).json({ error: "Missing meta" });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

    // Prompt: request strict JSON output
    const userPrompt = `
Generate ${num} ${difficulty} multiple-choice questions (MCQ) for class ${class_name} — subject: ${subject}, chapter: ${chapter}, book: ${book}.
Return **ONLY** valid JSON with a single top-level key "questions", which is an array of objects.
Each object must contain these keys exactly:
difficulty, question_type (mcq), question_text, scenario_reason_text, option_a, option_b, option_c, option_d, correct_answer_key (one of "a","b","c","d").

Example output schema:
{
  "questions": [
    {
      "difficulty": "medium",
      "question_type": "mcq",
      "question_text": "What ...?",
      "scenario_reason_text": "Explanation ...",
      "option_a": "A",
      "option_b": "B",
      "option_c": "C",
      "option_d": "D",
      "correct_answer_key": "b"
    }
  ]
}

Create original, curriculum-appropriate questions. Do not include any additional commentary, markdown, or introductions — only the JSON.
`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      // recommended: set reasonable max output tokens
      maxOutputTokens: 1200,
    };

    const r = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error("Gemini error:", t);
      return res.status(500).json({ ok: false, error: "Gemini API error", detail: t });
    }

    const data = await r.json();

    // === Extract text from Gemini response ===
    // Response formats vary, but usually `candidates[0].content[0].text` or `output[0].content[0].text`.
    // We'll search the object for first string-looking piece of text.
    let text = null;
    function findText(obj) {
      if (!obj || typeof obj !== "object") return null;
      if (typeof obj.text === "string") return obj.text;
      for (const k of Object.keys(obj)) {
        const val = obj[k];
        if (typeof val === "string" && val.trim().startsWith("{")) return val;
        if (typeof val === "object") {
          const found = findText(val);
          if (found) return found;
        }
      }
      return null;
    }
    text = findText(data) || JSON.stringify(data);

    // Try to parse JSON from the model output
    let parsed = null;
    try {
      // There may be extra text around JSON; extract the first {...} block
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        const candidate = text.slice(firstBrace, lastBrace + 1);
        parsed = JSON.parse(candidate);
      } else {
        parsed = JSON.parse(text);
      }
    } catch (e) {
      console.warn("Failed to JSON-parse Gemini output. Returning raw text for debugging.");
      return res.status(500).json({ ok: false, error: "Failed to parse Gemini output", raw: text });
    }

    if (!parsed || !Array.isArray(parsed.questions)) {
      return res.status(500).json({ ok: false, error: "Invalid Gemini structure", parsed });
    }

    // Optional: validate/normalize questions (ensure keys exist and correct_answer_key in a-d)
    const normalized = parsed.questions.map((q) => ({
      difficulty: q.difficulty ?? difficulty,
      question_type: q.question_type ?? "mcq",
      question_text: (q.question_text || "").trim(),
      scenario_reason_text: (q.scenario_reason_text || "").trim(),
      option_a: (q.option_a || "").trim(),
      option_b: (q.option_b || "").trim(),
      option_c: (q.option_c || "").trim(),
      option_d: (q.option_d || "").trim(),
      correct_answer_key: (["a", "b", "c", "d"].includes((q.correct_answer_key || "").toLowerCase())
        ? q.correct_answer_key.toLowerCase()
        : "a"),
    }));

    return res.status(200).json({ ok: true, questions: normalized });
  } catch (err) {
    console.error("gemini.js error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal server error" });
  }
}
