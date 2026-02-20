import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const config = { runtime: "nodejs" };

const REQUIRED_META_FIELDS = ["classId", "subject", "topicSlug"];

function sendError(res, status, error, details) {
  const payload = { ok: false, error };
  if (details !== undefined) payload.details = details;
  return res.status(status).json(payload);
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
        details: { message: err.message }
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
        message: "Failed to initialize Firebase Admin",
        details: { message: err.message }
      }
    };
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { db, error: dbError } = getDb();
  if (dbError) {
    return sendError(res, dbError.status, dbError.message, dbError.details);
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta, data } = body ?? {};

    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      return sendError(res, 400, "Missing required object: meta");
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return sendError(res, 400, "Missing required object: data");
    }

    const missingMetaKeys = REQUIRED_META_FIELDS.filter((key) => !meta[key]);
    if (missingMetaKeys.length) {
      return sendError(res, 400, "Missing required meta fields", { missingKeys: missingMetaKeys });
    }

    const docId = `${meta.classId}_${meta.subject}_${meta.topicSlug}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");

    await db.collection("ncert_summaries").doc(docId).set({
      ...data,
      metadata: meta,
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    return res.status(200).json({ success: true, id: docId });
  } catch (err) {
    return sendError(res, 500, "Failed to store NCERT summary", { message: err.message });
  }
}
