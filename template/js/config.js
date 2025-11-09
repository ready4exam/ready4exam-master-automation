// js/config.js
// -----------------------------------------------------------------------------
// Initializes Firebase, Supabase, and Google Analytics (GA4)
// Supports named Firebase apps via firebaseSwitcher.js
// -----------------------------------------------------------------------------

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { switchFirebaseProject, getCurrentClients } from "./firebaseSwitcher.js";

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDB = null;
let supabase = null;
let analyticsInitialized = false;

// -----------------------------------------------------------------------------
// initializeServices()
// -----------------------------------------------------------------------------
export async function initializeServices(classId = null) {
  console.log("[Config] Initializing services...");

  // reuse if already initialized
  if (firebaseApp && supabase && !classId) {
    return { app: firebaseApp, auth: firebaseAuth, db: firebaseDB, supabase };
  }

  // Switch to proper Firebase project
  if (classId) {
    console.log(`[Config] Attempting to switch Firebase project for class=${classId}`);
    const clients = switchFirebaseProject(classId);
    firebaseApp = clients.app;
    firebaseAuth = clients.auth;
    firebaseDB = clients.db;
  } else {
    const cfg = JSON.parse(window.__firebase_config || "{}");
    if (!cfg?.apiKey) throw new Error("Firebase config missing.");
    const appName = cfg.projectId || "ready4exam-default";
    firebaseApp = getApps().find(a => a.name === appName) || initializeApp(cfg, appName);
    firebaseAuth = getAuth(firebaseApp);
    firebaseDB = getFirestore(firebaseApp);
    console.log("[Config] Firebase initialized → active project:", appName);
  }

  // Supabase
  const SUPABASE_URL = "https://gkyvojcmqsgdynmitcuf.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdreXZvamNtcXNnZHlubWl0Y3VmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NDQ0OTcsImV4cCI6MjA3NjMyMDQ5N30.5dn5HbXxQ5sYNECS9o3VxVeyL6I6Z2Yf-nmPwztx1hE";
  supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("[Config] Supabase initialized:", SUPABASE_URL);

  // Google Analytics
  const measurementId = JSON.parse(window.__firebase_config || "{}")?.measurementId;
  if (measurementId && typeof window !== "undefined") {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", measurementId, { send_page_view: false });
    analyticsInitialized = true;
    console.log("[Config] Google Analytics initialized:", measurementId);
  }

  return { app: firebaseApp, auth: firebaseAuth, db: firebaseDB, supabase };
}

export function getInitializedClients() {
  try {
    const clients = getCurrentClients();
    if (clients) return { app: clients.app, auth: clients.auth, db: clients.db, supabase };
  } catch {}
  if (!firebaseApp) throw new Error("Firebase not initialized yet.");
  return { app: firebaseApp, auth: firebaseAuth, db: firebaseDB, supabase };
}

export function getAuthUser() {
  return (firebaseAuth && firebaseAuth.currentUser) || null;
}

export function logAnalyticsEvent(eventName, params = {}) {
  if (!analyticsInitialized || typeof window.gtag !== "function") return;
  window.gtag("event", eventName, params);
}

export { firebaseApp, firebaseAuth, firebaseDB, supabase };
