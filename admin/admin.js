// ------------------------------------------------------------
// Ready4Exam — FINAL Modern SaaS Admin Panel Script
// ------------------------------------------------------------

// ------------------------------------------------------------
// Firebase Initialization
// ------------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
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
// Admin Email List
// ------------------------------------------------------------
const ADMIN_EMAILS = [
  "keshav.karn@gmail.com",
  "ready4urexam@gmail.com"
];

function isAdmin(user) {
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase().trim());
}

// ------------------------------------------------------------
// UI ELEMENTS
// ------------------------------------------------------------
const loginScreen = document.getElementById("loginScreen");
const adminDashboard = document.getElementById("adminDashboard");
const loginError = document.getElementById("loginError");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const searchBox = document.getElementById("searchBox");
const userTableBody = document.getElementById("userTableBody");

let allUsers = []; // cached list of all users

// ------------------------------------------------------------
// AUTH LOGIN / LOGOUT
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

  await loadUsers();
});

// ------------------------------------------------------------
// LOAD USERS FROM FIRESTORE
// ------------------------------------------------------------
async function loadUsers() {
  const snap = await getDocs(collection(db, "users"));

  allUsers = [];
  userTableBody.innerHTML = "";

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    allUsers.push({ uid: docSnap.id, ...data });
  });

  renderUserTable(allUsers);
}

// ------------------------------------------------------------
// RENDER TABLE
// ------------------------------------------------------------
function renderUserTable(users) {
  userTableBody.innerHTML = "";

  if (!users.length) {
    userTableBody.innerHTML = `<tr><td colspan="5">No users found</td></tr>`;
    return;
  }

  users.forEach((u) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${u.email || "(no email)"}</td>
      <td>${u.uid}</td>
      <td>${formatPaidClasses(u.paidClasses)}</td>
      <td>${formatStreams(u.streams)}</td>
      <td><button class="editBtn" data-uid="${u.uid}">Edit</button></td>
    `;

    row.querySelector(".editBtn").onclick = () => openEditModal(u);
    userTableBody.appendChild(row);
  });
}

// ------------------------------------------------------------
// SEARCH USERS
// ------------------------------------------------------------
searchBox.oninput = () => {
  const q = searchBox.value.toLowerCase();
  const filtered = allUsers.filter(
    (u) =>
      (u.email || "").toLowerCase().includes(q) ||
      (u.uid || "").toLowerCase().includes(q)
  );
  renderUserTable(filtered);
};

// ------------------------------------------------------------
// FORMATTERS
// ------------------------------------------------------------
function formatPaidClasses(pc = {}) {
  return Object.entries(pc)
    .filter(([cls, val]) => val)
    .map(([cls]) => cls)
    .join(", ") || "-";
}

function formatStreams(s = {}) {
  const list = [];
  if (s.science) list.push("Science");
  if (s.commerce) list.push("Commerce");
  if (s.arts) list.push("Arts");
  return list.join(", ") || "-";
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

// ------------------------------------------------------------
// EDIT MODAL
// ------------------------------------------------------------
function openEditModal(user) {
  const modal = document.getElementById("editModal");
  const clsContainer = document.getElementById("classCheckboxes");
  const streamContainer = document.getElementById("streamCheckboxes");
  const saveBtn = document.getElementById("saveUserChanges");

  modal.style.display = "flex";

  // Populate class checkboxes
  clsContainer.innerHTML = "";
  for (let cls = 6; cls <= 12; cls++) {
    const checked = user.paidClasses?.[cls] ? "checked" : "";
    clsContainer.innerHTML += `
      <label><input type="checkbox" class="clsToggle" data-cls="${cls}" ${checked}> Class ${cls}</label><br>
    `;
  }

  // Populate streams (only if class 11 or 12 is ON)
  function updateStreamsVisibility() {
    const paid11 = user.paidClasses?.["11"];
    const paid12 = user.paidClasses?.["12"];

    if (paid11 || paid12) {
      streamContainer.style.display = "block";
    } else {
      streamContainer.style.display = "none";
    }
  }

  streamContainer.innerHTML = `
    <label><input type="checkbox" id="streamScience"> Science</label><br>
    <label><input type="checkbox" id="streamCommerce"> Commerce</label><br>
    <label><input type="checkbox" id="streamArts"> Arts</label><br>
  `;

  document.getElementById("streamScience").checked = user.streams?.science;
  document.getElementById("streamCommerce").checked = user.streams?.commerce;
  document.getElementById("streamArts").checked = user.streams?.arts;

  updateStreamsVisibility();

  // Save button logic
  saveBtn.onclick = async () => {
    const updatedPaid = {};
    document.querySelectorAll(".clsToggle").forEach((c) => {
      updatedPaid[c.dataset.cls] = c.checked;
    });

    const paid11 = updatedPaid["11"];
    const paid12 = updatedPaid["12"];

    let updatedStreams = user.streams;

    if (paid11 || paid12) {
      updatedStreams = {
        science: document.getElementById("streamScience").checked,
        commerce: document.getElementById("streamCommerce").checked,
        arts: document.getElementById("streamArts").checked
      };
    } else {
      updatedStreams = { science: false, commerce: false, arts: false };
    }

    await updateDoc(doc(db, "users", user.uid), {
      paidClasses: updatedPaid,
      streams: updatedStreams
    });

    modal.style.display = "none";
    await loadUsers();
  };
}

// Close modal button
document.getElementById("closeModal").onclick = () => {
  document.getElementById("editModal").style.display = "none";
};
