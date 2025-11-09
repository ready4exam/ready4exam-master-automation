// js/config.js
// -----------------------------------------------------------------------------
// Central configuration hub for Ready4Exam
// Initializes Firebase (via firebaseSwitcher.js), Supabase, and GA4 Analytics
// -----------------------------------------------------------------------------

import { getCurrentClients, switchFirebaseProject, getActiveClass } from "./firebaseSwitcher.js";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// -----------------------------------------------------------------------------
// 🧠 Internal state
// -----------------------------------------------------------------------------
let supabase = null;
let analyticsInitialized = false;

// -----------------------------------------------------------------------------
// ✅ initializeServices()
// Initializes Firebase (through firebaseSwitcher), Supabase, and GA4
// -----------------------------------------------------------------------------
export async function initializeServices() {
  console.log("[Config] Initializing services...");

  // 1️⃣ Firebase Initialization
  const activeClass = getActiveClass();
  const { app, auth, db } = switchFirebaseProject(activeClass);
  console.log(`[Config] Firebase initialized for: ${activeClass}`);

  // 2️⃣ Supabase Initialization (static across all classes)
  const SUPABASE_URL = "https://gkyvojcmqsgdynmitcuf.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdreXZvamNtcXNnZHlubWl0Y3VmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NDQ0OTcsImV4cCI6MjA3NjMyMDQ5N30.5dn5HbXxQ5sYNECS9o3VxVeyL6I6Z2Yf-nmPwztx1hE";

  if (!supabase) {
    supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("[Config] Supabase initialized:", SUPABASE_URL);
  }

  // 3️⃣ Google Analytics (GA4)
  const measurementId = "G-4EFDM0CRYY"; // Your main Ready4Exam GA4 ID
  if (measurementId && typeof window !== "undefined" && !analyticsInitialized) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", measurementId, { send_page_view: false });
    analyticsInitialized = true;
    console.log("[Config] Google Analytics initialized:", measurementId);
  }

  return { app, auth, db, supabase };
}

// -----------------------------------------------------------------------------
// ✅ getInitializedClients()
// Returns currently active app/auth/db + supabase clients
// -----------------------------------------------------------------------------
export function getInitializedClients() {
  try {
    const { app, auth, db } = getCurrentClients();
    if (!app || !auth || !db) throw new Error("Firebase not initialized.");
    return { app, auth, db, supabase };
  } catch (err) {
    console.error("[Config] getInitializedClients failed:", err.message);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// ✅ getAuthUser()
// Returns the currently authenticated Firebase user
// -----------------------------------------------------------------------------
export function getAuthUser() {
  try {
    const { auth } = getCurrentClients();
    return auth?.currentUser || null;
  } catch (err) {
    console.warn("[Config] getAuthUser() failed:", err.message);
    return null;
  }
}

// -----------------------------------------------------------------------------
// ✅ logAnalyticsEvent()
// Wrapper for Google Analytics custom event logging
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
