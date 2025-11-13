// js/config.js
// -------------------------------------------------------------
// Phase-3 Config: Firebase + Supabase unified initialization
// No switching, no schema-polluting calls, safe Supabase init.
// -------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export let app = null;
export let auth = null;
export let db = null;
export let analytics = null;
export let supabase = null;

// -------------------------------------------------------------
// Initialize Firebase
// -------------------------------------------------------------
export function initFirebase() {
  if (app) return app;

  try {
    const cfg = JSON.parse(window.__firebase_config);

    app = initializeApp(cfg);
    auth = getAuth(app);
    db = getFirestore(app);
    analytics = getAnalytics(app);

    console.log("[Config] Firebase initialized.");
    return app;

  } catch (err) {
    console.error("[Config] Firebase init failed:", err);
  }
}

// -------------------------------------------------------------
// Initialize Supabase (SAFE MODE → NO SCHEMA PREFETCH)
// -------------------------------------------------------------
export function initSupabase() {
  if (supabase) return supabase;

  const cfg = window.__supabase_config;

  if (!cfg?.url || !cfg?.anonKey) {
    console.error("[Config] Missing Supabase env.");
    return null;
  }

  supabase = createClient(cfg.url, cfg.anonKey, {
    db: {
      schema: "public",
      persistSession: false
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  console.log("[Config] Supabase initialized:", cfg.url);
  return supabase;
}

// -------------------------------------------------------------
// Safe aggregator for quiz-engine.js
// -------------------------------------------------------------
export function getInitializedClients() {
  if (!app) initFirebase();
  if (!supabase) initSupabase();

  return { app, auth, db, supabase };
}

// -------------------------------------------------------------
// GA4 Logging (Silent fail-safe)
// -------------------------------------------------------------
export function logAnalyticsEvent(eventName, data = {}) {
  try {
    if (!analytics) return;
    logEvent(analytics, eventName, data);
  } catch (err) {
    console.warn("[Config] GA log skipped:", err);
  }
}
