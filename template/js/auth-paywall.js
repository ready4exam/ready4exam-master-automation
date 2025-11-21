// js/auth-paywall.js
// -------------------------------------------------------
// Firebase Login Paywall (Minimal-Patch Version)
// - No dependency on ui-renderer.js
// - Pure DOM-based hide/show of auth UI
// - Safe for MasterAutomation → Class 11 automation
// -------------------------------------------------------

import {
  initializeServices,
  getInitializedClients
} from "./config.js";

import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const LOG = "[AUTH]";
let externalCallback = null;

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// -------------------------------------------------------
// PURE DOM — NO DEPENDENCIES
// -------------------------------------------------------
function hidePaywall() {
  const el = document.querySelector("#auth-container") ||
             document.querySelector("#signin-card")   ||
             document.querySelector(".auth-box")      ||
             document.querySelector(".paywall-screen")||
             document.querySelector("#paywall")       ||
             document.querySelector(".paywall");
  if (el) el.style.display = "none";
}

function showPaywall() {
  const el = document.querySelector("#auth-container") ||
             document.querySelector("#signin-card")   ||
             document.querySelector(".auth-box")      ||
             document.querySelector(".paywall-screen")||
             document.querySelector("#paywall")       ||
             document.querySelector(".paywall");
  if (el) el.style.display = "block";
}

// Optionally show "loading" text (simple fallback)
function showAuthLoading(msg = "Loading…") {
  const load = document.querySelector("#auth-loading") ||
               document.querySelector(".auth-loading");
  if (load) {
    load.textContent = msg;
    load.style.display = "block";
  }
}

function hideAuthLoading() {
  const load = document.querySelector("#auth-loading") ||
               document.querySelector(".auth-loading");
  if (load) load.style.display = "none";
}

// -------------------------------------------------------
// INITIALIZE AUTH LISTENER
// -------------------------------------------------------
export async function initializeAuthListener(callback = null) {
  await initializeServices();
  const { auth } = getInitializedClients();

  if (callback) externalCallback = callback;

  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (err) {
    console.warn(LOG, "Persistence failed, fallback active.", err);
  }

  onAuthStateChanged(auth, (user) => {
    console.log(LOG, "Auth state →", user ? user.email : "Signed OUT");

    if (user) {
      hidePaywall(); // ← minimal patch: hide login box immediately
      hideAuthLoading();

      if (externalCallback) {
        try { externalCallback(user); } catch (err) {}
      }

      return; // stop here
    }

    // Signed OUT
    showPaywall();
    showAuthLoading("Please sign in to continue");

    if (externalCallback) {
      try { externalCallback(null); } catch (err) {}
    }
  });

  console.log(LOG, "Auth listener initialized.");
}

// -------------------------------------------------------
// SIGN IN WITH GOOGLE POPUP
// -------------------------------------------------------
export async function signInWithGoogle() {
  await initializeServices();
  const { auth } = getInitializedClients();

  showAuthLoading("Opening Google Login…");

  try {
    const result = await signInWithPopup(auth, provider);
    hideAuthLoading();
    hidePaywall();
    return result.user;
  } catch (err) {
    console.error(LOG, "Google popup error:", err);
    hideAuthLoading();
    return null;
  }
}

// -------------------------------------------------------
// SIGN OUT
// -------------------------------------------------------
export async function signOut() {
  await initializeServices();
  const { auth } = getInitializedClients();

  showPaywall();
  showAuthLoading("Signing out…");

  return firebaseSignOut(auth);
}
