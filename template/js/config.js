// config.js
// -----------------------------------------------------------------------------
// Central configuration for Ready4Exam
// Initializes Firebase (via firebaseSwitcher.js), Supabase, and GA4
// -----------------------------------------------------------------------------

import { getCurrentClients, switchFirebaseProject, getActiveClass } from "./firebaseSwitcher.js";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// -----------------------------------------------------------------------------
// Internal State
// -----------------------------------------------------------------------------
let supabase = null;
let analyticsInitialized = false;

// -----------------------------------------------------------------------------
// initializeServices()
// -----------------------------------------------------------------------------
export async function initializeServices() {
  console.log("[Config] Initializing services...");

  // 🔹 Initialize Firebase via switcher
  const activeClass = getActiveClass();
  const clients = switchFirebaseProject(activeClass);
  if (!clients) throw new Error("Firebase initialization failed.");
  const { app, auth, db } = clients;
  console.log(`[Config] Firebase initialized for: ${activeClass}`);

  // 🔹 Initialize Supabase
  const SUPABASE_URL = "https://gkyvojcmqsgdynmitcuf.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdreXZvamNtcXNnZHlubWl0Y3VmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NDQ0OTcsImV4cCI6MjA3NjMyMDQ5N30.5dn5HbXxQ5sYNECS9o3VxVeyL6I6Z2Yf-nmPwztx1hE";

  if (!supabase) {
    supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("[Config] Supabase initialized:", SUPABASE_URL);
  }

  // 🔹 Initialize GA4
  const measurementId = "G-4EFDM0CRYY";
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
// Helpers
// -----------------------------------------------------------------------------
export function getInitializedClients() {
  const clients = getCurrentClients();
  if (!clients) throw new Error("Firebase not initialized.");
  return { ...clients, supabase };
}

export function getAuthUser() {
  try {
    const { auth } = getCurrentClients();
    return auth?.currentUser || null;
  } catch {
    return null;
  }
}

export function logAnalyticsEvent(eventName, params = {}) {
  if (!analyticsInitialized || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", eventName, params);
    console.log("[GA4] Event logged:", eventName, params);
  } catch (err) {
    console.error("[GA4] Failed to log event:", err);
  }
}
