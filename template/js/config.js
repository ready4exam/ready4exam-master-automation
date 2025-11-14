// js/config.js
// -------------------------------------------------------------
// Phase-3 Clean Config (Eager Initialization - No Lazy Init)
// 100% Compatible with quiz-engine, auth-paywall, api.js
// -------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// -------------------------------------------------------------
// Firebase Config (injected by HTML script)
// -------------------------------------------------------------
const firebaseConfig = JSON.parse(window.__firebase_config);

// -------------------------------------------------------------
// 🚀 EAGER INITIALIZATION (NO LAZY INIT)
// -------------------------------------------------------------
console.log("[Config] Initializing Firebase…");
export const firebaseApp = initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDB = getFirestore(firebaseApp);
export const analytics = getAnalytics(firebaseApp);

console.log("[Config] Firebase initialized.");

// -------------------------------------------------------------
// Supabase Initialization (Eager)
// -------------------------------------------------------------
const SUPABASE_URL = "https://zqhzekzilalbszpfwxhn.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxaHpla3ppbGFsYnN6cGZ3eGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNjcyNjcsImV4cCI6MjA3Nzg0MzI2N30.RUa39KAfnBjLgaV9HTRfViPPXB861EOpCT2bv35q6Js";

console.log("[Config] Initializing Supabase…");
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: "public", persistSession: false },
  auth: { persistSession: false, autoRefreshToken: false },
});
console.log("[Config] Supabase initialized:", SUPABASE_URL);

// -------------------------------------------------------------
// Backward Compatibility for Phase-1/Phase-2 Code
// -------------------------------------------------------------
export function getInitializedClients() {
  return {
    app: firebaseApp,
    auth: firebaseAuth,
    db: firebaseDB,
    supabase,
  };
}

// -------------------------------------------------------------
// Auth user getter
// -------------------------------------------------------------
export function getAuthUser() {
  return firebaseAuth?.currentUser || null;
}

// -------------------------------------------------------------
// Analytics wrapper
// -------------------------------------------------------------
export function logAnalyticsEvent(event, data = {}) {
  try {
    logEvent(analytics, event, data);
  } catch (e) {
    console.warn("[Config] Analytics failed:", e);
  }
}
