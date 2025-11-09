// js/config.js
// -----------------------------------------------------------------------------
// Initializes Firebase, Supabase, and Google Analytics (GA4)
// Supports multi-class Firebase projects via firebaseSwitcher.js
// -----------------------------------------------------------------------------

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { switchFirebaseProject, getCurrentClients } from "./firebaseSwitcher.js";

// ---------- Internal State ----------
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDB = null;
let supabase = null;
let analyticsInitialized = false;
let activeClassId = null;

// -----------------------------------------------------------------------------
// initializeServices(classId)
// -----------------------------------------------------------------------------
export async function initializeServices(classId = null) {
  console.log("[Config] Initializing services...");

  // ✅ Re-use existing initialized clients (avoid duplicates)
  if (firebaseApp && supabase && !classId) {
    return { app: firebaseApp, auth: firebaseAuth, db: firebaseDB, supabase };
  }

  // ---------- Step 1. Initialize Firebase ----------
  try {
    let clients = null;

    if (classId) {
      console.log(`[Config] Attempting to switch Firebase project for class=${classId}`);
      clients = switchFirebaseProject(classId);
    } else {
      // Fallback: default injection (for safety)
      const cfg = JSON.parse(window.__firebase_config || "{}");
      if (!cfg?.apiKey) throw new Error("Firebase config missing (no class specified).");
      firebaseApp = initializeApp(cfg);
      firebaseAuth = getAuth(firebaseApp);
      firebaseDB = getFirestore(firebaseApp);
      activeClassId = "default";
      console.log("[Config] Firebase initialized from window.__firebase_config.");
    }

    // If switchFirebaseProject succeeded
    if (clients?.app) {
      firebaseApp = clients.app;
      firebaseAuth = clients.auth;
      firebaseDB = clients.db;
      activeClassId = clients.classId || classId;
    }

    // Double-check Firebase loaded
    if (!firebaseApp) throw new Error("Firebase app not initialized.");

    console.log(`[Config] Firebase initialized → active project: ${activeClassId}`);
  } catch (err) {
    console.error("[Config] Firebase initialization failed:", err);
    throw err;
  }

  // ---------- Step 2. Initialize Supabase ----------
  try {
    const SUPABASE_URL = "https://gkyvojcmqsgdynmitcuf.supabase.co";
    const SUPABASE_ANON_KEY =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdreXZvamNtcXNnZHlubWl0Y3VmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NDQ0OTcsImV4cCI6MjA3NjMyMDQ5N30.5dn5HbXxQ5sYNECS9o3VxVeyL6I6Z2Yf-nmPwztx1hE";

    supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("[Config] Supabase initialized:", SUPABASE_URL);
  } catch (err) {
    console.warn("[Config] Supabase initialization failed:", err);
  }

  // ---------- Step 3. Initialize Google Analytics ----------
  try {
    const measurementId =
      window.__firebase_config &&
      JSON.parse(window.__firebase_config || "{}").measurementId;

    if (measurementId && typeof window !== "undefined") {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
      window.gtag("js", new Date());
      window.gtag("config", measurementId, { send_page_view: false });
      analyticsInitialized = true;
      console.log("[Config] Google Analytics initialized:", measurementId);
    } else {
      console.log("[Config] GA4 skipped (no measurement ID).");
    }
  } catch (err) {
    console.warn("[Config] GA4 initialization error:", err);
  }

  return { app: firebaseApp, auth: firebaseAuth, db: firebaseDB, supabase };
}

// -----------------------------------------------------------------------------
// getInitializedClients()
// -----------------------------------------------------------------------------
export function getInitializedClients() {
  try {
    const clients = getCurrentClients();
    if (clients) {
      return { app: clients.app, auth: clients.auth, db: clients.db, supabase };
    }
  } catch (err) {
    console.warn("[Config] getCurrentClients() unavailable:", err);
  }

  if (!firebaseApp) throw new Error("Firebase not initialized yet.");
  return { app: firebaseApp, auth: firebaseAuth, db: firebaseDB, supabase };
}

// -----------------------------------------------------------------------------
// getAuthUser()
// -----------------------------------------------------------------------------
export function getAuthUser() {
  return (firebaseAuth && firebaseAuth.currentUser) || null;
}

// -----------------------------------------------------------------------------
// logAnalyticsEvent()
// -----------------------------------------------------------------------------
export function logAnalyticsEvent(eventName, params = {}) {
  if (!analyticsInitialized || typeof window.gtag !== "function") {
    console.warn("[GA4] gtag not available — event not logged:", eventName);
    return;
  }
  try {
    window.gtag("event", eventName, params);
    console.log("[GA4] Event logged:", eventName, params);
  } catch (err) {
    console.error("[GA4] Failed to log event:", err);
  }
}

// -----------------------------------------------------------------------------
// Exported references for advanced usage
// -----------------------------------------------------------------------------
export { firebaseApp, firebaseAuth, firebaseDB, supabase };
