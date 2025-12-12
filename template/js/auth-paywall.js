// js/auth-paywall.js
// -------------------------------------------------------
// Firebase Login Paywall (Minimal-Patch Version)
// - Pure DOM-based hide/show
// - No dependency on ui-renderer
// - Compatible with Option A quiz-engine
// - Added: ensureUserInFirestore (safe, non-destructive)
// -------------------------------------------------------

import {
  initializeServices,
  getInitializedClients
} from "./config.js";

import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Firestore imports (modular)
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const LOG = "[AUTH]";
let externalCallback = null;

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

/* ---------- Admin emails (keep synchronized with admin panel) ---------- */
const ADMIN_EMAILS = ["keshav.karn@gmail.com", "ready4urexam@gmail.com"];
const USERS_COLLECTION = "users";

/* ---------- Minimal safe logger ---------- */
function log(...args) {
  console.log(LOG, ...args);
}
function warn(...args) {
  console.warn(LOG, ...args);
}
function error(...args) {
  console.error(LOG, ...args);
}

// -------------------------------------------------------
// PURE DOM HELPERS
// -------------------------------------------------------
function findPaywall() {
  return (
    document.querySelector("#paywall-screen") ||
    document.querySelector("#auth-container") ||
    document.querySelector("#signin-card") ||
    document.querySelector(".auth-box") ||
    document.querySelector("#paywall") ||
    document.querySelector(".paywall")
  );
}

function findLoading() {
  return (
    document.querySelector("#auth-loading") ||
    document.querySelector(".auth-loading")
  );
}

function hidePaywall() {
  const pw = findPaywall();
  if (pw) pw.style.display = "none";
}

function showPaywall() {
  const pw = findPaywall();
  if (pw) pw.style.display = "block";
}

function showAuthLoading(msg = "Loading…") {
  const el = findLoading();
  if (el) {
    el.textContent = msg;
    el.style.display = "block";
  }
}

function hideAuthLoading() {
  const el = findLoading();
  if (el) el.style.display = "none";
}

// -------------------------------------------------------
// Firestore helper: ensureUserInFirestore(user)
// - non-destructive: does not overwrite existing paidClasses/streams
// - sets signupDate only when creating
// - sets role to 'admin' if email in ADMIN_EMAILS
// - returns the created/merged user doc data or null on failure
// -------------------------------------------------------
export async function ensureUserInFirestore(user) {
  if (!user || !user.uid) {
    warn("ensureUserInFirestore called with invalid user");
    return null;
  }

  try {
    // Use initialized clients if available (config.js may initialize app)
    // but here we call getFirestore to get the Firestore instance
    // NOTE: initializeServices() should have been called earlier by initializeAuthListener
    const db = getFirestore();

    const userRef = doc(db, `${USERS_COLLECTION}/${user.uid}`);

    // Use transaction to create-or-merge safely
    const txResult = await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);

      if (!snap.exists()) {
        // create with safe defaults
        const initial = {
          uid: user.uid,
          email: user.email || null,
          displayName: user.displayName || null,
          paidClasses: [],
          streams: [],
          role: ADMIN_EMAILS.includes((user.email || "").toLowerCase()) ? "admin" : "student",
          signupDate: serverTimestamp()
        };
        tx.set(userRef, initial, { merge: true });
        return { created: true, data: initial };
      } else {
        // merge-only: ensure fields exist and do not clobber arrays if present
        const data = snap.data();
        const updates = {};
        let changed = false;

        // Ensure paidClasses is an array
        if (!Array.isArray(data.paidClasses)) {
          updates.paidClasses = Array.isArray(data.paidClasses) ? data.paidClasses : [];
          changed = true;
        }

        // Ensure streams is an array
        if (!Array.isArray(data.streams)) {
          updates.streams = Array.isArray(data.streams) ? data.streams : [];
          changed = true;
        }

        // Ensure role exists and upgrade if email in admin list
        const emailLower = (user.email || "").toLowerCase();
        if (!data.role || typeof data.role !== "string") {
          updates.role = ADMIN_EMAILS.includes(emailLower) ? "admin" : "student";
          changed = true;
        } else if (ADMIN_EMAILS.includes(emailLower) && data.role !== "admin") {
          updates.role = "admin";
          changed = true;
        }

        // Keep email and displayName up-to-date (non-destructive)
        if (user.email && data.email !== user.email) {
          updates.email = user.email;
          changed = true;
        }
        if (user.displayName && data.displayName !== user.displayName) {
          updates.displayName = user.displayName;
          changed = true;
        }

        if (changed) {
          tx.set(userRef, updates, { merge: true });
        }

        return { created: false, data: Object.assign({}, data, updates) };
      }
    });

    // txResult.data is a serializable object; return it
    window.authPaywall = window.authPaywall || {};
    window.authPaywall.lastEnsuredUser = txResult.data || null;
    return txResult.data || null;
  } catch (e) {
    // Important: do not allow Firestore errors to break the auth/paywall flow.
    error("ensureUserInFirestore error:", e);
    return null;
  }
}

