import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

function getDb() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return { error: "Missing FIREBASE_SERVICE_ACCOUNT" };
  if (!getApps().length) { initializeApp({ credential: cert(JSON.parse(raw)) }); }
  return { db: getFirestore() };
}

export default async function handler(req, res) {
  const headers = getCorsHeaders(req.headers.origin || "");
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { db, error } = getDb();
  if (error) return res.status(500).json({ ok: false, error });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { grade, subject, chapter } = body || {};

    if (!grade || !subject || !chapter) return res.status(400).json({ ok: false, error: "Missing fields" });

    // 1. Normalize and handle Aliases
    const cleanGrade = String(grade).trim();
    const cleanSubject = String(subject).trim();
    const aliases = [cleanSubject];
    if (cleanSubject === "Mathematics") aliases.push("Maths");
    if (cleanSubject === "Maths") aliases.push("Mathematics");

    console.log(`[ORCH] Searching for: Grade ${cleanGrade}, Subject: ${aliases}`);

    // 2. Index-Free Lookup: Fetch by subject only (built-in index)
    const vaultRef = db.collection("Ready4Exam_Vault");
    let vaultDocs = [];

    for (const subAlias of aliases) {
      const snap = await vaultRef.where("subject", "==", subAlias).get();
      if (!snap.empty) {
        // Filter by grade in memory to avoid needing a Composite Index
        const matches = snap.docs.filter(d => {
          const docData = d.data();
          return !docData.grade || String(docData.grade) === cleanGrade;
        });
        vaultDocs.push(...matches);
      }
    }

    // 3. Collect and Deduplicate URLs
    const pdf_urls = [...new Set(vaultDocs.map(d => [d.data().qp_url, d.data().ms_url]).flat())]
                        .filter(u => u && u.trim() !== "");

    if (pdf_urls.length === 0) {
      return res.status(200).json({ 
        ok: true, 
        message: `No PDFs found for Grade ${cleanGrade} ${cleanSubject}. Checked: ${aliases.join(', ')}` 
      });
    }

    // 4. Dispatch to Agent
    const agentUrl = process.env.PYTHON_AGENT_URL;
    if (agentUrl) {
      fetch(agentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: { grade: cleanGrade, subject: cleanSubject, chapter }, pdf_urls })
      }).catch(e => console.error("Agent Error:", e));
    }

    return res.status(202).json({ ok: true, message: "Dispatched", pdfs_found: pdf_urls.length });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
