// firebaseSwitcher.js
// -----------------------------------------------------------------------------
// Manages multi-Firebase project initialization (Class 9, Class 11, placeholders)
// -----------------------------------------------------------------------------

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfigs = {
  class9: {
    apiKey: "FILL_CLASS9_API_KEY",
    authDomain: "FILL_CLASS9_AUTH_DOMAIN",
    projectId: "FILL_CLASS9_PROJECT_ID",
    storageBucket: "FILL_CLASS9_STORAGE_BUCKET",
    messagingSenderId: "FILL_CLASS9_MSG_ID",
    appId: "FILL_CLASS9_APP_ID",
  },
  class11: {
    apiKey: "FILL_CLASS11_API_KEY",
    authDomain: "FILL_CLASS11_AUTH_DOMAIN",
    projectId: "FILL_CLASS11_PROJECT_ID",
    storageBucket: "FILL_CLASS11_STORAGE_BUCKET",
    messagingSenderId: "FILL_CLASS11_MSG_ID",
    appId: "FILL_CLASS11_APP_ID",
  },
};

let currentClassId = "class9";
let clients = null;

/** Initialize or switch Firebase project context. */
export function switchFirebaseProject(classId = "class9") {
  currentClassId = classId;
  const config = firebaseConfigs[classId];
  if (!config) throw new Error(`Firebase config missing for ${classId}`);

  const existing = getApps().find(a => a.name === classId);
  const app = existing || initializeApp(config, classId);
  const auth = getAuth(app);
  const db = getFirestore(app);

  clients = { app, auth, db, classId };
  console.log(`[firebaseSwitcher] Active → ${classId}`);
  return clients;
}

/** Retrieve the active app/auth/db context. */
export function getCurrentClients() {
  if (!clients) return switchFirebaseProject(currentClassId);
  return clients;
}
