// js/firebaseSwitcher.js
// -----------------------------------------------------------------------------
// Manages multi-Firebase project initialization (Class 9, Class 11 + placeholders)
// Central source of truth for all Firebase configs
// -----------------------------------------------------------------------------

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// -----------------------------------------------------------------------------
// 🧩 Firebase Configurations for Each Class
// -----------------------------------------------------------------------------
const firebaseConfigs = {
  class9: {
    apiKey: "AIzaSyD_lVcPJMcj9p_p_I5RdJRqQzsi_-VL4Xk",
    authDomain: "classnine-e8217.firebaseapp.com",
    projectId: "classnine-e8217",
    storageBucket: "classnine-e8217.firebasestorage.app",
    messagingSenderId: "1001949713983",
    appId: "1:1001949713983:web:92bb90dac63b9b4e2c8a8a",
    measurementId: "G-4RKBW58LED",
  },
  class11: {
    apiKey: "AIzaSyCFkuTUao-HGQhX438cVOUvUiS3kT2m7Os",
    authDomain: "eleventhexam-f0fab.firebaseapp.com",
    projectId: "eleventhexam-f0fab",
    storageBucket: "eleventhexam-f0fab.firebasestorage.app",
    messagingSenderId: "192315627607",
    appId: "1:192315627607:web:9f2e2794dc42aaa3352b12",
    measurementId: "G-3GXX6VXYT1",
  },

  // 🟨 Placeholders (for classes not yet active)
  class6: {},
  class7: {},
  class8: {},
  class10: {},
  class12: {},
};

// -----------------------------------------------------------------------------
// 🧠 Internal State
// -----------------------------------------------------------------------------
let currentClassId = "class11";
let clients = null;

// -----------------------------------------------------------------------------
// ✅ switchFirebaseProject()
// Initialize or switch Firebase project context safely
// -----------------------------------------------------------------------------
export function switchFirebaseProject(classId = "class11") {
  // Normalize numeric ID → add prefix
  if (!String(classId).startsWith("class")) {
    classId = `class${classId}`;
  }

  currentClassId = classId;
  let config = firebaseConfigs[classId];

  // Graceful fallback to class11 if config missing or invalid
  if (!config || !config.apiKey) {
    console.warn(`[firebaseSwitcher] Missing config for ${classId} — falling back to class11.`);
    config = firebaseConfigs["class11"];
    currentClassId = "class11";
  }

  // Avoid reinitializing if app already exists
  const existing = getApps().find((a) => a.name === currentClassId);
  const app = existing || initializeApp(config, currentClassId);
  const auth = getAuth(app);
  const db = getFirestore(app);

  clients = { app, auth, db, classId: currentClassId };
  console.log(`[firebaseSwitcher] Active → ${currentClassId}`);
  return clients;
}

// -----------------------------------------------------------------------------
// ✅ getCurrentClients()
// Retrieve current Firebase app/auth/db context
// -----------------------------------------------------------------------------
export function getCurrentClients() {
  if (!clients) {
    console.warn("[firebaseSwitcher] Clients not initialized — switching to default.");
    return switchFirebaseProject(currentClassId);
  }
  return clients;
}

// -----------------------------------------------------------------------------
// ✅ getActiveClass()
// Return currently selected class from storage or default
// -----------------------------------------------------------------------------
export function getActiveClass() {
  const saved = localStorage.getItem("selectedClass");
  if (!saved) return currentClassId;
  return saved.startsWith("class") ? saved : `class${saved}`;
}

// -----------------------------------------------------------------------------
// ✅ Auto-Switch on Page Load
// -----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const savedClass = getActiveClass();
  try {
    switchFirebaseProject(savedClass);
  } catch (err) {
    console.warn("[firebaseSwitcher] Failed to switch:", err.message);
    console.log("[firebaseSwitcher] Falling back to class11.");
    switchFirebaseProject("class11");
  }
});
