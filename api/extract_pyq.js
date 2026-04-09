import { GoogleGenerativeAI } from "@google/generative-ai";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getCorsHeaders } from "./cors.js";
import firebaseConfig from "../js/firebase-master-config.js";
import { initializeApp, getApps, cert } from "firebase-admin/app";

export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ============================================================================
//  MODEL FAILOVER CHAIN (FREE-TIER SAFE)
// ============================================================================

const MODEL_CHAIN = [
  "gemini-2.5-flash",        // Best free model
  "gemini-flash-latest",     // Backup
  "gemini-2.0-flash",        // Backup
  "gemini-2.5-flash-lite"    // Last fallback
];

// ============================================================================
//  UTILITIES
// ============================================================================

function sanitizeChapterName(name) {
  if (!name) return "unnamed_chapter";
  return name.trim().replace(/[^a-zA-Z0-9 ]/g, "_").replace(/\s+/g, "_");
}

function extractJSON(raw) {
  if (!raw) return { ok: false, error: "EMPTY_OUTPUT" };

  let text = raw.trim()
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/[\u0000-\u001F]+/g, " ")
    .replace(/\n+/g, " ")
    .replace(/“|”/g, '"')
    .replace(/‘|’/g, "'")
    .replace(/,\s*]/g, "]")
    .replace(/,\s*}/g, "}");

  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");

  if (first !== -1 && last !== -1)
    text = text.slice(first, last + 1);

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { ok: true, questions: parsed };
    if (Array.isArray(parsed.questions)) return { ok: true, questions: parsed.questions };
    return { ok: false, error: "INVALID_JSON_SHAPE", raw: text };
  } catch (err) {
    return { ok: false, error: "INVALID_JSON_PARSE", raw: text };
  }
}

// ============================================================================
//  GEMINI FAILOVER ENGINE
// ============================================================================
async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  let lastErr = null;

  for (const model of MODEL_CHAIN) {
    try {
      console.log("⚡ Trying model:", model);

      const g = client.getGenerativeModel({ model });
      const output = await g.generateContent(prompt);
      const txt = output.response.text();

      if (!txt || !txt.trim()) {
        console.log("⚠ Empty output → switching model");
        continue;
      }

      console.log("✅ Success with model:", model);
      return txt;

    } catch (err) {
      lastErr = err;
      const status = err?.status;

      console.log(`❌ Model ${model} failed (${status}):`, err.message);

      if (status === 429) {
        console.log("🔄 Quota exceeded → trying next model");
        continue;
      }

      if (status === 500 || status === 503) {
        console.log("🔁 Server error → retry after delay");
        await new Promise(r => setTimeout(r, 800));
        continue;
      }

      console.log("⏭ Non-recoverable → switching model");
      continue;
    }
  }

  throw lastErr || new Error("All models failed");
}

