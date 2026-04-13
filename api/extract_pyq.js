import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

function getDb() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawServiceAccount) return { error: { status: 503, message: "FIREBASE_SERVICE_ACCOUNT not configured" } };
  let serviceAccount = JSON.parse(rawServiceAccount);
  if (!getApps().length) { initializeApp({ credential: cert(serviceAccount) }); }
  return { db: getFirestore() };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const headers = getCorsHeaders(origin);
  Object.entries(headers).forEach(([key, value]) => { res.setHeader(key, value); });

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  const { db, error: dbError } = getDb();
  if (dbError) return res.status(dbError.status).json({ ok: false, error: dbError.message });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { grade, subject, book, chapter, questions } = body || {};

    if (!grade || !subject || !chapter) {
      return res.status(400).json({ ok: false, error: "Missing required fields." });
    }

    const sanitizedChapter = chapter.trim().replace(/[^a-zA-Z0-9 ]/g, "_").replace(/\s+/g, "_");

    // WEBHOOK MODE (Saving results back)
    if (questions && Array.isArray(questions)) {
      const historicalRef = db.collection("Chapter_Analysis").doc(String(grade)).collection("Subjects").doc(subject).collection("Chapters").doc(sanitizedChapter).collection("Historical_Questions");
      const promises = questions.map(q => historicalRef.add({ ...q, timestamp: FieldValue.serverTimestamp() }));
      await Promise.all(promises);
      return res.status(200).json({ ok: true, message: "Saved successfully" });
    }

    // ORCHESTRATOR MODE (The Fix is here)
    const cleanGrade = String(grade).trim();
    const cleanSubject = String(subject).trim();
    
    // Step 1: Handle Subject Aliases
    const aliases = [cleanSubject];
    if (cleanSubject === "Mathematics") aliases.push("Maths");
    if (cleanSubject === "Maths") aliases.push("Mathematics");

    // Step 2: Search across all aliases
    let vaultDocs = [];
    for (const sub of aliases) {
      const snap = await db.collection("Ready4Exam_Vault").where("subject", "==", sub).get();
      if (!snap.empty) {
        // Step 3: Local Failsafe Filter (Allow match if grade is correct OR if grade is missing)
        const matches = snap.docs.filter(d => !d.data().grade || String(d.data().grade) === cleanGrade);
        vaultDocs.push(...matches);
      }
    }

    const pdf_urls = [...new Set(vaultDocs.map(d => [d.data().qp_url, d.data().ms_url]).flat())].filter(u => u);

    if (pdf_urls.length === 0) {
      return res.status(200).json({ 
        ok: true, 
        message: `No PDFs found for Grade ${cleanGrade} ${cleanSubject}. Checked: ${aliases.join(', ')}` 
      });
    }

    // Dispatch to Python Agent
    const PYTHON_AGENT_URL = process.env.PYTHON_AGENT_URL;
    fetch(PYTHON_AGENT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: { grade: cleanGrade, subject: cleanSubject, book, chapter }, pdf_urls })
    }).catch(e => console.error("Agent dispatch error:", e));

    return res.status(202).json({ ok: true, message: "Dispatched to Agent", pdfs_found: pdf_urls.length });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
