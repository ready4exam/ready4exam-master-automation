// js/auth-paywall.js
// -------------------------------------------------------------
// Firebase-only Google Login using signInWithRedirect (SAFE for
// GitHub Pages / COOP blocks). Works with your paywall + quiz.
// -------------------------------------------------------------

import { initializeServices, getInitializedClients } from "./config.js";
import { showView, showAuthLoading, hideAuthLoading } from "./ui-renderer.js";

// Firebase Auth
import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
  signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const LOG = "[AUTH]";

let externalOnAuthChange = null;

// Google provider (force account chooser)
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// -------------------------------------------------------------
// Initialize Auth listener
// -------------------------------------------------------------
export async function initializeAuthListener(callback = null) {
  await initializeServices();
  const { auth } = getInitializedClients();

  if (callback) externalOnAuthChange = callback;

  await setPersistence(auth, browserLocalPersistence);

  // Handle redirect result (user returning after Google login)
  getRedirectResult(auth).then((result) => {
    if (result?.user) {
      console.log(LOG, "Redirect login successful:", result.user.uid);
    }
  }).catch(err => console.error(LOG, "Redirect ERROR:", err));

  // Main auth listener
  onAuthStateChanged(auth, (user) => {
    console.log(LOG, "State →", user ? user.uid : "signed out");

    if (user) {
      hideAuthLoading();
      showView("quiz-content");
    } else {
      showView("paywall-screen");
    }

    if (typeof externalOnAuthChange === "function") {
      externalOnAuthChange(user);
    }
  });

  console.log(LOG, "Auth listener initialized.");
}

// -------------------------------------------------------------
// Sign in with Google (REDIRECT flow)
// -------------------------------------------------------------
export async function signInWithGoogle() {
  await initializeServices();
  const { auth } = getInitializedClients();

  showAuthLoading("Opening Google Login...");

  try {
    await signInWithRedirect(auth, provider);
  } catch (err) {
    console.error(LOG, "Redirect error:", err);
    hideAuthLoading();
  }
}

// -------------------------------------------------------------
// Sign out
// -------------------------------------------------------------
export async function signOut() {
  await initializeServices();
  const { auth } = getInitializedClients();
  return firebaseSignOut(auth);
}
