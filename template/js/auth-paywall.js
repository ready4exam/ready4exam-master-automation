// js/auth-paywall.js
// Simplified — Firebase-only login. No OIDC. No Supabase token sync.

import { initializeServices, getInitializedClients } from "./config.js";
import { showView, showAuthLoading, hideAuthLoading } from "./ui-renderer.js";

import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const LOG = "[AUTH]";
let externalOnAuthChange = null;
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function initializeAuthListener(callback = null) {
  await initializeServices();
  const { auth } = getInitializedClients();

  if (callback) externalOnAuthChange = callback;
  await setPersistence(auth, browserLocalPersistence);

  onAuthStateChanged(auth, (user) => {
    console.log(LOG, "State →", user ? user.uid : "signed out");

    if (user) {
      showView("quiz-content");
      hideAuthLoading();
    } else {
      showView("paywall-screen");
    }

    if (typeof externalOnAuthChange === "function")
      externalOnAuthChange(user);
  });

  console.log(LOG, "Auth listener initialized.");
}

export async function signInWithGoogle() {
  await initializeServices();
  const { auth } = getInitializedClients();
  showAuthLoading("Opening Google Login...");

  try {
    const res = await signInWithPopup(auth, googleProvider);
    hideAuthLoading();
    return res;
  } catch (e) {
    console.error(LOG, "Popup error:", e);
    hideAuthLoading();
  }
}

export async function signOut() {
  await initializeServices();
  const { auth } = getInitializedClients();
  return firebaseSignOut(auth);
}
