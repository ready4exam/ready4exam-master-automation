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

let authListenerInitialized = false;

// -----------------------------------------------------------------------------
// Initialize Auth Listener (MUST RUN IN QUIZ PAGE)
// -----------------------------------------------------------------------------
export function initializeAuthListener() {
  const { auth } = getInitializedClients();
  if (authListenerInitialized) return;
  authListenerInitialized = true;

  onAuthStateChanged(auth, (user) => {
    console.log("[AUTH] State:", user?.email || "No user");

    const paywall = document.getElementById("paywall-screen");
    const quizContent = document.getElementById("quiz-content");

    if (user) {
      console.log("[AUTH] User signed in");
      // Hide paywall, show quiz container
      paywall?.classList.add("hidden");
      quizContent?.classList.remove("hidden");

      // Notify quiz engine to start
      document.dispatchEvent(new CustomEvent("r4e-auth-ready", { detail: user }));

    } else {
      console.log("[AUTH] No user → Show Paywall");
      paywall?.classList.remove("hidden");
      quizContent?.classList.add("hidden");
    }
  });

  console.log("[AUTH] Listener Initialized");
}

// -----------------------------------------------------------------------------
// Sign in with Google
// -----------------------------------------------------------------------------
export async function signInWithGoogle() {
  const { auth } = getInitializedClients();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    console.log("[AUTH] Using Popup...");
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.warn("[AUTH] Popup failed:", err?.code);
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
  console.log("[AUTH] Signed Out → Paywall shown");
  document.getElementById("paywall-screen")?.classList.remove("hidden");
  document.getElementById("quiz-content")?.classList.add("hidden");
}

// Temporary bypass always returns true — Quiz Engine checks this
export function checkAccess() {
  return true;
}
