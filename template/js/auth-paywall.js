// js/auth-paywall.js
// -----------------------------------------------------------------------------
// Handles Google Sign-In and Auth state for Ready4Exam
// -----------------------------------------------------------------------------

import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut as fbSignOut } 
  from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getInitializedClients } from "./config.js";
import * as UI from "./ui-renderer.js";

let authListenerInitialized = false;

// -----------------------------------------------------------------------------
// Initialize Auth Listener
// -----------------------------------------------------------------------------
export async function initializeAuthListener(callback) {
  const { auth } = getInitializedClients();
  if (authListenerInitialized) return;
  authListenerInitialized = true;

  onAuthStateChanged(auth, (user) => {
    console.log("[AUTH-PAYWALL] Auth state changed →", user ? "Signed In" : "Signed Out");
    callback(user);
  });
  console.log("[AUTH-PAYWALL] Auth listener initialized.");
}

// -----------------------------------------------------------------------------
// Sign in with Google
// -----------------------------------------------------------------------------
export async function signInWithGoogle() {
  try {
    const { auth } = getInitializedClients();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    console.log("[AUTH-PAYWALL] Opening Google Sign-In popup...");
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.warn("[AUTH-PAYWALL] Popup error:", err);
    if (err.code === "auth/popup-blocked" || err.code === "auth/popup-closed-by-user") {
      console.warn("[AUTH-PAYWALL] Popup failed — retrying with redirect...");
      const { auth } = getInitializedClients();
      const provider = new GoogleAuthProvider();
      await signInWithRedirect(auth, provider);
    }
  }
}

// -----------------------------------------------------------------------------
// Sign out
// -----------------------------------------------------------------------------
export async function signOut() {
  const { auth } = getInitializedClients();
  await fbSignOut(auth);
  console.log("[AUTH-PAYWALL] Signed out.");
}

// -----------------------------------------------------------------------------
// Check Access (temporary bypass)
// -----------------------------------------------------------------------------
export async function checkAccess() {
  return true; // bypass paywall for testing
}
