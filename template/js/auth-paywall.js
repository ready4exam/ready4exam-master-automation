// js/auth-paywall.js
// -----------------------------------------------------------
// Phase-3 Auth Paywall (Stable - popup flow, single-file fix)
// - Uses firebaseAuth from config.js (no changes to config.js)
// - Uses paywall-screen id from quiz-engine.html
// - Exports checkAccess() used by quiz-engine.js
// -----------------------------------------------------------

import { firebaseAuth } from "./config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Ensure handlers attach after DOM is ready
function onReady(fn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn);
  } else {
    fn();
  }
}

// -----------------------------------------------------------
// SHOW / HIDE PAYWALL (match HTML id "paywall-screen")
// -----------------------------------------------------------
function showPaywall() {
  const el = document.getElementById("paywall-screen");
  if (el) el.classList.remove("hidden");
}

function hidePaywall() {
  const el = document.getElementById("paywall-screen");
  if (el) el.classList.add("hidden");
}

// -----------------------------------------------------------
// CHECK ACCESS - exported for quiz-engine.js
// Resolves true when user is signed in, false otherwise.
// -----------------------------------------------------------
export async function checkAccess() {
  return new Promise((resolve) => {
    // onAuthStateChanged will fire immediately with current state
    onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        hidePaywall();
        resolve(true);
      } else {
        showPaywall();
        resolve(false);
      }
    }, (err) => {
      console.error("[AUTH] onAuthStateChanged error:", err);
      showPaywall();
      resolve(false);
    });
  });
}

// -----------------------------------------------------------
// GOOGLE SIGN-IN (popup)
// Attach handler safely after DOM is ready
// -----------------------------------------------------------
onReady(() => {
  const btn = document.getElementById("google-signin-btn");
  if (!btn) return;

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const provider = new GoogleAuthProvider();
      // popup will be blocked if not triggered by user gesture; this is fine here
      await signInWithPopup(firebaseAuth, provider);
      // onAuthStateChanged will handle hiding the paywall and resolving checkAccess
      hidePaywall();
    } catch (err) {
      // log full error for debugging; do not throw
      console.error("[AUTH] Google Sign-In Failed:", err);
      // keep paywall visible; show a friendly status if available
      const status = document.getElementById("status-message");
      if (status) {
        status.textContent = "Google Sign-In failed. Please try again.";
        status.classList.remove("hidden");
      }
    }
  });
});
