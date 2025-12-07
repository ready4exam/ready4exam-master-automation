// /api/gemini.js — TEMPORARILY USING PERPLEXITY (sonar-pro)
// NOTE: The code has been modified to call the Perplexity API (perplexity.ai)
// instead of the Google Gemini API. Key is now loaded from PERPLEXITY_API_KEY.

import { getCorsHeaders } from "./cors.js";
export const config = { runtime: "nodejs" };

const REQUIRED_FIELDS = [
    "difficulty",
    "question_type",
    "question_text",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "correct_answer_key",
    "scenario_reason_text"
];

// ------------------------------------------------------------------
// HELPERS (RETAINED from original file)
// ------------------------------------------------------------------
function tryParseJson(str) {
    try {
        return JSON.parse(str);
    } catch {
        return null;
    }
}

function repairJson(text) {
    if (!text) return text;

    return text
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .replace(/\\n/g, " ")
        .replace(/\r/g, " ");
}

// Extract valid JSON from messy output (works for Perplexity too)
function extractQuestionsObject(text) {
    if (!text) return null;

    const cleaned = repairJson(text);

    // Whole JSON
    let obj = tryParseJson(cleaned);
    if (obj && Array.isArray(obj.questions)) return obj;

    // Fenced blocks
    const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
    let match;
    while ((match = fenceRegex.exec(cleaned)) !== null) {
        const candidate = tryParseJson(repairJson(match[1]));
        if (candidate && Array.isArray(candidate.questions)) return candidate;
    }

    // Top-level array
    const arr = tryParseJson(cleaned);
    if (Array.isArray(arr)) return { questions: arr };

    // Balanced braces extraction
    const blocks = [];
    let depth = 0, start = -1;

    for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i] === "{") {
            if (depth === 0) start = i;
            depth++;
        } else if (cleaned[i] === "}") {
            depth--;
            if (depth === 0 && start !== -1) {
                blocks.push(cleaned.slice(start, i + 1));
                start = -1;
            }
        }
    }

    let collected = [];
    for (const b of blocks) {
        const obj = tryParseJson(repairJson(b));
        if (!obj) continue;

        if (Array.isArray(obj)) collected.push(...obj);
        if (Array.isArray(obj.questions)) collected.push(...obj.questions);
    }

    if (collected.length > 0) {
        return { questions: collected };
    }

    return null;
}

function normalize(q) {
    q.correct_answer_key = (q.correct_answer_key || "A").trim().toUpperCase();
    if (!["A", "B", "C", "D"].includes(q.correct_answer_key)) {
        q.correct_answer_key = "A";
    }

    return {
        difficulty: (q.difficulty || "").trim(),
        question_type: (q.question_type || "").trim(),
        question_text: (q.question_text || "").trim(),
        scenario_reason_text:
            (q.question_type || "").toUpperCase() === "MCQ"
                ? ""
                : (q.scenario_reason_text || "").trim(),
        option_a: (q.option_a || "").trim(),
        option_b: (q.option_b || "").trim(),
        option_c: (q.option_c || "").trim(),
        option_d: (q.option_d || "").trim(),
        correct_answer_key: q.correct_answer_key
    };
}

// ------------------------------------------------------------------
// MAIN HANDLER
// ------------------------------------------------------------------
export default async function handler(req, res) {
    const origin = req.headers.origin || "*";
    Object.entries(getCorsHeaders(origin)).forEach(([k, v]) =>
        res.setHeader(k, v)
    );
    res.setHeader("Content-Type", "application/json");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST")
        return res.status(405).json({ ok: false, error: "Only POST allowed" });

    try {
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const { meta } = body;
        if (!meta) throw new Error("Missing meta");

        // ⚠️ CHANGED: Loading key from PERPLEXITY_API_KEY environment variable
        const apiKey = process.env.PERPLEXITY_API_KEY;
        if (!apiKey) throw new Error("Missing PERPLEXITY_API_KEY");

        const prompt = `
Return ONLY valid JSON. No markdown.

Generate 60 NCERT exam-grade questions:
Class: ${meta.class_name}
Subject: ${meta.subject}
Chapter: ${meta.chapter}

Format:
{
    "questions": [
        {
            "difficulty": "Simple" | "Medium" | "Advanced",
            "question_type": "MCQ" | "AR" | "Case-Based",
            "question_text": "...",
            "scenario_reason_text": "",
            "option_a": "...",
            "option_b": "...",
            "option_c": "...",
            "option_d": "...",
            "correct_answer_key": "A" | "B" | "C" | "D"
        }
    ]
}
    `;

        // ⚠️ CHANGED: Perplexity API endpoint and working model
        const model = "sonar-pro"; 
        const url = `https://api.perplexity.ai/chat/completions`;

        const response = await fetch(url, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                // ⚠️ Perplexity requires Authorization header
                "Authorization": `Bearer ${apiKey}` 
            },
            body: JSON.stringify({
                model: model, // Required for Perplexity
                messages: [{ role: "user", content: prompt }] // Standard Chat API structure
            })
        });

        const rawText = await response.text();
        console.log("🧪 Perplexity RAW snippet:", rawText.slice(0, 500));

        let outer;
        try {
            outer = JSON.parse(rawText);
        } catch {
            outer = { output_text: rawText };
        }

        // Detect API errors (Invalid key, rate limit, etc.)
        if (outer?.error) {
             throw new Error(`Perplexity API Error: ${outer.error.message || outer.error.type}`);
        }

        // ⚠️ CHANGED: Extract text from Perplexity's standard Chat API response
        const innerText = outer?.choices?.[0]?.message?.content || rawText;

        let parsed = extractQuestionsObject(innerText);

        if (!parsed || !parsed.questions || parsed.questions.length === 0) {
            throw new Error(
                "API returned invalid JSON. Snippet: " + innerText.slice(0, 300)
            );
        }

        const questions = parsed.questions;

        if (questions.length < 40) {
            console.warn(`⚠ Only ${questions.length} questions generated — continuing.`);
        }

        // Validate fields
        for (const q of questions) {
            for (const f of REQUIRED_FIELDS) {
                if (!(f in q)) q[f] = "";
            }
        }

        return res.status(200).json({
            ok: true,
            questions: questions.map(normalize),
            count: questions.length
        });
    } catch (err) {
        console.error("❌ API error:", err);
        return res.status(500).json({
            ok: false,
            error: err.message || "API failed — try again."
        });
    }
}
