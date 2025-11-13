// js/auth-paywall.js
// -----------------------------------------------------------
// Phase-3 Clean Authentication Handler
// Single Firebase project, no switching.
// Shows paywall → once signed in → loads quiz.
// -----------------------------------------------------------

import { getInitializedClients } from "./config.js";
import * as UI from "./ui-renderer.js";

// -----------------------------------------------------------
// DOM references
// -----------------------------------------------------------
const paywall = document.getElementById("paywall-screen");
const quizContent = document.getElementById("quiz-content");
const googleBtn = document.getElementById("google-signin-btn");
const logoutBtn = document.getElementById("logout-nav-btn");
const welcomeUser = document.getElementById("welcome-user");

// -----------------------------------------------------------
// Google Sign-In
// -----------------------------------------------------------
googleBtn.addEventListener("click", async () => {
  try {
    const { auth } = getInitializedClients();
    if (!auth) return alert("Auth not ready.");

    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);

  } catch (err) {
    console.error("[AUTH] Login failed:", err);
    alert("Failed to sign in. Try again.");
  }
});

// -----------------------------------------------------------
// Logout
// -----------------------------------------------------------
logoutBtn.addEventListener("click", async () => {
  try {
    const { auth } = getInitializedClients();
    await auth.signOut();
    location.reload();
  } catch (e) {
    console.error("[AUTH] Logout failed:", e);
  }
});

// -----------------------------------------------------------
// Auth State Listener
// -----------------------------------------------------------
export function initAuthListener(onSignedIn) {
  const { auth } = getInitializedClients();

  auth.onAuthStateChanged((user) => {
    if (!user) {
      // SHOW PAYWALL
      UI.showView("paywall-screen");
      welcomeUser.style.display = "none";
      logoutBtn.style.display = "none";
      return;
    }

    // LOGGED IN — LET QUIZ ENGINE LOAD QUESTIONS
    welcomeUser.textContent = `Hi, ${user.displayName}`;
    welcomeUser.style.display = "inline";
    logoutBtn.style.display = "inline-block";

    UI.showView("quiz-content");

    if (onSignedIn) onSignedIn(user);
  });
}
