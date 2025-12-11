// firebase-expiry.js
// Global 15-day trial + Class-wise paid access
// Works with your Firebase + Supabase frontend architecture

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

/* Your Firebase Config */
const firebaseConfig = {
  apiKey:"AIzaSyAXdKiYRxBKAj280YcNuNwlKKDp85xpOWQ",
  authDomain:"quiz-signon.firebaseapp.com",
  projectId:"quiz-signon",
  storageBucket:"quiz-signon.appspot.com",
  messagingSenderId:"863414222321",
  appId:"1:863414222321:web:819f5564825308bcd9d850"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

/* ---------- Helpers ---------- */

export function isSignupExpired(signupIso, days = 15) {
  if (!signupIso) return true;
  const start = new Date(signupIso).getTime();
  if (!start) return true;

  const expiry = start + days * 24 * 60 * 60 * 1000;
  return Date.now() >= expiry;
}

export async function fetchUserAccess(uid) {
  if (!uid) return null;

  try {
    const dref = doc(db, "users", uid);
    const snap = await getDoc(dref);

    if (!snap.exists()) return null;

    return snap.data(); // { signupDate, paidClasses }
  } catch (err) {
    console.error("fetchUserAccess error", err);
    return null;
  }
}

/* ---------- Popup UI ---------- */

export function showExpiredPopup() {
  if (document.getElementById("r4e-expired-modal")) return;

  const div = document.createElement("div");
  div.id = "r4e-expired-modal";
  div.style = `
    position:fixed; inset:0; background:rgba(0,0,0,.5);
    display:flex; align-items:center; justify-content:center; z-index:99999;
  `;

  div.innerHTML = `
    <div style="background:white; padding:24px; border-radius:10px; max-width:420px;">
      <h2 style="font-size:20px; font-weight:bold;">Your 15-day trial has expired</h2>
      <p style="margin-top:8px;">Please make a payment to continue.</p>
      <div style="margin-top:16px; text-align:right;">
        <button id="pay-btn" style="padding:8px 14px; background:#2563eb; color:white; border-radius:6px;">
          Make Payment
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(div);

  document.getElementById("pay-btn").onclick = () => {
    window.location.href = "/payment.html";
  };
}

/* ---------- Main Access Check ---------- */
/*
   Global Trial + Class Paid Unlock:
   allow if:
       paidClasses[classId] == true
       OR global trial NOT expired
*/

export async function checkClassAccess(classId) {
  const user = auth.currentUser;
  if (!user) return { allowed: false, reason: "not-signed-in" };

  const data = await fetchUserAccess(user.uid);
  if (!data) return { allowed: false, reason: "no-user-doc" };

  const { signupDate, paidClasses = {} } = data;

  // 1. Class Paid?
  if (paidClasses[classId] === true) {
    return { allowed: true };
  }

  // 2. Trial Active?
  if (!isSignupExpired(signupDate)) {
    return { allowed: true };
  }

  // 3. Block
  return { allowed: false, reason: "trial-expired" };
}

/* ---------- Start Quiz Wrapper ---------- */
export async function checkAndStartQuiz(classId, callback) {
  const result = await checkClassAccess(classId);

  if (result.allowed) {
    callback();  // go to quiz
  } else {
    showExpiredPopup();
  }
}
