// js/auth-paywall.js
// ------------------------------------------------------------
// Phase-3 Auth Handler — No "checkAccess", no roles.
// Pure Google Sign-In gating.
// ------------------------------------------------------------

import { initializeAll, getInitializedClients } from "./config.js";

initializeAll();
const { auth } = getInitializedClients();

// DOM
const paywall = document.getElementById("paywall-screen");
const quizContent = document.getElementById("quiz-content");
const googleBtn = document.getElementById("google-signin-btn");
const logoutBtn = document.getElementById("logout-nav-btn");
const welcomeUser = document.getElementById("welcome-user");

// ------------------------------------------------------------
// GOOGLE SIGN-IN
// ------------------------------------------------------------
googleBtn.onclick = async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (e) {
    alert("Google Sign-In failed.");
  }
};

// ------------------------------------------------------------
// SIGN-OUT
// ------------------------------------------------------------
logoutBtn.onclick = () => auth.signOut();

// ------------------------------------------------------------
// AUTH STATE LISTENER
// ------------------------------------------------------------
auth.onAuthStateChanged((user) => {
  if (!user) {
    paywall.style.display = "flex";
    quizContent.style.display = "none";
    logoutBtn.classList.add("hidden");
    welcomeUser.classList.add("hidden");
    return;
  }

  paywall.style.display = "none";
  logoutBtn.classList.remove("hidden");
  welcomeUser.classList.remove("hidden");
  welcomeUser.textContent = user.email;
});
