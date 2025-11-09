// js/firebaseSwitcher.js
// -----------------------------------------------------------------------------
// Manages multi-Firebase project initialization (Class 9, Class 11 + placeholders)
// -----------------------------------------------------------------------------

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfigs = {
  class9: {
    apiKey: "AIzaSyD_lVcPJMcj9p_p_I5RdJRqQzsi_-VL4Xk",
    authDomain: "classnine-e8217.firebaseapp.com",
    projectId: "classnine-e8217",
    storageBucket: "classnine-e8217.firebasestorage.app",
    messagingSenderId: "1001949713983",
    appId: "1:1001949713983:web:92bb90dac63b9b4e2c8a8a",
    measurementId: "G-4RKBW58LED"
  },
  class11: {
    apiKey: "AIzaSyCFkuTUao-HGQhX438cVOUvUiS3kT2m7Os",
    authDomain: "eleventhexam-f0fab.firebaseapp.com",
    projectId: "eleventhexam-f0fab",
    storageBucket: "eleventhexam-f0fab.firebasestorage.app",
    messagingSenderId: "192315627607",
    appId: "1:192315627607:web:9f2e2794dc42aaa3352b12",
    measurementId: "G-3GXX6VXYT1"
  },
  // 🟦 Future placeholders
  class7: {},
  class8: {},
  class10: {},
  class12: {}
};

let currentClassId = "class11";
let clients = null;

/** Initialize or switch Firebase project context safely */
export function switchFirebaseProject(classId = "class11") {
  // 🧩 Normalize numeric class ID → add prefix
  if (!String(classId).startsWith("class")) {
    classId = `class${classId}`;
  }

  currentClassId = classId;
  const config = firebaseConfigs[classId];
  if (!config || !config.apiKey) {
    throw new Error(`Firebase config missing for ${classId}`);
  }

  // Avoid re-initializing same app
  const existing = getApps().find((a) => a.name === classId);
  const app = existing || initializeApp(config, classId);
  const auth = getAuth(app);
  const db = getFirestore(app);

  clients = { app, auth, db, classId };
  console.log(`[firebaseSwitcher] Active → ${classId}`);
  return clients;
}

/** Retrieve the active app/auth/db context */
export function getCurrentClients() {
  if (!clients) return switchFirebaseProject(currentClassId);
  return clients;
}

/** Get the currently selected class (from storage or fallback) */
export function getActiveClass() {
  const saved = localStorage.getItem("selectedClass");
  return saved ? (saved.startsWith("class") ? saved : `class${saved}`) : currentClassId;
}

/** Auto-select saved class on page load */
document.addEventListener("DOMContentLoaded", () => {
  const savedClass = getActiveClass();
  try {
    switchFirebaseProject(savedClass);
  } catch (err) {
    console.warn("[firebaseSwitcher] Failed to switch:", err.message);
  }
});
