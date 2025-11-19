// js/auth-paywall.js
// -------------------------------------------------------------
// Phase-3 Auth Layer (Firebase-only Auth, Supabase anonymous)
// -------------------------------------------------------------

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  onAuthStateChanged,
  signOut as fbSignOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import { getInitializedClients } from "./config.js";

let listenerSetup = false;

export function initializeAuthListener() {
  if (listenerSetup) return;
  listenerSetup = true;

  const { auth } = getInitializedClients();

  onAuthStateChanged(auth, async (user) => {
    console.log("[AUTH] State:", user?.email || "No user");

    const paywall = document.getElementById("paywall-screen");
    const quizContent = document.getElementById("quiz-content");
    const logoutBtn = document.getElementById("logout-nav-btn");

    if (user) {
      console.log("[AUTH] User signed in");
      console.log("[AUTH] Firebase login OK — Supabase stays anonymous.");

      // UI updates
      paywall?.classList.add("hidden");
      quizContent?.classList.remove("hidden");
      logoutBtn?.classList.remove("hidden");

      // Notify quiz engine
      document.dispatchEvent(
        new CustomEvent("r4e-auth-ready", { detail: user })
      );

    } else {
      console.log("[AUTH] Logged out → Show Paywall");
      paywall?.classList.remove("hidden");
      quizContent?.classList.add("hidden");
      logoutBtn?.classList.add("hidden");
    }
  });

  console.log("[AUTH] Listener Initialized");
}

// -------------------------------------------------------------
// Google Sign-In
// -------------------------------------------------------------
export async function signInWithGoogle() {
  const { auth } = getInitializedClients();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    console.log("[AUTH] Popup sign-in…");
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.warn("[AUTH] Popup failed:", err?.code);
    console.log("[AUTH] Switching to redirect mode…");
    await signInWithRedirect(auth, provider);
  }
}

// -------------------------------------------------------------
// Sign Out
// -------------------------------------------------------------
export async function signOut() {
  const { auth } = getInitializedClients();

  await fbSignOut(auth).catch((e) =>
    console.warn("[AUTH] Firebase signOut error:", e)
  );

  console.log("[AUTH] Signed Out → UI reset");

  document.getElementById("paywall-screen")?.classList.remove("hidden");
  document.getElementById("quiz-content")?.classList.add("hidden");
}

// -------------------------------------------------------------
// Compatibility stub
// -------------------------------------------------------------
export function checkAccess() {
  return true;
}