// Expose on global helper for other modules or debugging
window.authPaywall = window.authPaywall || {};
window.authPaywall.ensureUserInFirestore = ensureUserInFirestore;

// -------------------------------------------------------
// AUTH LISTENER INITIALIZATION
// -------------------------------------------------------
export async function initializeAuthListener(callback = null) {
  await initializeServices();
  const { auth } = getInitializedClients();

  // ⭐ Expose Firebase Auth globally — required for header username display
  window.auth = auth;

  if (callback) externalCallback = callback;

  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (e) {
    console.warn(LOG, "Persistence failed → Continuing without it", e);
  }

  onAuthStateChanged(auth, async (user) => {
    console.log(LOG, "Auth state →", user ? user.email : "Signed OUT");

    if (user) {
      // Attempt to ensure Firestore user doc exists — do not block or break paywall if this fails.
      try {
        await ensureUserInFirestore(user);
      } catch (e) {
        // already logged inside ensureUserInFirestore; continue
      }

      hidePaywall();
      hideAuthLoading();

      if (externalCallback) {
        try { externalCallback(user); } catch (e) { console.warn(LOG, "external callback error", e); }
      }

      return;
    }

    showPaywall();
    showAuthLoading("Please sign in to continue");

    if (externalCallback) {
      try { externalCallback(null); } catch (e) { console.warn(LOG, "external callback error", e); }
    }
  });

  console.log(LOG, "Auth listener initialized.");
}

// -------------------------------------------------------
// SIGN-IN WITH GOOGLE POPUP
// -------------------------------------------------------
export async function signInWithGoogle() {
  await initializeServices();
  const { auth } = getInitializedClients();

  showAuthLoading("Opening Google Login…");

  try {
    const result = await signInWithPopup(auth, provider);

    // Best-effort: ensure user doc exists after sign-in. Do not throw on failure.
    try {
      if (result && result.user) {
        await ensureUserInFirestore(result.user);
      }
    } catch (e) {
      // swallow - already logged in ensureUserInFirestore
      console.warn(LOG, "ensureUserInFirestore after signInWithPopup failed", e);
    }

    hideAuthLoading();
    hidePaywall();

    return result.user;
  } catch (err) {
    console.error(LOG, "Google popup error:", err);
    hideAuthLoading();
    return null;
  }
}

// -------------------------------------------------------
// SIGN OUT
// -------------------------------------------------------
export async function signOut() {
  await initializeServices();
  const { auth } = getInitializedClients();

  showPaywall();
  showAuthLoading("Signing out…");

  return firebaseSignOut(auth);
}

// -------------------------------------------------------
// FIX: CHECK ACCESS (Required by 9th quiz-engine.js)
// -------------------------------------------------------
export function checkAccess() {
  try {
    const { auth } = getInitializedClients();
    return !!auth.currentUser; // TRUE if logged in
  } catch {
    return false;
  }
}
