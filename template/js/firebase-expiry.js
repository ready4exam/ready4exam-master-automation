// firebase-expiry.js
// ------------------------------------------------------
// GLOBAL ACCESS CONTROL for Ready4Exam
// - 15 day trial for students
// - paidClasses unlock classes 6–12
// - streams unlock science / commerce / arts
// - schools bypass trial but follow streams
// ------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
  getAuth
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// ------------------------------------------------------
// FIREBASE CONFIG — AUTO AVAILABLE VIA window.__firebase_config
// ------------------------------------------------------
const app = initializeApp(window.__firebase_config);
const db = getFirestore(app);
const auth = getAuth(app);

// ------------------------------------------------------
// UTIL: Check if trial expired
// ------------------------------------------------------
export function isSignupExpired(signupIso, daysAllowed = 15) {
  if (!signupIso) return true;
  const signed = new Date(signupIso);
  if (Number.isNaN(signed.getTime())) return true;
  const expiry = signed.getTime() + daysAllowed * 24 * 60 * 60 * 1000;
  return Date.now() >= expiry;
}

// ------------------------------------------------------
// AUTO-CREATE USER DOC (SAFE, NON-DISRUPTIVE)
// ------------------------------------------------------
export async function ensureUserDocExists() {
  const user = auth.currentUser;
  if (!user) return;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  // already exists → ensure mandatory fields exist
  if (snap.exists()) {
    const data = snap.data();
    const patch = {};

    if (!data.signupDate) patch.signupDate = new Date().toISOString();

    if (!data.paidClasses) {
      patch.paidClasses = {
        "6": false, "7": false, "8": false,
        "9": false, "10": false, "11": false, "12": false
      };
    }

    if (!data.streams) {
      patch.streams = {
        science: false,
        commerce: false,
        arts: false
      };
    }

    if (!data.role) patch.role = "student";

    if (Object.keys(patch).length > 0) {
      await updateDoc(ref, patch);
    }
    return;
  }

  // create new doc
  await setDoc(ref, {
    signupDate: new Date().toISOString(),
    role: "student",               // default until admin changes
    paidClasses: {
      "6": false, "7": false, "8": false,
      "9": false, "10": false, "11": false, "12": false
    },
    streams: {
      science: false,
      commerce: false,
      arts: false
    }
  });
}

// ------------------------------------------------------
// POPUP SHOWN WHEN ACCESS IS BLOCKED
// ------------------------------------------------------
export function showExpiredPopup(message = "Your access to this class/stream is restricted.") {
  if (document.getElementById("r4e-expired-modal")) return;

  const wrap = document.createElement("div");
  wrap.id = "r4e-expired-modal";
  wrap.style =
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);z-index:99999;";

  wrap.innerHTML = `
    <div style="background:white;padding:28px;border-radius:12px;max-width:420px;text-align:center;">
      <h2 style="font-size:20px;font-weight:bold;margin-bottom:10px;">Access Restricted</h2>
      <p style="font-size:15px;color:#444;">${message}</p>
      <button id="r4e-expired-close"
        style="margin-top:18px;background:#1a3e6a;color:white;padding:10px 18px;border-radius:8px;">
        Close
      </button>
    </div>
  `;
  document.body.appendChild(wrap);

  document.getElementById("r4e-expired-close").onclick = () => wrap.remove();
}

// ------------------------------------------------------
// MASTER CHECK — class + stream + trial + role
// ------------------------------------------------------
export async function checkClassAccess(classId, stream) {
  const user = auth.currentUser;
  if (!user) return { allowed: false, reason: "not-signed-in" };

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { allowed: false, reason: "user-doc-missing" };

  const data = snap.data();

  // SCHOOL ROLE BYPASS TRIAL (only restricted by streams)
  if (data.role === "school") {
    if (data.streams?.[stream] === true) {
      return { allowed: true };
    } else {
      return { allowed: false, reason: `This school does not have access to ${stream} stream.` };
    }
  }

  // STUDENT FLOW ---------------------------------------

  // 1. TRIAL EXPIRED?
  if (isSignupExpired(data.signupDate)) {
    // Allow ONLY paidClasses
    if (data.paidClasses?.[classId] === true) {
      // Still check stream
      if (data.streams?.[stream] === true) {
        return { allowed: true };
      } else {
        return { allowed: false, reason: `Stream (${stream}) not purchased.` };
      }
    }
    return { allowed: false, reason: "Trial expired. Please purchase access." };
  }

  // 2. STREAM NOT PURCHASED?
  if (data.streams?.[stream] !== true) {
    return { allowed: false, reason: `Stream (${stream}) not purchased.` };
  }

  // 3. CLASS NOT PURCHASED (during trial this is allowed)
  // After trial ends, paidClasses decides; during trial, free for 15 days.
  return { allowed: true };
}

// ------------------------------------------------------
// Combined handler for chapter-selection.html
// ------------------------------------------------------
export async function checkAndStartQuiz(startQuizCallback, classId, stream) {
  const user = auth.currentUser;
  if (!user) {
    alert("Please sign in.");
    return;
  }

  const result = await checkClassAccess(classId, stream);

  if (result.allowed) {
    startQuizCallback();
    return;
  }

  showExpiredPopup(result.reason || "Access blocked.");
}

// ------------------------------------------------------
export { auth, db };
