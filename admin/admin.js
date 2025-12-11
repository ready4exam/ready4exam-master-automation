import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getFirestore, doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const app = initializeApp(window.__firebase_config);
const db = getFirestore(app);
const auth = getAuth(app);

// -------------------------------------------------------------------
// ADMIN EMAIL ALLOWLIST (SAFE & SIMPLE)
// -------------------------------------------------------------------
const ADMIN_EMAILS = [
  "youremail@gmail.com",     // TODO: Replace with your email
  "admin@ready4exam.com"
];

// -------------------------------------------------------------------
function qs(id){ return document.getElementById(id); }

// Build classes 6–12 checkboxes
const classContainer = qs("class-checkboxes");
for (let c = 6; c <= 12; c++) {
  const box = document.createElement("label");
  box.innerHTML = `
    <input type="checkbox" class="clsbox" data-class="${c}"> Class ${c}
  `;
  classContainer.appendChild(box);
}

let currentUID = null;
let currentUserDoc = null;

// -------------------------------------------------------------------
// AUTH PROTECTION
// -------------------------------------------------------------------
onAuthStateChanged(auth, user => {
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    alert("Access denied. Admins only.");
    location.href = "index.html";
  }
});

// -------------------------------------------------------------------
// SEARCH USER
// -------------------------------------------------------------------
qs("search-btn").onclick = async () => {
  const email = qs("email-input").value.trim();
  if (!email) return alert("Enter an email.");

  qs("status").innerHTML = "Searching...";

  // Step 1: find Firebase Auth UID using Firestore index
  // (We assume you store user emails in quiz_scores or users collection)
  
  // Option 1: users collection contains email field
  // If not, you must add it — recommended.
  
  let uid = null;

  const usersCol = doc(db, "email_to_uid", email); // simple manual index option
  const snapIndex = await getDoc(usersCol);
  if (snapIndex.exists()) {
    uid = snapIndex.data().uid;
  } else {
    qs("status").innerHTML = "❌ Email not found.";
    return;
  }

  // Step 2: load user doc
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    qs("status").innerHTML = "❌ User document missing.";
    return;
  }

  currentUID = uid;
  currentUserDoc = snap.data();

  qs("ui-email").innerText = email;
  qs("ui-uid").innerText = uid;
  qs("role-select").value = currentUserDoc.role || "student";

  // classes
  document.querySelectorAll(".clsbox").forEach(box => {
    const c = box.dataset.class;
    box.checked = currentUserDoc.paidClasses?.[c] === true;
  });

  // streams
  qs("stream-science").checked  = currentUserDoc.streams?.science === true;
  qs("stream-commerce").checked = currentUserDoc.streams?.commerce === true;
  qs("stream-arts").checked     = currentUserDoc.streams?.arts === true;

  qs("user-info").classList.remove("hidden");
  qs("status").innerHTML = "";
};

// -------------------------------------------------------------------
// UPDATE USER
// -------------------------------------------------------------------
qs("update-btn").onclick = async () => {
  if (!currentUID) return;

  const newRole = qs("role-select").value;

  const newClasses = {};
  document.querySelectorAll(".clsbox").forEach(box => {
    const c = box.dataset.class;
    newClasses[c] = box.checked;
  });

  const newStreams = {
    science: qs("stream-science").checked,
    commerce: qs("stream-commerce").checked,
    arts: qs("stream-arts").checked
  };

  const ref = doc(db, "users", currentUID);

  await updateDoc(ref, {
    role: newRole,
    paidClasses: newClasses,
    streams: newStreams
  });

  qs("status").innerHTML =
    `<span class="text-green-700 font-semibold">✔ Updated successfully</span>`;
};
