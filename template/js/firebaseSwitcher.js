// firebaseSwitcher.js
// -----------------------------------------------------------------------------
// Manages Firebase project initialization — now restricted to Class 11 only
// -----------------------------------------------------------------------------

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// -----------------------------------------------------------------------------
// Firebase Configurations (only class 11 active)
// -----------------------------------------------------------------------------
const firebaseConfigs = {
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
let currentClassId = "class11";
let clients = null;

// -----------------------------------------------------------------------------
// Core: switchFirebaseProject()
// -----------------------------------------------------------------------------
export function switchFirebaseProject(classId = "class11") {
  try {
    // Force to class11 only
    currentClassId = "class11";
    const config = firebaseConfigs["class11"];
    if (!config) throw new Error("Firebase config missing for class11");

    // Prevent duplicate initialization
    const existing = getApps().find((a) => a.name === "class11");
    const app = existing || initializeApp(config, "class11");
    const auth = getAuth(app);
    const db = getFirestore(app);

    clients = { app, auth, db, classId: "class11" };
    console.log(`[firebaseSwitcher] Active → class11`);
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
  return switchFirebaseProject("class11");
}

// -----------------------------------------------------------------------------
// Helper: getActiveClass()
// -----------------------------------------------------------------------------
export function getActiveClass() {
  return "class11";
}
