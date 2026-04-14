import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getCorsHeaders } from "./cors.js";

// Vercel Serverless Config
export const config = { runtime: "nodejs" };

// --- CONSTANTS ---
const SUPPORTED_GRADES = ["10", "12"];
const SUBJECT_ALIASES = {
  "Mathematics": ["Mathematics", "Maths"],
  "Maths":       ["Mathematics", "Maths"],
  "Science":     ["Science"],
  "Physics":     ["Physics"],
  "Chemistry":   ["Chemistry"],
  "Biology":     ["Biology"],
};
const SUBJECT_SLUG_MAP = {
  "Mathematics": "maths",
  "Maths":       "maths",
  "Science":     "science",
  "Physics":     "physics",
  "Chemistry":   "chemistry",
  "Biology":     "biology",
};

// --- HELPERS ---
function sanitizeUrl(url) {
  if (!url) return null;
  try {
    return new URL(url).href;
  } catch {
    return url.replace(/ /g, "%20");
  }
}

function getDb() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return { error: "Missing FIREBASE_SERVICE_ACCOUNT" };
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return { db: getFirestore() };
}

// --- MAIN HANDLER ---
export default async function handler(req, res) {
  // Shared CORS Handling
  const headers = getCorsHeaders(req.headers.origin || "");
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  
  // Preflight Handler
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Database Initialization
  const { db, error } = getDb();
  if (error) return res.status(500).json({ ok: false, error });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { grade, subject, chapter } = body || {};

    // 1. Parse & Validate
    const cleanGrade = String(grade || "").trim();
    const cleanSubject = String(subject || "").trim();

    if (!SUPPORTED_GRADES.includes(cleanGrade)) {
      return res.status(400).json({ ok: false, error: `Grade ${cleanGrade} is not supported.` });
    }
    if (!cleanSubject || !chapter) {
      return res.status(400).json({ ok: false, error: "Missing required fields: subject or chapter." });
    }

    // 2. Get Aliases and Slugs
    const aliases = SUBJECT_ALIASES[cleanSubject] ?? [cleanSubject];
    const subjectSlug = SUBJECT_SLUG_MAP[cleanSubject] ?? cleanSubject.toLowerCase().replace(/\s+/g, "_");
    const chapterSlug = chapter.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

    console.log(`[ORCH] Lookup: Grade ${cleanGrade}, Subject Aliases: ${aliases}`);

    // 3. Firestore Query
    // CRITICAL: This requires a composite index on (subject, grade, status)
    const snap = await db.collection("Ready4Exam_Vault")
      .where("subject", "in", aliases)
      .where("grade", "==", cleanGrade)
      .where("status", "==", "verified")
      .get();

    // 4. Build Structured Papers Array
    const papers = snap.docs.map(d => {
      const data = d.data();
      return {
        code: data.code,
        year: data.year,
        qp_url: sanitizeUrl(data.qp_url),
        ms_url: sanitizeUrl(data.ms_url),
      };
    }).filter(p => p.qp_url || p.ms_url);

    // 5. Empty Result Case
    if (papers.length === 0) {
      return res.status(200).json({
        ok: true,
        dispatched: false,
        pdfs_found: 0,
        message: `No verified PDFs found for Grade ${cleanGrade} ${cleanSubject}`
      });
    }

    // 6. Build Paths
    const outputPath = `extracted/grade_${cleanGrade}/${subjectSlug}/${chapterSlug}`;
    const firestoreTarget = {
      collection: "PYQ_Extracted",
      docId: `${cleanGrade}_${subjectSlug}_${chapterSlug}`
    };

    // 7. Check Agent URL
    const agentUrl = process.env.PYTHON_AGENT_URL;
    if (!agentUrl) {
      return res.status(200).json({
        ok: true,
        dispatched: false,
        pdfs_found: papers.length,
        reason: "PYTHON_AGENT_URL not configured"
      });
    }

    // 8. Dispatch
    fetch(agentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: { grade: cleanGrade, subject: cleanSubject, chapter },
        papers,
        outputPath,
        firestoreTarget
      })
    }).catch(e => console.error("Agent dispatch error:", e));

    return res.status(202).json({
      ok: true,
      dispatched: true,
      pdfs_found: papers.length,
      outputPath,
      message: "Dispatched to extraction agent"
    });

  } catch (err) {
    console.error("Orchestrator Error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
