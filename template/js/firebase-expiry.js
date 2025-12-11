// firebase-expiry.js
// Client-side helper for Ready4Exam expiry checks and popup
// Requires firebase/app, firebase/auth, firebase/firestore (v9 modular SDK)

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

/*
  Your Firebase config
*/
const firebaseConfig = {
  apiKey:"AIzaSyAXdKiYRxBKAj280YcNuNwlKKDp85xpOWQ",
  authDomain:"quiz-signon.firebaseapp.com",
  projectId:"quiz-signon",
  storageBucket:"quiz-signon.appspot.com",
  messagingSenderId:"863414222321",
  appId:"1:863414222321:web:819f5564825308bcd9d850",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/**
 * Parse ISO signup date and compute if expiry has passed.
 */
export function isSignupExpired(signupIso, daysAllowed = 15) {
  if (!signupIso) return true;
  const signed = new Date(signupIso);
  if (Number.isNaN(signed.getTime())) return true;
  const expiryMs = signed.getTime() + daysAllowed * 24 * 60 * 60 * 1000;
  return Date.now() >= expiryMs;
}

/**
 * Fetch user's Firestore doc client-side.
 */
export async function fetchLocalUserDoc(uid) {
  if (!uid) return { signupDate: null, isPaid: null };
  try {
    const dref = doc(db, "users", uid);
    const snap = await getDoc(dref);
    if (!snap.exists()) return { signupDate: null, isPaid: null };

    const data = snap.data();
    return { signupDate: data.signupDate ?? null, isPaid: data.isPaid ?? null };
  } catch (err) {
    console.error("fetchLocalUserDoc error", err);
    return { signupDate: null, isPaid: null };
  }
}

/**
 * Popup UI for expired trial
 */
export function showExpiredPopup(message = "Your 15-day trial has expired. Please make a payment to continue.") {
  if (document.getElementById("r4e-expired-modal")) return;

  const div = document.createElement("div");
  div.id = "r4e-expired-modal";
  div.style = `
    position: fixed; inset: 0; display:flex; align-items:center; justify-content:center;
    background: rgba(0,0,0,0.5); z-index: 9999;
  `;

  div.innerHTML = `
    <div style="background:white; padding:24px; border-radius:10px; max-width:420px; text-align:center;">
      <h3>Your 15-day trial has expired</h3>
      <p style="margin-top:8px;">${message}</p>
      <div style="margin-top:16px;">
        <button id="r4e-expired-pay" style="padding:8px 12px; margin-right:8px;">Make payment</button>
        <button id="r4e-expired-close" style="padding:8px 12px;">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(div);

  document.getElementById("r4e-expired-close").onclick = () => div.remove();
  document.getElementById("r4e-expired-pay").onclick = () => {
    window.location.href = "/payment.html"; // Replace if needed
  };
}

/**
 * Check access via server API (authoritative)
 */
export async function checkAccessServer() {
  try {
    const user = auth.currentUser;
    if (!user) return { allowed: false, reason: "not-signed-in" };

    const idToken = await user.getIdToken();

    const res = await fetch("/api/checkAccess", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Accept": "application/json",
      }
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({ message: "blocked" }));
      return { allowed: false, reason: payload.message ?? "blocked" };
    }

    return { allowed: true, payload: await res.json() };

  } catch (err) {
    console.error("checkAccessServer error", err);
    return { allowed: false, reason: "network-or-auth-error" };
  }
}

/**
 * Combined check used on Start Quiz click
 */
export async function checkAndStartQuiz(startQuizCallback) {
  const user = auth.currentUser;
  if (!user) {
    alert("Please sign in to start the quiz.");
    return;
  }

  // Local quick UX check
  const local = await fetchLocalUserDoc(user.uid);

  if (local.isPaid !== true) {
    if (local.signupDate && isSignupExpired(local.signupDate)) {
      showExpiredPopup();
      return;
    }
  }

  // Authoritative server check
  const server = await checkAccessServer();
  if (server.allowed) {
    startQuizCallback();
  } else {
    showExpiredPopup(
      server.reason ? `Reason: ${server.reason}` : undefined
    );
  }
}

/**
 * Ensure Firestore user doc exists (optional)
 */
export async function ensureUserDocExists() {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const dref = doc(db, "users", user.uid);
    const snap = await getDoc(dref);

    if (!snap.exists()) {
      await setDoc(dref, {
        signupDate: new Date().toISOString(),
        isPaid: false,
      });
    }
  } catch (err) {
    console.error("ensureUserDocExists error", err);
  }
}

export { auth, db };
