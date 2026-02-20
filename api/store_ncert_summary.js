import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getCorsHeaders } from "./cors";

// Ensure Node runtime (required for firebase-admin)
export const config = { runtime: "nodejs" };

// -------------------- Firebase Init (Safe) --------------------
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

// -------------------- Handler --------------------
export default async function handler(req, res) {
  // ---- Unified CORS (critical fix) ----
  const headers = getCorsHeaders(req.headers.origin || "");
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // ---- Preflight ----
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ---- Allow POST only ----
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = req.body || {};
    const { meta, data } = body;

    if (!meta || !data) {
      return res.status(400).json({
        error: "Missing metadata or summary data."
      });
    }

    // Safe slug generation
    const docId =
      `${meta.classId}_${meta.subject}_${meta.topicSlug}`
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_");

    // ---- Firestore UPSERT ----
    await db.collection("ncert_summaries").doc(docId).set(
      {
        ...data,
        metadata: meta,
        lastUpdated: new Date().toISOString(),
        status: "published"
      },
      { merge: true }
    );

    console.log(`✅ Stored ${docId}`);

    return res.status(200).json({
      success: true,
      id: docId,
      message: "NCERT Summary successfully stored in Firestore."
    });
  } catch (error) {
    console.error("Storage Error:", error);

    return res.status(500).json({
      error: "Database error occurred",
      details: error?.message || "Unknown error"
    });
  }
}
