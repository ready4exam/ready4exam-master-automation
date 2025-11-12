// js/config.js
// -----------------------------------------------------------------------------
// Handles initialization of Firebase, Supabase, and Analytics
// ✅ Safe-mode version to stop unwanted "public.thermodynamics" schema fetch
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
// Initialize Firebase + Analytics + Supabase (lazy)
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

  // ⚡ Supabase lazy initialization — defer schema hydration until user signs in
  if (!supabase && window.__supabase_config?.url && window.__supabase_config?.anonKey) {
    console.log("[Config] Supabase not yet initialized — waiting for user auth.");
  }
}

// -----------------------------------------------------------------------------
// Reinitialize Supabase safely after login (prevents schema-cache fetch)
// -----------------------------------------------------------------------------
export function initSupabaseSafe() {
  if (!supabase && window.__supabase_config?.url && window.__supabase_config?.anonKey) {
    supabase = createClient(window.__supabase_config.url, window.__supabase_config.anonKey, {
      db: { schema: "public", persistSession: false },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    console.log("[Config] Supabase initialized (safe mode).");
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
  if (!supabase) {
    initSupabaseSafe();
  }
  return { app, auth, db, supabase };
}

// -----------------------------------------------------------------------------
// Get Auth user
// -----------------------------------------------------------------------------
export function getAuthUser() {
  return auth?.currentUser || null;
}

// -----------------------------------------------------------------------------
// Analytics event logger
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
// Firebase initialization wrapper (for quiz-engine.js)
// -----------------------------------------------------------------------------
export function initializeAll(classId) {
  switchProjectForClass(classId);
  initializeServices();
  initSupabaseSafe();
}
