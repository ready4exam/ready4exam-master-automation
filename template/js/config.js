// js/config.js
// -----------------------------------------------------------------------------
// FIREBASE & CLIENT-SIDE CONFIG
// -----------------------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

let app, auth, db;
let isInitialized = false;

export async function initializeServices() {
  if (isInitialized) return;

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  isInitialized = true;
}

export function getInitializedClients() {
  if (!isInitialized) {
    throw new Error("Firebase not initialized. Call initializeServices() first.");
  }
  return { app, auth, db };
}
