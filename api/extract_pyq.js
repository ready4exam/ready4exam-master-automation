import { GoogleGenerativeAI } from "@google/generative-ai";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getCorsHeaders } from "./cors.js";

// Vercel Serverless Config
export const config = { runtime: "nodejs" };

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ============================================================================
//  MODEL FAILOVER CHAIN
// ============================================================================
const MODEL_CHAIN = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro",
  "gemini-2.0-flash-exp" 
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
  try {
    const parsed = JSON.parse(raw);
    const questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);
    if (Array.isArray(questions)) return { ok: true, questions };
    return { ok: false, error: "INVALID_JSON_SHAPE", raw };
  } catch (err) {
    console.log("JSON Parse Error:", err.message);
    console.log("Raw output:", raw);
    return { ok: false, error: err.message, raw };
  }
}

// ============================================================================
//  GEMINI ENGINE
// ============================================================================

async function callGemini(prompt) {
  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  let lastErr = null;

  for (const modelName of MODEL_CHAIN) {
    try {
      console.log("⚡ Trying model:", modelName);
      const model = client.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2048 } });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const txt = response.text();

      if (!txt || !txt.trim()) {
        console.warn(`⚠ Empty output from ${modelName}`);
        continue;
      }

      console.log("✅ Success with model:", modelName);
      return { txt, modelUsed: modelName };
    } catch (err) {
      lastErr = err;
      console.error(`❌ Model ${modelName} failed:`, err.message);
      if (err?.status === 429) continue; 
      if (err?.status >= 500) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
    }
  }
  throw lastErr || new Error("All models in the chain failed.");
}

function getDb() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawServiceAccount) {
    return {
      error: {
        status: 503,
        message: "FIREBASE_SERVICE_ACCOUNT not configured"
      }
    };
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch (err) {
    return {
      error: {
        status: 500,
        message: "FIREBASE_SERVICE_ACCOUNT malformed",
        details: err.message
      }
    };
  }

  try {
    if (!getApps().length) {
      initializeApp({ credential: cert(serviceAccount) });
    }
    return { db: getFirestore() };
  } catch (err) {
    return {
      error: {
        status: 500,
        message: "Firebase Init Failed",
        details: err.message
      }
    };
  }
}

// ============================================================================
//  MAIN API HANDLER (Consolidated CORS + Logic)
// ============================================================================

export default async function handler(req, res) {
  // 1. SHARED CORS HEADERS
  const origin = req.headers.origin || "";
  const headers = getCorsHeaders(origin);
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // 2. PREFLIGHT HANDLER
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. METHOD GUARD
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  // 4. DATABASE INITIALIZATION
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

    // 5. PROMPT CONSTRUCTION
    const prompt = `Extract previous year questions for CBSE Class ${grade} ${subject}, chapter "${chapter}". Return ONLY a JSON array. Each item must have: "question_en" (string), "marks" (number or estimate 1-5), and "year" (number or 0). No markdown, no answers, no explanations.`;

    // 6. EXECUTION LOOP (RETRY LOGIC)
    let questionsToInsert = [];
    let lastModelUsed = "UNKNOWN";
    const start = Date.now();

    let currentPrompt = prompt;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (attempt > 1 && questionsToInsert.length === 0) {
          console.log(`Attempt ${attempt}: Using Relaxed Fallback Prompt`);
          currentPrompt = `Give 5 important questions from CBSE Class ${grade} ${subject}, chapter "${chapter}" in JSON array format with question_en, marks, and year.`;
        }
        const { txt: raw, modelUsed } = await callGemini(currentPrompt);
        lastModelUsed = modelUsed;
        console.log('--- RAW AI OUTPUT Chapter: ' + chapter + ' ---', raw);
        const parsed = extractJSON(raw);
        if (parsed.ok && parsed.questions && parsed.questions.length > 0) {
          questionsToInsert = parsed.questions;
          break;
        }
      } catch (e) {
        console.error(`Attempt ${attempt} failed:`, e.message);
      }
    }

    if (!questionsToInsert.length) {
      return res.status(200).json({ ok: true, extracted: 0, message: "No board questions found for this chapter in the last 10 years.", modelUsed: lastModelUsed });
    }

    console.log('✅ Parsed Questions Count:', questionsToInsert.length);
    // 7. HIERARCHICAL FIRESTORE INSERTION
    const chapterDocRef = db
      .collection("PYQ_Bank")
      .doc(String(grade))
      .collection("Subjects")
      .doc(subject)
      .collection("Chapters")
      .doc(sanitizedChapter);

    await chapterDocRef.set({
      name: chapter,
      sanitizedName: sanitizedChapter,
      subject: subject,
      grade: grade,
      lastUpdated: FieldValue.serverTimestamp()
    }, { merge: true });

    const questionsRef = chapterDocRef.collection("Questions");
    const results = [];

    const insertionPromises = questionsToInsert.map(async (q) => {
      if (q.question_en) {
        const payload = {
          ...q,
          marks: Number(q.marks) || 0,
          year: Number(q.year) || 0,
          subject,
          timestamp: FieldValue.serverTimestamp()
        };
        if (book) payload.book = book;
        
        const doc = await questionsRef.add(payload);
        return { id: doc.id, status: "success" };
      }
      return { status: "skipped", reason: "invalid format" };
    });

    const batchSummary = await Promise.all(insertionPromises);

    return res.status(200).json({
      ok: true,
      extracted: questionsToInsert.length,
      inserted: batchSummary.filter(r => r.status === "success").length,
      durationMs: Date.now() - start,
      batchSummary
    });

  } catch (err) {
    console.error("Critical API Error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
