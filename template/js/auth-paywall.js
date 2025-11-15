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

// Always show Google account selector
provider.setCustomParameters({ prompt: "select_account" });

// ------------------------------------------------------------
// CHECK ACCESS (called by quiz-engine.js)
// ------------------------------------------------------------
export async function checkAccess() {
  return new Promise(resolve => {
    onAuthStateChanged(firebaseAuth, async user => {
      
      // 1️⃣ Handle redirect callback when user returns after login
      try {
        const result = await getRedirectResult(firebaseAuth);
        if (result?.user) {
          console.log("[AUTH] Redirect complete. User logged in:", result.user.email);

          paywall.classList.add("hidden");
          resolve(true);
          return;
        }
      } catch (err) {
        console.warn("[AUTH] Redirect result error:", err);
      }

      // 2️⃣ User already logged in → allow access
      if (user) {
        console.log("[AUTH] User already logged in:", user.email);
        paywall.classList.add("hidden");
        resolve(true);
        return;
      }

      // 3️⃣ No user → keep paywall visible
      console.log("[AUTH] No user. Showing paywall.");
      paywall.classList.remove("hidden");
      resolve(false);
    });
  });
}

// ------------------------------------------------------------
// SIGN-IN BUTTON → Redirect Google Login
// ------------------------------------------------------------
if (googleBtn) {
  googleBtn.onclick = () => {
    console.log("[AUTH] Starting Google Redirect Login…");
    signInWithRedirect(firebaseAuth, provider);
  };
}
