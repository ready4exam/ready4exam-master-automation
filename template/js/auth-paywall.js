// js/auth-paywall.js
// -----------------------------------------------------------------------------
// Handles Google Sign-In and Auth state for Ready4Exam
// -----------------------------------------------------------------------------

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  onAuthStateChanged,
  signOut as fbSignOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import { getInitializedClients } from "./config.js";
import * as UI from "./ui-renderer.js";

let authListenerInitialized = false;

// -----------------------------------------------------------------------------
// Initialize Auth Listener
// -----------------------------------------------------------------------------
export async function initializeAuthListener() {
  const { auth } = getInitializedClients();
  if (authListenerInitialized) return;
  authListenerInitialized = true;

  onAuthStateChanged(auth, (user) => {
    console.log("[AUTH] State:", user?.email || "No user");

    if (user) {
      UI.showQuizContent(); // hide paywall + show quiz
      document.dispatchEvent(new CustomEvent("r4e-auth-ready", { detail: user }));
    } else {
      UI.showPaywall();
    }
  });

  console.log("[AUTH] Listener Initialized");
}

// -----------------------------------------------------------------------------
// Sign in with Google
// -----------------------------------------------------------------------------
export async function signInWithGoogle() {
  try {
    const { auth } = getInitializedClients();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    console.log("[AUTH] Using Popup...");
    await signInWithPopup(auth, provider);

  } catch (err) {
    console.warn("[AUTH] Popup failed:", err?.code);

    const { auth } = getInitializedClients();
    const provider = new GoogleAuthProvider();
    console.log("[AUTH] Switching to Redirect...");
    await signInWithRedirect(auth, provider);
  }
}

// -----------------------------------------------------------------------------
// Sign Out
// -----------------------------------------------------------------------------
export async function signOut() {
  const { auth } = getInitializedClients();
  await fbSignOut(auth);
  console.log("[AUTH] Signed Out → Showing Paywall");
  UI.showPaywall();
}

// -----------------------------------------------------------------------------
// Temporary Bypass for testing quiz engine
// -----------------------------------------------------------------------------
export function checkAccess() {
  return true;
}
