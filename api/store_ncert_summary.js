import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// 1. Initialize Firebase Admin safely
if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({
      credential: cert(serviceAccount)
    });
  } catch (err) {
    console.error("Firebase Initialization Error:", err.message);
  }
}

const db = getFirestore();

export default async function handler(req, res) {
  // 2. MANDATORY CORS HEADERS
  // We specify your frontend origin explicitly for maximum browser compatibility.
  res.setHeader('Access-Control-Allow-Origin', 'https://ready4exam.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // 3. HANDLE THE PREFLIGHT (OPTIONS) REQUEST
  // If the browser sends an OPTIONS request, we must return a 200 OK immediately.
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 4. RESTRICT TO POST METHOD ONLY
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { meta, data } = req.body;

    // Validate incoming data
    if (!meta || !data) {
      return res.status(400).json({ error: "Missing metadata or summary data." });
    }

    // Generate Document ID: e.g., "9_science_motion"
    const docId = `${meta.classId}_${meta.subject}_${meta.topicSlug}`.toLowerCase();

    // 5. FIRESTORE UPSERT
    // Saves the structured data for Math, Science, or Social Science disciplines.
    await db.collection('ncert_summaries').doc(docId).set({
      ...data,               // Subject-specific keys (formulaVault, geographyData, etc.)
      metadata: meta,        // Contextual info (class, subject, discipline)
      lastUpdated: new Date().toISOString(),
      status: "published"
    }, { merge: true });

    console.log(`✅ Success: Stored ${docId}`);

    return res.status(200).json({ 
      success: true, 
      id: docId,
      message: "NCERT Summary successfully stored in Firestore."
    });

  } catch (error) {
    console.error("Storage Error:", error);
    return res.status(500).json({ 
      error: "Database error occurred", 
      details: error.message 
    });
  }
}
