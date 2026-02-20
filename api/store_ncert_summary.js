import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

let db;
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(serviceAccount) });
}
db = getFirestore();

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
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") return res.status(200).end();

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
    return res.status(500).json({ error: err.message });
  }
}
