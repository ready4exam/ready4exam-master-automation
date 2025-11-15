// js/auth-paywall.js
// ------------------------------------------------------------
// Phase-3 AUTH PAYWALL (REDIRECT VERSION — REQUIRED FOR GITHUB PAGES)
// ------------------------------------------------------------

import {
  firebaseAuth,
} from "./config.js";

import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const paywall = document.getElementById("paywall-screen");
const googleBtn = document.getElementById("google-signin-btn");

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// ------------------------------------------------------------
// CHECK ACCESS (consumer for quiz-engine.js)
// ------------------------------------------------------------
export async function checkAccess() {
  return new Promise(resolve => {
    onAuthStateChanged(firebaseAuth, async user => {

      // 1️⃣ Handle redirect callback (user returns from Google)
      try {
        const result = await getRedirectResult(firebaseAuth);
        if (result?.user) {
          // hide paywall and continue
          paywall.classList.add("hidden");
          resolve(true);
          return;
        }
      } catch (e) {
        console.warn("[AUTH] Redirect result error:", e);
      }

      // 2️⃣ If already logged in, allow access
      if (user) {
        paywall.classList.add("hidden");
        resolve(true);
        return;
      }

      // 3️⃣ If NOT logged in, keep paywall visible
      paywall.classList.remove("hidden");
      resolve(false);
    });
  });
}

// ------------------------------------------------------------
// SIGN-IN HANDLER (REDIRECT)
// ------------------------------------------------------------
if (googleBtn) {
  googleBtn.onclick = () => {
    console.log("[AUTH] Triggering Google Redirect Login…");
    signInWithRedirect(firebaseAuth, provider);
  };
}
