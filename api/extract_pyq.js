import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getCorsHeaders } from "./cors.js";

// Vercel Serverless Config
export const config = { runtime: "nodejs" };

// ============================================================================
//  DATABASE INITIALIZATION
// ============================================================================
function getDb() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawServiceAccount) {
    return { error: { status: 503, message: "FIREBASE_SERVICE_ACCOUNT not configured" } };
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch (err) {
    return { error: { status: 500, message: "FIREBASE_SERVICE_ACCOUNT malformed", details: err.message } };
  }

  try {
    if (!getApps().length) {
      initializeApp({ credential: cert(serviceAccount) });
    }
    return { db: getFirestore() };
  } catch (err) {
    return { error: { status: 500, message: "Firebase Init Failed", details: err.message } };
  }
}

// ============================================================================
//  MAIN API HANDLER
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
    return res.status(dbError.status).json({ ok: false, error: dbError.message });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { grade, subject, book, chapter, questions } = body || {};

    if (!grade || !subject || !chapter) {
      return res.status(400).json({ ok: false, error: "Missing required fields: grade, subject, chapter." });
    }

    const sanitizedChapter = chapter.trim().replace(/[^a-zA-Z0-9 ]/g, "_").replace(/\s+/g, "_");

    // ========================================================================
    //  WEBHOOK MODE: Save data from Agent to Hierarchical Storage
    // ========================================================================
    if (questions && Array.isArray(questions)) {
      console.log('[WH] Webhook triggered for chapter:', chapter);
      
      const chapterDocRef = db
        .collection("Chapter_Analysis")
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

      const historicalRef = chapterDocRef.collection("Historical_Questions");
      const insertionPromises = questions.map(async (q) => {
        if (q.question_text || q.question_en) {
          const payload = {
            question_text: q.question_text || q.question_en,
            marking_logic: q.marking_logic || "",
            image_url: q.image_url || "",
            marks: Number(q.marks) || 0,
            year: Number(q.year) || 0,
            subject,
            timestamp: FieldValue.serverTimestamp()
          };
          if (book) payload.book = book;
          
          const doc = await historicalRef.add(payload);
          return { id: doc.id, status: "success" };
        }
        return { status: "skipped", reason: "invalid format" };
      });

      const results = await Promise.all(insertionPromises);
      return res.status(200).json({
        ok: true,
        inserted: results.filter(r => r.status === "success").length
      });
    }

    // ========================================================================
    //  ORCHESTRATOR MODE: Vault Lookup & Agent Dispatch
    // ========================================================================
    const cleanGrade = String(grade).trim();
    const cleanSubject = String(subject).trim();
    
    // Alias Logic: Check both 'Mathematics' and 'Maths'
    const subjectAliases = [cleanSubject];
    if (cleanSubject === "Mathematics") subjectAliases.push("Maths");
    if (cleanSubject === "Maths") subjectAliases.push("Mathematics");

    console.log(`[ORCH] Lookup: Grade ${cleanGrade}, Subject: ${cleanSubject}`);

    const vaultRef = db.collection("Ready4Exam_Vault");
    let vaultDocs = [];

    // Query across aliases
    for (const alias of subjectAliases) {
      const snap = await vaultRef
        .where("grade", "==", cleanGrade)
        .where("subject", "==", alias)
        .get();
      if (!snap.empty) vaultDocs.push(...snap.docs);
    }

    const pdf_urls = [];
    vaultDocs.forEach(doc => {
      const data = doc.data();
      if (data.qp_url) pdf_urls.push(data.qp_url);
      if (data.ms_url) pdf_urls.push(data.ms_url);
    });

    const validUrls = [...new Set(pdf_urls.filter(url => url && url.trim() !== ''))];

    if (validUrls.length === 0) {
      return res.status(200).json({ 
        ok: true, 
        extracted: 0,
        message: `No PDF files found in vault for Grade ${cleanGrade} ${cleanSubject}.` 
      });
    }

    // DISPATCH TO PYTHON AGENT
    const PYTHON_AGENT_URL = process.env.PYTHON_AGENT_URL;
    if (!PYTHON_AGENT_URL) {
       console.error("Missing PYTHON_AGENT_URL env var");
       return res.status(500).json({ ok: false, error: "Agent URL not configured" });
    }

    const agentPayload = {
      metadata: { grade: cleanGrade, subject: cleanSubject, book, chapter },
      pdf_urls: validUrls
    };

    // Fire and forget dispatch
    fetch(PYTHON_AGENT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(agentPayload)
    }).catch(e => console.error("Agent dispatch error:", e));

    return res.status(202).json({
      ok: true,
      message: "Accepted. Orchestrator dispatched request to Python Agent.",
      pdfs_found: validUrls.length
    });

  } catch (err) {
    console.error("Critical API Error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
