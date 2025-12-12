// ------------------------------------------------------------
// Ready4Exam — FINAL ADMIN PANEL SCRIPT (MATCHED WITH RULES)
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

// ------------------------------------------------------------
// FIREBASE CONFIG (FINAL)
// ------------------------------------------------------------
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
// ADMIN EMAILS (SYNCED WITH FIRESTORE RULES)
// ------------------------------------------------------------
const ADMIN_EMAILS = [
  "keshav.karn@gmail.com",
  "ready4urexam@gmail.com"
];

function isAdmin(user) {
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
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
// LOGIN WITH POPUP
// ------------------------------------------------------------
const provider = new GoogleAuthProvider();

googleLoginBtn.onclick = async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error("Login failed:", e);
    loginError.textContent = "Login failed.";
  }
};

// ------------------------------------------------------------
// LOGOUT
// ------------------------------------------------------------
logoutBtn.onclick = () => signOut(auth);

// ------------------------------------------------------------
// AUTH STATE LISTENER
// ------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    loginScreen.style.display = "block";
    adminDashboard.style.display = "none";
    logoutBtn.style.display = "none";
    return;
  }

  if (!isAdmin(user)) {
    loginError.textContent = "You are not an admin.";
    loginScreen.style.display = "block";
    adminDashboard.style.display = "none";
    logoutBtn.style.display = "none";
    return;
  }

  loginScreen.style.display = "none";
  adminDashboard.style.display = "block";
  logoutBtn.style.display = "block";

  loadUsers();
});

// ------------------------------------------------------------
// LOAD USERS
// ------------------------------------------------------------
async function loadUsers() {
  userList.innerHTML = "";
  const snap = await getDocs(collection(db, "users"));

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const uid = docSnap.id;

    const card = document.createElement("div");
    card.className = "userCard";

    card.innerHTML = `
      <div>
        <strong>${data.email || "(no email)"}</strong><br>
        Paid Classes: ${JSON.stringify(data.paidClasses)}<br>
        Streams: ${JSON.stringify(data.streams)}
      </div>
      <button class="toggleBtn">Toggle Class 12</button>
    `;

    card.querySelector(".toggleBtn").onclick = () =>
      togglePaid(uid, data);

    userList.appendChild(card);
  });
}

// ------------------------------------------------------------
// TOGGLE PAID CLASS (Example Class: 12)
// ------------------------------------------------------------
async function togglePaid(uid, data) {
  const updatedValue = !data.paidClasses["12"];

  await updateDoc(doc(db, "users", uid), {
    paidClasses: {
      ...data.paidClasses,
      12: updatedValue
    }
  });

  alert("Updated!");
  loadUsers();
}
