// firebaseSwitcher.js
// -----------------------------------------------------------------------------
// Manages multi-Firebase project initialization (Class 9, Class 11, placeholders)
// -----------------------------------------------------------------------------

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// -----------------------------------------------------------------------------
// Firebase Configurations (production keys)
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
};

// -----------------------------------------------------------------------------
// Internal State
// -----------------------------------------------------------------------------
let currentClassId = localStorage.getItem("selectedClass") || "class11";
let clients = null;

// -----------------------------------------------------------------------------
// Core: switchFirebaseProject()
// -----------------------------------------------------------------------------
export function switchFirebaseProject(classId = "class11") {
  try {
    if (!classId.startsWith("class")) classId = `class${classId}`;
    if (!firebaseConfigs[classId]) {
      console.warn(`[firebaseSwitcher] Missing config for ${classId} — falling back to class11.`);
      classId = "class11";
    }

    currentClassId = classId;
    const config = firebaseConfigs[classId];
    if (!config) throw new Error(`Firebase config missing for ${classId}`);

    // Prevent duplicate initialization
    const existing = getApps().find((a) => a.name === classId);
    const app = existing || initializeApp(config, classId);
    const auth = getAuth(app);
    const db = getFirestore(app);

    clients = { app, auth, db, classId };
    console.log(`[firebaseSwitcher] Active → ${classId}`);
    return clients;
  } catch (err) {
    console.error("[firebaseSwitcher] Failed to switch:", err.message);
    return null;
  }
}

// -----------------------------------------------------------------------------
// Helper: getCurrentClients()
// -----------------------------------------------------------------------------
export function getCurrentClients() {
  if (clients) return clients;
  return switchFirebaseProject(currentClassId);
}

// -----------------------------------------------------------------------------
// Helper: getActiveClass()
// -----------------------------------------------------------------------------
export function getActiveClass() {
  return currentClassId;
}
