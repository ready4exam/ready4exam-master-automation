// js/auth-paywall.js
// ------------------------------------------------------------
// Phase-3 Auth Paywall (Final, Popup Flow)
// ------------------------------------------------------------

import { auth } from "./config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const provider = new GoogleAuthProvider();

// ------------------------------------------------------------
// CHECK ACCESS
// ------------------------------------------------------------
export function checkAccess() {
  return new Promise(resolve => {
    onAuthStateChanged(auth, user => {
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

// ------------------------------------------------------------
// SHOW / HIDE PAYWALL
// ------------------------------------------------------------
function showPaywall() {
  document.getElementById("paywall").classList.remove("hidden");
}

function hidePaywall() {
  document.getElementById("paywall").classList.add("hidden");
}

// ------------------------------------------------------------
// LOGIN BUTTON HANDLER
// ------------------------------------------------------------
export function registerLoginButton() {
  const btn = document.getElementById("google-login-btn");
  if (!btn) return;

  btn.onclick = async () => {
    try {
      await signInWithPopup(auth, provider);
      hidePaywall();
    } catch (e) {
      console.error("Google Sign-In Failed:", e);
    }
  };
}
