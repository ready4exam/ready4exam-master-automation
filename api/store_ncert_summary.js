import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getCorsHeaders } from "./cors";

export const config = { runtime: "nodejs" };

let db;
try {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
  }
  db = getFirestore();
} catch (err) {
  console.error("Firebase Initialization Error:", err);
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const headers = getCorsHeaders(origin);

  // FIX: Force valid origin for credential compatibility
  if (headers["Access-Control-Allow-Origin"] === "*") {
    headers["Access-Control-Allow-Origin"] = "https://ready4exam.github.io";
  }

  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta, data } = body || {};

    if (!meta || !data) return res.status(400).json({ error: "Missing metadata or summary data." });

    const docId = `${meta.classId}_${meta.subject}_${meta.topicSlug}`.toLowerCase();

    await db.collection("ncert_summaries").doc(docId).set(
      { ...data, metadata: meta, lastUpdated: new Date().toISOString(), status: "published" },
      { merge: true }
    );

    return res.status(200).json({ success: true, id: docId });
  } catch (error) {
    console.error("Storage Error:", error);
    return res.status(500).json({ error: "Database error occurred", details: error.message });
  }
}
