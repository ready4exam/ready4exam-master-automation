// firebaseSwitcher.js
// -----------------------------------------------------------------------------
// FINAL VERSION (No Switching, No Class-9 Leakage, No Cross-Project Override)
// Always loads ONE Firebase project for the entire quiz engine.
// -----------------------------------------------------------------------------

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// -----------------------------------------------------------------------------
// 🔥 IMPORTANT — INSERT YOUR MAIN FIREBASE PROJECT HERE
// This is the ONLY Firebase project the quiz engine will use.
// -----------------------------------------------------------------------------

const FIREBASE_CONFIG = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_FIREBASE_AUTH_DOMAIN",
  projectId: "YOUR_FIREBASE_PROJECT_ID",
  storageBucket: "YOUR_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "YOUR_FIREBASE_SENDER_ID",
  appId: "YOUR_FIREBASE_APP_ID",
  measurementId: "YOUR_FIREBASE_MEASUREMENT_ID"
};

// -----------------------------------------------------------------------------
// Internal reference
// -----------------------------------------------------------------------------
let firebaseClients = null;

// -----------------------------------------------------------------------------
// Initialize Firebase (only once)
// -----------------------------------------------------------------------------
export function initFirebase() {
  try {
    if (!firebaseClients) {
      const existing = getApps()[0];
      const app = existing || initializeApp(FIREBASE_CONFIG);

      const auth = getAuth(app);
      const db = getFirestore(app);

      firebaseClients = { app, auth, db };
      console.log("[firebaseSwitcher] Firebase initialized (single project).");
    }
    return firebaseClients;
  } catch (err) {
    console.error("[firebaseSwitcher] Initialization failed:", err.message);
    return null;
  }
}

// -----------------------------------------------------------------------------
// Export getter
// -----------------------------------------------------------------------------
export function getFirebaseClients() {
  return firebaseClients || initFirebase();
}
