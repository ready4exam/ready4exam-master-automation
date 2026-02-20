import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getCorsHeaders } from "./cors.js";

/**
 * Summary API request contract (canonical metadata schema):
 * {
 *   meta: {
 *     class_name: string,   // required
 *     subject: string,      // required
 *     chapter: string,      // required
 *     book?: string,
 *     topicSlug?: string
 *   },
 *   data: object
 * }
 *
 * Backward-compatible aliases accepted from automation/frontend:
 * - classId -> class_name
 * - chapterTitle -> chapter
 */

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

function slugify(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeMeta(meta = {}) {
  const classId = meta.class_name || meta.classId;
  const subject = meta.subject;
  const chapterTitle = meta.chapter || meta.chapterTitle;
  const book = meta.book;
  const topicSlug = meta.topicSlug || slugify(chapterTitle);

  return { classId, subject, chapterTitle, book, topicSlug };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();

  const { db, error: dbError } = getDb();
  if (dbError) {
    return sendError(res, dbError.status, dbError.message, dbError.details);
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta, data } = body || {};
    const normalizedMeta = normalizeMeta(meta);

    const missingFields = [];
    if (!normalizedMeta.classId) missingFields.push("class_name");
    if (!normalizedMeta.subject) missingFields.push("subject");
    if (!normalizedMeta.chapterTitle) missingFields.push("chapter");
    if (!normalizedMeta.topicSlug) missingFields.push("topicSlug/chapter");

    if (missingFields.length) {
      return res.status(400).json({
        error: `Missing required metadata fields after normalization: ${missingFields.join(", ")}`
      });
    }

    const docId = `${normalizedMeta.classId}_${normalizedMeta.subject}_${normalizedMeta.topicSlug}`
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_");

    await db.collection("ncert_summaries").doc(docId).set({
      ...data,
      metadata: {
        ...meta,
        class_name: normalizedMeta.classId,
        subject: normalizedMeta.subject,
        chapter: normalizedMeta.chapterTitle,
        ...(normalizedMeta.book ? { book: normalizedMeta.book } : {}),
        ...(normalizedMeta.topicSlug ? { topicSlug: normalizedMeta.topicSlug } : {})
      },
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    return res.status(200).json({ success: true, id: docId });
  } catch (err) {
    return sendError(res, 500, "Failed to store NCERT summary", { message: err.message });
  }
}
