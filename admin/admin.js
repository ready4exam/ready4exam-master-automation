// js/config.js
// Optimized: Lazy-loads heavy libraries to fix initial quiz latency

// Essential imports for first paint and Admin control
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js"; 
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDB = null; 
let supabase = null;
let analyticsInstance = null;

/**
 * High-speed initialization. 
 * Starts Auth, Firestore (for Admin/Manual Overrides), and Supabase.
 */
export async function initializeServices() {
  // Return existing clients if already initialized
  if (firebaseApp && firebaseDB && supabase) {
    return { auth: firebaseAuth, db: firebaseDB, supabase };
  }

  // Safety check for config object
  const cfg = window.__firebase_config;
  if (!cfg?.apiKey) throw new Error("Firebase config missing"); 

  // Initialize Core Firebase
  firebaseApp = initializeApp(cfg); 
  firebaseAuth = getAuth(firebaseApp); 
  
  // Initialize Firestore - MUST be active for Admin Panel
  firebaseDB = getFirestore(firebaseApp);

  // Initialize Supabase for question fetching
  supabase = createSupabaseClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false }
  }); 

  window.supabase = supabase; 

  return { auth: firebaseAuth, db: firebaseDB, supabase }; 
}

/**
 * Returns initialized clients to admin.js and quiz-engine.js
 */
export function getInitializedClients() {
  if (!firebaseApp) throw new Error("Call initializeServices FIRST"); 
  return { auth: firebaseAuth, db: firebaseDB, supabase }; 
}

/**
 * Quick access to current logged-in user
 */
export function getAuthUser() {
  return firebaseAuth?.currentUser || null; 
}

/**
 * Optimized Analytics: Only loads the library when an event is actually triggered
 */
export async function logAnalyticsEvent(evt, data = {}) {
  const cfg = window.__firebase_config;
  if (!cfg?.measurementId) return; 

  try {
    const { getAnalytics, logEvent } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js");
    if (!analyticsInstance) {
      analyticsInstance = getAnalytics(firebaseApp); 
    }
    logEvent(analyticsInstance, evt, data); 
  } catch (e) {
    console.warn("Analytics blocked or failed"); 
  }
}
