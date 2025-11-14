// js/auth-paywall.js
// -------------------------------------------------------------
// Phase-3 Google Auth (Modular Firebase v11) — REDIRECT VERSION
// 100% working on GitHub Pages + Vercel
// -------------------------------------------------------------

import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import { getInitializedClients } from "./config.js";

// -------------------------------------------------------------
// Elements
// -------------------------------------------------------------
const googleBtn = document.getElementById("google-signin-btn");
const logoutBtn = document.getElementById("logout-nav-btn");
const paywall = document.getElementById("paywall-screen");
const quizContent = document.getElementById("quiz-content");
const welcomeUser = document.getElementById("welcome-user");

// -------------------------------------------------------------
// Initialize Provider
// -------------------------------------------------------------
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// -------------------------------------------------------------
// Google Sign-in (REDIRECT)
// -------------------------------------------------------------
googleBtn.onclick = () => {
  const { auth } = getInitializedClients();
  console.log("[AUTH] Redirecting to Google Login…");
  signInWithRedirect(auth, provider);
};

// -------------------------------------------------------------
// Handle Redirect Result
// -------------------------------------------------------------
(async () => {
  const { auth } = getInitializedClients();

  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      console.log("[AUTH] Redirect Login Success:", result.user.email);
    }
  } catch (err) {
    console.error("[AUTH] Redirect Error:", err);
  }
})();

// -------------------------------------------------------------
// Logout Handler
// -------------------------------------------------------------
logoutBtn.onclick = async () => {
  const { auth } = getInitializedClients();
  await signOut(auth);
  location.reload();
};

// -------------------------------------------------------------
// Auth State Listener
// -------------------------------------------------------------
export function initAuthListener() {
  const { auth } = getInitializedClients();

  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log("[AUTH] Signed In:", user.email);

      welcomeUser.innerText = "Hi, " + (user.displayName || "Student");
      welcomeUser.classList.remove("hidden");

      logoutBtn.classList.remove("hidden");
      paywall.style.display = "none";
      quizContent.style.display = "flex";

      // Notify quiz-engine.js
      document.dispatchEvent(new CustomEvent("r4e-auth-ready"));

    } else {
      console.log("[AUTH] Signed Out");

      welcomeUser.classList.add("hidden");
      logoutBtn.classList.add("hidden");

      paywall.style.display = "flex";
      quizContent.style.display = "none";
    }
  });
}

// Auto-start listener
initAuthListener();
