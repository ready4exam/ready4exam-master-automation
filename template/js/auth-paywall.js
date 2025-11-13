// js/auth-paywall.js
// -------------------------------------------------------------
// Phase-3 Google Auth (Modular Firebase v11) — FIXED VERSION
// -------------------------------------------------------------

import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } 
  from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
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
// Google Provider
// -------------------------------------------------------------
const provider = new GoogleAuthProvider();

// -------------------------------------------------------------
// Sign-in Handler
// -------------------------------------------------------------
googleBtn.onclick = async () => {
  try {
    const { auth } = getInitializedClients();

    console.log("[AUTH] Opening Google Popup…");
    await signInWithPopup(auth, provider);

  } catch (err) {
    console.error("[AUTH] Google Sign-in Failed:", err);
    alert("Popup blocked — please allow popups for this site.");
  }
};

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

  auth.onAuthStateChanged((user) => {
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
