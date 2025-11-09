// auth-paywall.js
// -----------------------------------------------------------------------------
// Handles sign-in/out and authentication state
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

function getAuthInstance() {
  if (!authInstance) {
    const { auth } = getInitializedClients();
    authInstance = auth;
  }
  return authInstance;
}

function internalAuthChangeHandler(user) {
  console.log(LOG, "Auth state changed →", user ? user.uid : "Signed Out");
  if (typeof externalOnAuthChange === "function") externalOnAuthChange(user);
}

export async function initializeAuthListener(onAuthChangeCallback = null) {
  const auth = getAuthInstance();
  await setPersistence(auth, browserLocalPersistence);
  try {
    const redirectResult = await firebaseGetRedirectResult(auth);
    if (redirectResult?.user) console.log(LOG, "Restored user:", redirectResult.user.uid);
  } catch (err) {
    console.warn(LOG, "Redirect restore error:", err.message);
  }
  if (onAuthChangeCallback) externalOnAuthChange = onAuthChangeCallback;
  onAuthStateChanged(auth, internalAuthChangeHandler);
  console.log(LOG, "Auth listener initialized.");
}

export async function signInWithGoogle() {
  const auth = getAuthInstance();
  if (isSigningIn) return;
  isSigningIn = true;
  try {
    UI.showAuthLoading("Opening Google Sign-In...");
    const result = await signInWithPopup(auth, googleProvider);
    console.log(LOG, "Popup sign-in success:", result.user?.uid);
    UI.hideAuthLoading();
    return result;
  } catch (popupError) {
    const fallbackCodes = ["auth/popup-blocked", "auth/cancelled-popup-request", "auth/web-storage-unsupported"];
    if (fallbackCodes.includes(popupError.code)) {
      console.warn(LOG, "Popup blocked → fallback to redirect.");
      await signInWithRedirect(auth, googleProvider);
    } else {
      console.error(LOG, "Popup error:", popupError);
      UI.hideAuthLoading();
      throw popupError;
    }
  } finally {
    isSigningIn = false;
  }
}

export async function signOut() {
  const auth = getAuthInstance();
  await firebaseSignOut(auth);
  console.log(LOG, "User signed out.");
}

export function checkAccess() {
  try {
    return !!getAuthInstance().currentUser;
  } catch {
    return false;
  }
}
