import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * FIREBASE ADMIN INITIALIZATION
 * Ensure the FIREBASE_SERVICE_ACCOUNT environment variable is set in Vercel
 * as a single-string JSON object.
 */
if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({
      credential: cert(serviceAccount)
    });
  } catch (err) {
    console.error("Firebase Admin Initialization Error:", err.message);
  }
}

const db = getFirestore();

export default async function handler(req, res) {
  // 1. MANDATORY CORS HEADERS
  // Matches the origin used in your generate_ncert_summary.js for consistency
  res.setHeader('Access-Control-Allow-Origin', 'https://ready4exam.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // 2. HANDLE PREFLIGHT (OPTIONS)
  // Essential to resolve the "blocked by CORS policy" error in the browser
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. ONLY ALLOW POST FOR STORAGE
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { meta, data } = req.body;

    /**
     * DOCUMENT ID GENERATION
     * Format: classId_subject_topicSlug (e.g., 9_science_gravitation)
     * Matches the lookup logic used in the student.html console.
     */
    const docId = `${meta.classId}_${meta.subject}_${meta.topicSlug}`.toLowerCase();

    // 4. FIRESTORE UPSERT (Update or Insert)
    // Uses { merge: true } to preserve existing metadata if only content updates
    await db.collection('ncert_summaries').doc(docId).set({
      ...data,               // AI-generated JSON (History, Geography, etc.)
      metadata: meta,        // Original class/subject/discipline info
      lastUpdated: new Date().toISOString(),
      status: "published"
    }, { merge: true });

    console.log(`✅ Firestore Sync Successful: ${docId}`);

    return res.status(200).json({ 
      success: true, 
      id: docId,
      message: "Summary stored successfully in ncert_summaries"
    });

  } catch (error) {
    console.error("Firestore Storage Error:", error);
    return res.status(500).json({ 
      error: "Database Storage Failed", 
      details: error.message 
    });
  }
}
