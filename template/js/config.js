// js/config.js
// -------------------------------------------------------------
// Phase-3 Clean Config (Single Firebase + Single Supabase)
// -------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

// -------------------------------------------------------------
// INTERNAL STATE
// -------------------------------------------------------------
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDB = null;
let analytics = null;
let supabase = null;

// -------------------------------------------------------------
// Firebase Init
// -------------------------------------------------------------
export function initFirebase() {
  if (!firebaseApp) {
    firebaseApp = initializeApp(JSON.parse(window.__firebase_config));
    firebaseAuth = getAuth(firebaseApp);
    firebaseDB = getFirestore(firebaseApp);
    analytics = getAnalytics(firebaseApp);

    console.log("[Config] Firebase initialized.");
  }
  return { firebaseApp, firebaseAuth, firebaseDB };
}

// -------------------------------------------------------------
// Supabase Init
// -------------------------------------------------------------
// INSERT YOUR SUPABASE URL + ANON KEY
const SUPABASE_URL = "https://zqhzekzilalbszpfwxhn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxaHpla3ppbGFsYnN6cGZ3eGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNjcyNjcsImV4cCI6MjA3Nzg0MzI2N30.RUa39KAfnBjLgaV9HTRfViPPXB861EOpCT2bv35q6Js";

export function initSupabase() {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: { schema: "public", persistSession: false },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    console.log("[Config] Supabase initialized:", SUPABASE_URL);
  }
  return supabase;
}

// -------------------------------------------------------------
// Initialize Everything
// -------------------------------------------------------------
export function initializeAll() {
  initFirebase();
  initSupabase();
}

// -------------------------------------------------------------
// Expose clients
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
// Analytics
// -------------------------------------------------------------
export function logAnalyticsEvent(event, data = {}) {
  try {
    logEvent(analytics, event, data);
  } catch (e) {
    console.warn("[Config] Analytics failed:", e);
  }
}
