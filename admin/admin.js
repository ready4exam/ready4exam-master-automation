// -------------------------------------------------------
// Ready4Exam Admin Panel
// Secure admin-only management of users
// -------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ------------------------------------------------------------
// 🔥 Firebase config (auto-loaded from /js/config.js style)
// ------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyAXdKiYRxBKAj280YcNuNwlKKDp85xpOWQ",
  authDomain: "quiz-signon.firebaseapp.com",
  projectId: "quiz-signon",
  storageBucket: "quiz-signon.appspot.com",
  messagingSenderId: "863414222321",
  appId: "1:863414222321:web:819f5564825308bcd9d850",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ------------------------------------------------------------
// 🔐 Admin emails — ONLY these emails can access dashboard
// ------------------------------------------------------------
const ADMIN_EMAILS = ["youremail@gmail.com", "admin@ready4exam.com"];

// ------------------------------------------------------------
// UI ELEMENTS
// ------------------------------------------------------------
const loginScreen = document.getElementById("loginScreen");
const adminDashboard = document.getElementById("adminDashboard");
const loginError = document.getElementById("loginError");
const userListBox = document.getElementById("userList");

const editPanel = document.getElementById("editPanel");
const ep_email = document.getElementById("ep_email");
const ep_signup = document.getElementById("ep_signup");
const paidClassesBox = document.getElementById("paidClassesBox");
const stream_science = document.getElementById("stream_science");
const stream_commerce = document.getElementById("stream_commerce");
const stream_arts = document.getElementById("stream_arts");
const roleSelect = document.getElementById("roleSelect");

// Buttons
document.getElementById("googleLoginBtn").onclick = loginAdmin;
document.getElementById("logoutBtn").onclick = () => signOut(auth);
document.getElementById("cancelBtn").onclick = () => editPanel.classList.add("hidden");
document.getElementById("saveBtn").onclick = saveUserChanges;

let selectedUID = null;

// ------------------------------------------------------------
// LOGIN FLOW
// ------------------------------------------------------------
async function loginAdmin() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    loginError.textContent = "Login failed";
    loginError.classList.remove("hidden");
  }
}

// ------------------------------------------------------------
// AUTH STATE CHANGE
// ------------------------------------------------------------
onAuthStateChanged(auth, (user) => {
  if (!user) {
    loginScreen.classList.remove("hidden");
    adminDashboard.classList.add("hidden");
    return;
  }

  if (!ADMIN_EMAILS.includes(user.email)) {
    loginError.textContent = "You are not an admin.";
    loginError.classList.remove("hidden");
    signOut(auth);
    return;
  }

  loginScreen.classList.add("hidden");
  adminDashboard.classList.remove("hidden");
  loadUsers();
});

// ------------------------------------------------------------
// LOAD USERS
// ------------------------------------------------------------
async function loadUsers() {
  userListBox.innerHTML = "Loading users…";

  const usersRef = collection(db, "users");
  const snap = await getDocs(usersRef);

  userListBox.innerHTML = "";

  snap.forEach(docSnap => {
    const data = docSnap.data();

    const div = document.createElement("div");
    div.className = "p-3 bg-gray-200 rounded cursor-pointer hover:bg-gray-300";
    div.textContent = data.email || docSnap.id;
    div.onclick = () => openEditor(docSnap.id);

    userListBox.appendChild(div);
  });
}

// ------------------------------------------------------------
// OPEN EDITOR
// ------------------------------------------------------------
async function openEditor(uid) {
  selectedUID = uid;

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const d = snap.data();

  ep_email.textContent = d.email || uid;
  ep_signup.textContent = d.signupDate || "-";

  // Paid classes
  paidClassesBox.innerHTML = "";
  for (let cls = 6; cls <= 12; cls++) {
    let chk = document.createElement("input");
    chk.type = "checkbox";
    chk.dataset.cls = cls;
    chk.checked = d.paidClasses?.[cls] || false;

    let lbl = document.createElement("label");
    lbl.className = "flex gap-2 items-center bg-gray-100 py-1 px-2 rounded";
    lbl.appendChild(chk);
    lbl.appendChild(document.createTextNode("Class " + cls));

    paidClassesBox.appendChild(lbl);
  }

  // Streams
  stream_science.checked = d.streams?.science || false;
  stream_commerce.checked = d.streams?.commerce || false;
  stream_arts.checked = d.streams?.arts || false;

  // Role
  roleSelect.value = d.role || "student";

  editPanel.classList.remove("hidden");
}

// ------------------------------------------------------------
// SAVE CHANGES
// ------------------------------------------------------------
async function saveUserChanges() {
  if (!selectedUID) return;

  const ref = doc(db, "users", selectedUID);

  const updatedPaid = {};
  paidClassesBox.querySelectorAll("input").forEach(chk => {
    updatedPaid[chk.dataset.cls] = chk.checked;
  });

  const updatedStreams = {
    science: stream_science.checked,
    commerce: stream_commerce.checked,
    arts: stream_arts.checked
  };

  await updateDoc(ref, {
    paidClasses: updatedPaid,
    streams: updatedStreams,
    role: roleSelect.value
  });

  alert("Saved!");
  editPanel.classList.add("hidden");
  loadUsers();
}
