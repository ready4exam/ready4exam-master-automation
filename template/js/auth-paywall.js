// js/auth-paywall.js
// -----------------------------------------------------------------------------
// Handles sign-in/out and authentication state (Diagnostic version)
// -----------------------------------------------------------------------------

import { getInitializedClients } from "./config.js";
import {
  GoogleAuthProvider,
  getRedirectResult as firebaseGetRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import * as UI from "./ui-renderer.js";

const LOG = "[AUTH-PAYWALL]";
let authInstance = null;
let externalOnAuthChange = null;
let isSigningIn = false;

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

/* -----------------------------------
   Get Auth Instance
----------------------------------- */
function getAuthInstance() {
  if (!authInstance) {
    try {
      const { auth } = getInitializedClients();
      if (!auth) throw new Error("Auth not initialized");
      authInstance = auth;
    } catch (err) {
      console.error(`${LOG} getAuthInstance() failed:`, err);
      alert("⚠️ Firebase not initialized. Please refresh the page.");
    }
  }
  return authInstance;
}

/* -----------------------------------
   Internal Auth State Handler
----------------------------------- */
function internalAuthChangeHandler(user) {
  console.log(`${LOG} Auth state changed →`, user ? user.uid : "Signed Out");
  if (typeof externalOnAuthChange === "function") {
    externalOnAuthChange(user);
  }
}

/* -----------------------------------
   Initialize Listener
----------------------------------- */
export async function initializeAuthListener(onAuthChangeCallback = null) {
  console.log(`${LOG} Initializing auth listener...`);
  const auth = getAuthInstance();
  if (!auth) {
    console.error(`${LOG} Auth unavailable.`);
    return;
  }

  await setPersistence(auth, browserLocalPersistence);

  try {
    const redirectResult = await firebaseGetRedirectResult(auth);
    if (redirectResult?.user) {
      console.log(`${LOG} Restored user after redirect:`, redirectResult.user.uid);
    }
  } catch (err) {
    console.warn(`${LOG} Redirect restore error:`, err.message);
  }

  if (onAuthChangeCallback) externalOnAuthChange = onAuthChangeCallback;
  onAuthStateChanged(auth, internalAuthChangeHandler);
  console.log(`${LOG} Auth listener initialized.`);
}

/* -----------------------------------
   Google Sign-In (Popup + Redirect Fallback)
----------------------------------- */
export async function signInWithGoogle() {
  console.log(`${LOG} Attempting Google Sign-In...`);
  const auth = getAuthInstance();
  if (!auth) {
    alert("⚠️ Firebase not ready. Please reload the page.");
    return;
  }

  if (isSigningIn) {
    console.warn(`${LOG} Sign-in already in progress.`);
    return;
  }

  isSigningIn = true;
  try {
    UI.showAuthLoading("Opening Google Sign-In...");
    const result = await signInWithPopup(auth, googleProvider);
    console.log(`${LOG} Popup sign-in success:`, result.user?.uid);
    UI.hideAuthLoading();
    alert(`✅ Signed in as ${result.user?.email}`);
    return result;
  } catch (popupError) {
    console.warn(`${LOG} Popup sign-in error:`, popupError.code);
    const fallbackCodes = [
      "auth/popup-blocked",
      "auth/cancelled-popup-request",
      "auth/web-storage-unsupported",
    ];

    if (fallbackCodes.includes(popupError.code)) {
      console.warn(`${LOG} Popup blocked → using redirect sign-in.`);
      UI.hideAuthLoading();
      await signInWithRedirect(auth, googleProvider);
    } else if (popupError.code === "auth/unauthorized-domain") {
      alert("⚠️ Unauthorized domain. Add this site to Firebase Authorized Domains.");
      console.error(`${LOG} Unauthorized domain:`, window.location.origin);
    } else {
      console.error(`${LOG} Google Sign-In failed:`, popupError);
      UI.hideAuthLoading();
      alert(`❌ Sign-in failed: ${popupError.message}`);
    }
  } finally {
    isSigningIn = false;
  }
}

/* -----------------------------------
   Sign Out
----------------------------------- */
export async function signOut() {
  const auth = getAuthInstance();
  if (!auth) {
    alert("⚠️ Firebase not ready.");
    return;
  }

  await firebaseSignOut(auth);
  console.log(`${LOG} User signed out.`);
  alert("👋 You have been signed out.");
}

/* -----------------------------------
   Check Access
----------------------------------- */
export function checkAccess() {
  try {
    return !!getAuthInstance().currentUser;
  } catch (err) {
    console.warn(`${LOG} checkAccess() failed:`, err.message);
    return false;
  }
}