function getDb() {
  try {
    if (!getApps().length) {
      // Use the Firebase credentials structure found in js/firebase-master-config.js
      initializeApp({ credential: cert(firebaseConfig) });
    }
    return { db: getFirestore() };
  } catch (err) {
    return {
      error: {
        status: 500,
        message: "Failed to initialize Firebase Admin with js/firebase-master-config.js",
        details: { message: err.message }
      }
    };
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "ONLY_POST_ALLOWED" });

  const { db, error: dbError } = getDb();
  if (dbError) {
    return res.status(dbError.status).json({ ok: false, error: dbError.message, details: dbError.details });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { grade, subject, book, chapter } = body || {};

    if (!grade || !subject || !chapter) {
      return res.status(400).json({ ok: false, error: "Missing required fields: grade, subject, chapter." });
    }

    const sanitizedChapter = sanitizeChapterName(chapter);

    const prompt = `
You MUST output ONLY a valid JSON array.
No text before it.
No text after it.
No commentary.
No markdown.
No headings.

STRICT FORMAT FOR EVERY QUESTION:
[
  {
    "question_en": "String: English question text",
    "answer_en": "String: High-quality English answer",
    "marks": Number (e.g., 2, 3, 5),
    "year": Number (e.g., 2018),
    "type": "String: Must be 'text', 'table', or 'formula'",
    "table_data": {} // Optional: Include if type is 'table', structured JSON object representing chart/graph/table data
  }
]

==============================
  GRADE: ${grade}
  SUBJECT: ${subject}
  CHAPTER: ${chapter}
  BOOK (optional): ${book || "N/A"}
==============================

REQUIREMENTS:
- Extract ONLY English-language questions from board exams for the years 2017–2024 for the specified chapter.
- Generate a high-quality English answer for each question.
- Depth and length of the answer MUST scale with marks (e.g., 2 marks = concise; 5 marks = detailed/point-wise).
- STRICTLY EXCLUDE ANY bilingual or Hindi text; ONLY English questions and answers must be processed.
- Graphs & Charts: Since image files cannot be stored, convert all graphs or charts found in PYQs into structured JSON tables inside the 'table_data' field, or use Markdown tables inside the 'question_en' or 'answer_en' fields.
- Formulas & Equations: All mathematical or scientific formulas MUST be extracted and generated using LaTeX (wrapped in $$...$$).
- Diagrams: If a question or answer requires a diagram, provide a detailed English description or Mermaid.js code that describes the visual structure.
- No multiline text in any JSON field (use \\n for line breaks instead).
- No escape characters that break JSON.
- No duplicate questions.

FINAL RULE:
Return ONLY the JSON array. NOTHING else.
`;

    const start = Date.now();
    let questionsToInsert = [];

    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log("🔁 Extraction Attempt:", attempt);
      try {
        const raw = await callGemini(prompt);
        const parsed = extractJSON(raw);

        if (parsed.ok) {
          questionsToInsert = parsed.questions;
          break; // success
        }
        console.log("⚠ JSON invalid → retrying...");
      } catch (err) {
        console.log("Attempt failed:", err);
      }
    }

    if (questionsToInsert.length === 0) {
      return res.status(500).json({ ok: false, error: "GEMINI_EXTRACTION_FAILED_OR_INVALID_JSON" });
    }

    console.log(`✅ Extracted ${questionsToInsert.length} questions. Starting Firestore insertion...`);

    // Hierarchical Arrangement:
    // PYQ_Bank (Collection) > {Grade} (Document) > Subjects (Collection) > {Subject} (Document) > Chapters (Collection) > {Sanitized_Chapter_Name} (Document) > Questions (Collection) > {AutoID}

    const chapterDocRef = db
      .collection("PYQ_Bank")
      .doc(String(grade))
      .collection("Subjects")
      .doc(subject)
      .collection("Chapters")
      .doc(sanitizedChapter);

    // Deep-Write Critical Fix: Explicitly create the Chapter Document
    await chapterDocRef.set({
      name: chapter,
      sanitizedName: sanitizedChapter,
      subject: subject,
      grade: grade,
      lastUpdated: FieldValue.serverTimestamp()
    }, { merge: true });

    const questionsRef = chapterDocRef.collection("Questions");

    const batchResults = [];
    let insertedCount = 0;

    // Async Completion Critical Fix: Wrap all Firestore writes in await Promise.all()
    const insertionPromises = questionsToInsert.map(async (q) => {
      // Validate structure before insertion
      // Verify that every question has a valid year and marks
      if (typeof q.question_en === "string" &&
          typeof q.answer_en === "string" &&
          typeof q.marks === "number" &&
          typeof q.year === "number") {
         try {
           const payload = {
             question_en: q.question_en,
             answer_en: q.answer_en,
             marks: q.marks,
             year: q.year,
             subject: subject,
             type: q.type || "text",
             timestamp: FieldValue.serverTimestamp()
           };

           if (book) {
             payload.book = book;
           }

           if (q.table_data && typeof q.table_data === "object") {
             payload.table_data = q.table_data;
           }

           const docRef = await questionsRef.add(payload);
           console.log(`✅ Inserted question ${docRef.id}`);
           insertedCount++;
           batchResults.push({ id: docRef.id, status: "success" });
         } catch (insertError) {
           console.error(`❌ Failed to insert question:`, insertError);
           batchResults.push({ question: q.question_en, status: "error", error: insertError.message });
         }
      } else {
         console.warn(`⚠ Skipped invalid question format:`, q);
         batchResults.push({ question: q, status: "skipped_invalid_format" });
      }
    });

    await Promise.all(insertionPromises);

    return res.status(200).json({
      ok: true,
      engine: "gemini_failover_v2",
      extractedCount: questionsToInsert.length,
      insertedCount: insertedCount,
      durationMs: Date.now() - start,
      results: batchResults
    });

  } catch (err) {
    console.error("❌ API ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
