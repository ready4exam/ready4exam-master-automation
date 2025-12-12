// -------------------------------
// Firebase Config
// -------------------------------
import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";

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
  apiKey: "REPLACE",
  authDomain: "REPLACE",
  projectId: "REPLACE",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// -------------------------------
// ADMIN EMAILS
// -------------------------------
const ADMIN_EMAILS = [
  "keshav.karn@gmail.com",
  "ready4urexam@gmail.com"
];

// -------------------------------
// UI Elements
// -------------------------------
const loginScreen = document.getElementById("loginScreen");
const adminDashboard = document.getElementById("adminDashboard");
const loginError = document.getElementById("loginError");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userList = document.getElementById("userList");

// -------------------------------
// Google Login
// -------------------------------
const provider = new GoogleAuthProvider();

googleLoginBtn.onclick = async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    loginError.textContent = "Login failed.";
  }
};

// -------------------------------
// Logout
// -------------------------------
logoutBtn.onclick = () => signOut(auth);

// -------------------------------
// AUTH STATE LISTENER
// -------------------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    loginScreen.style.display = "block";
    adminDashboard.style.display = "none";
    logoutBtn.style.display = "none";
    loginError.textContent = "";
    return;
  }

  // Admin check
  if (!ADMIN_EMAILS.includes(user.email)) {
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

// -------------------------------
// LOAD USERS FROM FIRESTORE
// -------------------------------
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
        Class Access: ${JSON.stringify(data.paidClasses)}<br>
        Stream: ${JSON.stringify(data.streams)}
      </div>
      <button class="toggleBtn">Toggle Paid</button>
    `;

    div.querySelector(".toggleBtn").onclick = () =>
      togglePaid(uid, data);

    userList.appendChild(div);
  });
}

// -------------------------------
// TOGGLE PAID STATUS
// -------------------------------
async function togglePaid(uid, data) {
  const newState = !data.paidClasses["12"]; // Example toggle: class 12

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
