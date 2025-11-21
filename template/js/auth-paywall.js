// js/auth-paywall.js
// -------------------------------------------------------
// Firebase-only Login Paywall (final, stable, class-agnostic)
// -------------------------------------------------------

import {
  initializeServices,
  getInitializedClients
} from "./config.js";

import {
  showView,
  showAuthLoading,
  hideAuthLoading
} from "./ui-renderer.js";

import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const LOG = "[AUTH]";
let externalCallback = null;

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// -------------------------------------------------------
// INIT AUTH LISTENER
// -------------------------------------------------------
export async function initializeAuthListener(callback = null) {
  await initializeServices();
  const { auth } = getInitializedClients();

  if (callback) externalCallback = callback;

  await setPersistence(auth, browserLocalPersistence);

  onAuthStateChanged(auth, (user) => {
    console.log(LOG, "Auth state →", user ? user.email : "Signed OUT");

    if (user) {
      showView("quiz-content");       // show quiz area
      hideAuthLoading();
    } else {
      showView("paywall-screen");     // show login screen
    }

    if (externalCallback) externalCallback(user);
  });

  console.log(LOG, "Auth listener initialized.");
}

// -------------------------------------------------------
// SIGN IN (GOOGLE POPUP)
// -------------------------------------------------------
export async function signInWithGoogle() {
  await initializeServices();
  const { auth } = getInitializedClients();

  showAuthLoading("Opening Google Login…");

  try {
    const result = await signInWithPopup(auth, provider);
    hideAuthLoading();
    return result.user;
  } catch (err) {
    console.error(LOG, "Google popup error:", err);
    hideAuthLoading();
  }
}

// -------------------------------------------------------
// SIGN OUT
// -------------------------------------------------------
export async function signOut() {
  await initializeServices();
  const { auth } = getInitializedClients();
  return firebaseSignOut(auth);
}
