// js/config.js
// --------------------------------------------------------------
// FINAL CLEAN VERSION (PHASE-3)
// - No class switching
// - Uses 1 Supabase only (class11 central DB)
// - Zero schema-cache errors
// --------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

let app = null;
let auth = null;
let db = null;
let analytics = null;
let supabase = null;

// --------------------------------------------------------------
// Initialize Firebase + Firestore + GA4
// --------------------------------------------------------------
export function initializeServices() {
  console.log("[CONFIG] Initializing Firebase + Firestore + Analytics…");

  const firebaseCfg = window.__firebase_config ? JSON.parse(window.__firebase_config) : null;
  if (!firebaseCfg) {
    console.error("[CONFIG] Missing Firebase configuration!");
    return;
  }

  app = initializeApp(firebaseCfg);
  auth = getAuth(app);
  db = getFirestore(app);

  try {
    analytics = getAnalytics(app);
  } catch (e) {
    console.warn("[CONFIG] GA4 not available:", e);
  }
}

// --------------------------------------------------------------
// Initialize Supabase (single DB, no switching)
// --------------------------------------------------------------
export function initSupabase() {
  if (supabase) return supabase;

  if (!window.__supabase_config?.url || !window.__supabase_config?.anonKey) {
    console.error("[CONFIG] Supabase config missing!");
    return null;
  }

  supabase = createClient(
    window.__supabase_config.url,
    window.__supabase_config.anonKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "public" },
    }
  );

  console.log("[CONFIG] Supabase initialized:", window.__supabase_config.url);
  return supabase;
}

// --------------------------------------------------------------
// Export Clients
// --------------------------------------------------------------
export function getInitializedClients() {
  if (!supabase) initSupabase();
  return { app, auth, db, supabase };
}

// --------------------------------------------------------------
// Auth helper
// --------------------------------------------------------------
export function getAuthUser() {
  return auth?.currentUser || null;
}

// --------------------------------------------------------------
// GA4 Logger
// --------------------------------------------------------------
export function logAnalyticsEvent(eventName, data = {}) {
  if (!analytics) return;
  try {
    logEvent(analytics, eventName, data);
  } catch (e) {
    console.warn("[CONFIG] GA4 log failed:", e);
  }
}
