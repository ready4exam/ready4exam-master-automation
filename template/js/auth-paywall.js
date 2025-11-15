// js/auth-paywall.js
// -----------------------------------------------------------
// Phase-3 Auth Paywall (Popup Flow) — FIXED for latest config.js
// -----------------------------------------------------------

import { firebaseAuth } from "./config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// -----------------------------------------------------------
// CHECK ACCESS
// -----------------------------------------------------------
export async function checkAccess() {
  return new Promise((resolve) => {
    onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        hidePaywall();
        resolve(true);
      } else {
        showPaywall();
        resolve(false);
      }
    });
  });
}

// -----------------------------------------------------------
// SHOW / HIDE PAYWALL
// -----------------------------------------------------------
function showPaywall() {
  document.getElementById("paywall").classList.remove("hidden");
}

function hidePaywall() {
  document.getElementById("paywall").classList.add("hidden");
}

// -----------------------------------------------------------
// GOOGLE SIGN-IN (POPUP FLOW)
// -----------------------------------------------------------
document.getElementById("google-signin-btn")?.addEventListener("click", async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(firebaseAuth, provider);

    hidePaywall();
  } catch (err) {
    console.error("[AUTH] Google Sign-In Failed:", err);
  }
});
