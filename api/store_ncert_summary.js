import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getCorsHeaders } from "./cors.js";

export const config = { runtime: "nodejs" };

let db;
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(serviceAccount) });
}
db = getFirestore();

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta, data } = body;

    const docId = `${meta.classId}_${meta.subject}_${meta.topicSlug}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");

    await db.collection("ncert_summaries").doc(docId).set({
      ...data,
      metadata: meta,
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    return res.status(200).json({ success: true, id: docId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
