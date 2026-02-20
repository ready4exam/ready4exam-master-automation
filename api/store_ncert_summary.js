import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin (Ensure your Service Account is in Environment Variables)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { meta, data } = req.body;
    const docId = `${meta.classId}_${meta.subject}_${meta.topicSlug}`.toLowerCase();
    
    // Save to Firestore with merge to prevent data loss
    await db.collection('ncert_summaries').doc(docId).set({
      ...data,
      metadata: meta,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    return res.status(200).json({ success: true, id: docId });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
