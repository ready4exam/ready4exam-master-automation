// js/config.js
// -----------------------------------------------------------------------------
// Handles initialization of Firebase, Supabase, and Analytics
// ✅ Patched to dynamically reload Supabase (class-11) and clear old schema cache
// -----------------------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { switchFirebaseProject } from "./firebaseSwitcher.js";

let app, auth, db, analytics;
let supabase = null;
let currentClass = null;

// -----------------------------------------------------------------------------
// Initialize Firebase + Analytics
// -----------------------------------------------------------------------------
export function initializeServices() {
  console.log("[Config] Initializing services...");

  const configJSON = window.__firebase_config ? JSON.parse(window.__firebase_config) : null;
  if (!configJSON) {
    console.error("[Config] Missing Firebase configuration.");
    return;
  }

  app = initializeApp(configJSON);
  auth = getAuth(app);
  db = getFirestore(app);
  analytics = getAnalytics(app);

  console.log("[Config] Firebase + Analytics initialized.");
}

// -----------------------------------------------------------------------------
// Supabase Safe Init — clears old cache before creating new client
// -----------------------------------------------------------------------------
export function initSupabaseSafe() {
  try {
    // 🔥 Clear any previous session or cached client
    indexedDB.deleteDatabase("supabase-auth-token");
    indexedDB.deleteDatabase("localforage");
    localStorage.removeItem("sb-gkyvojcmqsgdynmitcuf-auth-token");
  } catch (e) {
    console.warn("[Config] IndexedDB clear warning:", e);
  }

  // 🚀 Reinitialize fresh Supabase (class-11 env)
  if (window.__supabase_config?.url && window.__supabase_config?.anonKey) {
    supabase = createClient(window.__supabase_config.url, window.__supabase_config.anonKey, {
      db: { schema: "public", persistSession: false },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    console.log("[Config] Supabase reinitialized:", window.__supabase_config.url);
  } else {
    console.error("[Config] Missing Supabase config during init!");
  }
}

// -----------------------------------------------------------------------------
// Firebase Project Switcher (for multi-class setup)
// -----------------------------------------------------------------------------
export function switchProjectForClass(classId) {
  if (currentClass === classId) return;
  currentClass = classId;
  console.log("[Config] Attempting to switch Firebase project for class=" + classId);
  switchFirebaseProject(classId);
}

// -----------------------------------------------------------------------------
// Expose all initialized clients
// -----------------------------------------------------------------------------
export function getInitializedClients() {
  if (!supabase) initSupabaseSafe();
  return { app, auth, db, supabase };
}

// -----------------------------------------------------------------------------
// Get current user
// -----------------------------------------------------------------------------
export function getAuthUser() {
  return auth?.currentUser || null;
}

// -----------------------------------------------------------------------------
// Analytics logging
// -----------------------------------------------------------------------------
export function logAnalyticsEvent(eventName, data = {}) {
  if (!analytics) return;
  try {
    logEvent(analytics, eventName, data);
  } catch (e) {
    console.warn("[Config] GA4 log failed:", e);
  }
}

// -----------------------------------------------------------------------------
// Combined initializer (called by quiz-engine.js)
// -----------------------------------------------------------------------------
export function initializeAll(classId) {
  switchProjectForClass(classId);
  initializeServices();
  initSupabaseSafe();
}
