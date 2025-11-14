// js/auth-paywall.js
// ------------------------------------------------------------
// Phase-3 Auth + Paywall Handler (Compatible with quiz-engine.html)
// ------------------------------------------------------------

import {
  getInitializedClients,
  getAuthUser,
  setAuthUser,
  logAnalyticsEvent
} from "./config.js";

// DOM ELEMENTS (match EXACT IDs in quiz-engine.html)
const paywallScreen = document.getElementById("paywall-screen");
const quizContent = document.getElementById("quiz-content");
const googleBtn = document.getElementById("google-signin-btn");
const logoutBtn = document.getElementById("logout-nav-btn");
const welcomeUser = document.getElementById("welcome-user");

// ------------------------------------------------------------
// UPDATE UI BASED ON AUTH STATE
// ------------------------------------------------------------
function updateUI(user) {
  if (!user) {
    // NOT SIGNED IN → Show Paywall
    paywallScreen.classList.remove("hidden");
    quizContent.classList.add("hidden");

    if (welcomeUser) welcomeUser.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
    return;
  }

  // SIGNED IN → Hide Paywall, Show Quiz
  paywallScreen.classList.add("hidden");
  quizContent.classList.remove("hidden");

  if (welcomeUser) {
    welcomeUser.textContent = `Welcome, ${user.email}`;
    welcomeUser.classList.remove("hidden");
  }

  if (logoutBtn) logoutBtn.classList.remove("hidden");
}

// ------------------------------------------------------------
// SIGN-IN WITH GOOGLE
// ------------------------------------------------------------
async function doGoogleLogin() {
  try {
    const { auth, provider } = getInitializedClients();
    const res = await auth.signInWithPopup(provider);

    const user = res.user;
    setAuthUser(user);
    logAnalyticsEvent("login_success", { email: user.email });

    console.log("[AUTH] Signed In:", user.email);

    updateUI(user);
  } catch (err) {
    console.error("Google login failed:", err);
    alert("Login failed. Please try again.");
  }
}

// ------------------------------------------------------------
// LOG OUT
// ------------------------------------------------------------
async function doLogout() {
  try {
    const { auth } = getInitializedClients();
    await auth.signOut();

    console.log("[AUTH] User signed out.");

    updateUI(null);
  } catch (err) {
    console.error("Logout failed:", err);
  }
}

// ------------------------------------------------------------
// AUTH STATE LISTENER
// ------------------------------------------------------------
function attachAuthListener() {
  const { auth } = getInitializedClients();

  auth.onAuthStateChanged((user) => {
    if (user) {
      setAuthUser(user);
      console.log("[AUTH] Logged in →", user.email);
      updateUI(user);
    } else {
      console.log("[AUTH] Logged out");
      updateUI(null);
    }
  });
}

// ------------------------------------------------------------
// SAFE EVENT BINDING (Avoid null errors)
// ------------------------------------------------------------
if (googleBtn) {
  googleBtn.onclick = doGoogleLogin;
}

if (logoutBtn) {
  logoutBtn.onclick = doLogout;
}

// ------------------------------------------------------------
// INIT
// ------------------------------------------------------------
attachAuthListener();

console.log("[AUTH] Paywall system initialized.");
