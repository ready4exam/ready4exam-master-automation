// ------------------------------------------------------------
// Ready4Exam — FINAL ADMIN PANEL SCRIPT
// ------------------------------------------------------------

// ------------------------------------------------------------
// Firebase Initialization (YOUR REAL CONFIG)
// ------------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAXdKiYRxBKAj280YcNuNwlKKDp85xpOWQ",
  authDomain: "quiz-signon.firebaseapp.com",
  projectId: "quiz-signon",
  storageBucket: "quiz-signon.appspot.com",
  messagingSenderId: "863414222321",
  appId: "1:863414222321:web:819f5564825308bcd9d850"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ------------------------------------------------------------
// ONLY THESE EMAILS CAN ACCESS ADMIN PANEL
// ------------------------------------------------------------
const ADMIN_EMAILS = [
  "keshav.karn@gmail.com",
  "ready4urexam@gmail.com"
];

function isAdmin(user) {
  if (!user) return false;
  const email = user.email.toLowerCase().trim();
  return ADMIN_EMAILS.map(e => e.toLowerCase().trim()).includes(email);
}

// ------------------------------------------------------------
// UI ELEMENTS
// ------------------------------------------------------------
const loginScreen = document.getElementById("loginScreen");
const adminDashboard = document.getElementById("adminDashboard");
const loginError = document.getElementById("loginError");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userList = document.getElementById("userList");

// ------------------------------------------------------------
// Google Login
// ------------------------------------------------------------
const provider = new GoogleAuthProvider();

googleLoginBtn.onclick = async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error("Login failed:", err);
    loginError.textContent = "Login failed.";
  }
};

// ------------------------------------------------------------
// Logout
// ------------------------------------------------------------
logoutBtn.onclick = () => signOut(auth);

// ------------------------------------------------------------
// AUTH STATE LISTENER
// ------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Not logged in
    loginScreen.style.display = "block";
    adminDashboard.style.display = "none";
    logoutBtn.style.display = "none";
    loginError.textContent = "";
    return;
  }

  // Admin validation
  if (!isAdmin(user)) {
    loginError.textContent = "You are not an admin.";
    loginScreen.style.display = "block";
    adminDashboard.style.display = "none";
    logoutBtn.style.display = "none";
    return;
  }

  // Admin authenticated
  loginScreen.style.display = "none";
  adminDashboard.style.display = "block";
  logoutBtn.style.display = "block";

  loadUsers();
});

// ------------------------------------------------------------
// LOAD USERS FROM FIRESTORE
// ------------------------------------------------------------
async function loadUsers() {
  const snap = await getDocs(collection(db, "users"));
  userList.innerHTML = "";

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const uid = docSnap.id;

    const div = document.createElement("div");
    div.className = "userCard";

    div.innerHTML = `
      <div>
        <strong>${data.email || "(no email)"}</strong><br>
        Paid Classes: ${JSON.stringify(data.paidClasses)}<br>
        Streams: ${JSON.stringify(data.streams)}
      </div>
      <button class="toggleBtn">Toggle Paid (Class 12)</button>
    `;

    div.querySelector(".toggleBtn").onclick = () =>
      togglePaid(uid, data);

    userList.appendChild(div);
  });
}

// ------------------------------------------------------------
// TOGGLE PAID CLASS ACCESS (EXAMPLE: CLASS 12)
// ------------------------------------------------------------
async function togglePaid(uid, data) {
  const newState = !data.paidClasses?.["12"];

  const ref = doc(db, "users", uid);
  await updateDoc(ref, {
    paidClasses: {
      ...data.paidClasses,
      12: newState
    }
  });

  alert("Updated!");
  loadUsers();
}
