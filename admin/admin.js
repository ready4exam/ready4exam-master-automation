// admin.js - Modern SaaS Admin (Tailwind UI)
// Requirements:
// - Firestore rules must allow admin list/read/write (we already set those).
// - Files: admin.html + admin.js in same folder.
// - Admin emails below MUST match your Firestore rules admin list.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, collection, query, orderBy, limit, startAfter, getDocs, doc, updateDoc, where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/* ---------------------------
   CONFIG - replace if needed
   --------------------------- */
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

const ADMIN_EMAILS = [
  "keshav.karn@gmail.com",
  "ready4urexam@gmail.com"
];

// UI nodes
const loginCard = document.getElementById("loginCard");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const dashboard = document.getElementById("dashboard");
const logoutBtn = document.getElementById("logoutBtn");
const adminEmailSpan = document.getElementById("adminEmail");

const usersTbody = document.getElementById("usersTbody");
const pageInfo = document.getElementById("pageInfo");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const searchInput = document.getElementById("searchInput");
const filterClass = document.getElementById("filterClass");
const filterStream = document.getElementById("filterStream");
const applyFilters = document.getElementById("applyFilters");
const clearFilters = document.getElementById("clearFilters");
const pageSizeSelect = document.getElementById("pageSize");

const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalEmail = document.getElementById("modalEmail");
const modalSignup = document.getElementById("modalSignup");
const paidClassesContainer = document.getElementById("paidClassesContainer");
const streamsContainer = document.getElementById("streamsContainer");
const streamsRow = document.getElementById("streamsRow");
const modalCancel = document.getElementById("modalCancel");
const modalSave = document.getElementById("modalSave");
const toast = document.getElementById("toast");

// state
let currentUser = null;
let lastDoc = null;
let firstDoc = null;
let pageStack = []; // for prev
let currentQuerySnapshot = null;
let pageSize = Number(pageSizeSelect.value || 50);
let currentFilter = { search: "", classFilter: "", streamFilter: "" };
let editingUser = null;

/* ---------------------------
   Helpers
   --------------------------- */
function isAdmin(user) {
  if (!user || !user.email) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase().trim());
}
function showToast(msg, timeout = 2500) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), timeout);
}
function isoToLocal(iso) {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

/* ---------------------------
   Auth
   --------------------------- */
const provider = new GoogleAuthProvider();
loginBtn.onclick = async () => {
  loginError.textContent = "";
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error(e);
    loginError.textContent = "Login failed. Check console.";
  }
};

logoutBtn.onclick = () => signOut(auth);

/* ---------------------------
   Auth state observer
   --------------------------- */
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    loginCard.style.display = "block";
    dashboard.classList.add("hidden");
    logoutBtn.style.display = "none";
    adminEmailSpan.textContent = "";
    return;
  }

  if (!isAdmin(user)) {
    loginCard.style.display = "block";
    dashboard.classList.add("hidden");
    logoutBtn.style.display = "none";
    loginError.textContent = "You are not an admin.";
    return;
  }

  // show dashboard
  loginCard.style.display = "none";
  dashboard.classList.remove("hidden");
  logoutBtn.style.display = "inline-block";
  adminEmailSpan.textContent = user.email;

  // reset pagination
  pageStack = [];
  lastDoc = null;
  firstDoc = null;
  loadPage();
});

/* ---------------------------
   Build query and load page
   --------------------------- */
async function loadPage(direction = "first") {
  pageSize = Number(pageSizeSelect.value || 50);
  currentFilter.search = searchInput.value.trim();
  currentFilter.classFilter = filterClass.value;
  currentFilter.streamFilter = filterStream.value;

  // base query: order by email for stable pagination
  let col = collection(db, "users");
  let q = query(col, orderBy("email"), limit(pageSize));

  // Search: if search provided, use range query on email (works if email field exists)
  if (currentFilter.search) {
    const s = currentFilter.search.toLowerCase();
    // range query: >= s and < s + '\uf8ff'
    q = query(col, orderBy("email"), where("email", ">=", s), where("email", "<=", s + "\uf8ff"), limit(pageSize));
  }

  // NOTE: we keep filters client-side after fetching page (simple approach).
  // For very large datasets and complex filters, create composite indexes and server queries.

  // pagination: startAfter for next
  if (direction === "next" && lastDoc) {
    q = query(q, startAfter(lastDoc));
  }
  // prev supported by stack of cursors
  if (direction === "prev" && pageStack.length > 0) {
    // pop current last and use previous as startAfter
    const prevCursor = pageStack.pop(); // last cursor removed is previous page start
    q = query(col, orderBy("email"), startAfter(prevCursor), limit(pageSize));
  }

  try {
    const snap = await getDocs(q);
    currentQuerySnapshot = snap;
    // determine first and last doc of this page
    firstDoc = snap.docs[0] || null;
    lastDoc = snap.docs[snap.docs.length - 1] || null;

    // if direction === 'next' push previous last doc to stack for 'prev'
    if (direction === "next" && snap.docs.length) {
      // if there is a previous last doc (cursor) push it so we can go back
      if (lastDoc) pageStack.push(snap.docs[0]);
    }

    renderUsers(snap.docs || []);
    pageInfo.textContent = `Showing ${snap.docs.length} users (page size ${pageSize})`;

  } catch (err) {
    console.error("Failed loading users:", err);
    showToast("Failed to load users. Check permissions.");
  }
}

/* ---------------------------
   Render users into table (client-side filters applied)
   --------------------------- */
function renderUsers(docs) {
  usersTbody.innerHTML = "";

  // client-side filtering for class/stream if requested
  const classFilter = currentFilter.classFilter;
  const streamFilter = currentFilter.streamFilter;

  const filtered = docs.map(d => ({ uid: d.id, data: d.data() }))
    .filter(u => {
      // apply class filter
      if (classFilter === "paid") {
        const paidAny = u.data.paidClasses && Object.values(u.data.paidClasses).some(Boolean);
        if (!paidAny) return false;
      } else if (classFilter === "unpaid") {
        const paidAny = u.data.paidClasses && Object.values(u.data.paidClasses).some(Boolean);
        if (paidAny) return false;
      }
      // stream filter
      if (streamFilter) {
        if (!u.data.streams || !u.data.streams[streamFilter]) return false;
      }
      return true;
    });

  for (const u of filtered) {
    const tr = document.createElement("tr");
    tr.className = "border-b";

    const email = u.data.email || "(no email)";
    const uid = u.uid;
    const signup = u.data.signupDate ? isoToLocal(u.data.signupDate) : "-";
    const paidClasses = JSON.stringify(u.data.paidClasses || {});
    const streams = JSON.stringify(u.data.streams || {});

    tr.innerHTML = `
      <td class="px-4 py-3">${escapeHtml(email)}</td>
      <td class="px-4 py-3 text-sm text-slate-600">${uid}</td>
      <td class="px-4 py-3 text-sm text-slate-600">${signup}</td>
      <td class="px-4 py-3 text-sm">${renderPaidBadges(u.data.paidClasses)}</td>
      <td class="px-4 py-3 text-sm">${renderStreamBadges(u.data.streams)}</td>
      <td class="px-4 py-3">
        <button data-uid="${uid}" class="editBtn bg-sky-600 text-white px-3 py-1 rounded">Edit</button>
      </td>
    `;
    usersTbody.appendChild(tr);
  }

  // attach edit listeners
  document.querySelectorAll(".editBtn").forEach(btn => {
    btn.onclick = () => openEditModal(btn.dataset.uid);
  });
}

function renderPaidBadges(paid) {
  if (!paid) return '-';
  const keys = Object.keys(paid);
  return keys.map(k => {
    if (paid[k]) return `<span class="inline-block bg-green-100 text-green-700 px-2 py-0.5 rounded mr-1 text-xs">C${k}</span>`;
    return `<span class="inline-block bg-slate-100 text-slate-600 px-2 py-0.5 rounded mr-1 text-xs">C${k}</span>`;
  }).join("");
}
function renderStreamBadges(streams) {
  if (!streams) return '-';
  const order = ["science", "commerce", "arts"];
  return order.map(k => {
    if (streams[k]) return `<span class="inline-block bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded mr-1 text-xs">${capitalize(k)}</span>`;
    return '';
  }).join("");
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ---------------------------
   Pagination buttons
   --------------------------- */
nextBtn.onclick = () => loadPage("next");
prevBtn.onclick = () => {
  if (pageStack.length === 0) {
    showToast("No previous page");
    return;
  }
  loadPage("prev");
};

/* ---------------------------
   Filters
   --------------------------- */
applyFilters.onclick = () => { pageStack = []; loadPage("first"); };
clearFilters.onclick = () => {
  searchInput.value = "";
  filterClass.value = "";
  filterStream.value = "";
  pageStack = [];
  loadPage("first");
};
pageSizeSelect.onchange = () => { pageStack = []; loadPage("first"); };

/* ---------------------------
   Edit modal logic
   --------------------------- */
async function openEditModal(uid) {
  // fetch user doc snapshot by uid
  try {
    const snap = await getDocs(query(collection(db, "users"), where("__name__", "==", uid), limit(1)));
    if (!snap || !snap.docs.length) {
      showToast("User not found");
      return;
    }
    const data = snap.docs[0].data();
    editingUser = { uid, data };

    // fill modal
    modalEmail.textContent = data.email || "(no email)";
    modalSignup.textContent = isoToLocal(data.signupDate);
    buildPaidCheckboxes(data.paidClasses || {});
    buildStreamCheckboxes(data.streams || {});

    // streams visibility logic: show only if class11 or class12 true
    toggleStreamsVisibilityBasedOnPaid();

    modal.classList.remove("hidden");
    modal.style.display = "flex";
  } catch (err) {
    console.error("openEditModal error:", err);
    showToast("Failed to open user");
  }
}

function buildPaidCheckboxes(paidClasses) {
  paidClassesContainer.innerHTML = "";
  const classes = ["6","7","8","9","10","11","12"];
  classes.forEach(c => {
    const checked = !!paidClasses[c];
    const wrapper = document.createElement("label");
    wrapper.className = "inline-flex items-center gap-2 px-2 py-1 bg-slate-50 rounded";
    wrapper.innerHTML = `<input type="checkbox" data-class="${c}" ${checked ? "checked":""} /> <span class="text-sm">Class ${c}</span>`;
    paidClassesContainer.appendChild(wrapper);
    wrapper.querySelector("input").addEventListener("change", () => toggleStreamsVisibilityBasedOnPaid());
  });
}

function buildStreamCheckboxes(streams) {
  streamsContainer.innerHTML = "";
  const list = [
    { key: "science", label: "Science" },
    { key: "commerce", label: "Commerce" },
    { key: "arts", label: "Arts" }
  ];
  list.forEach(s => {
    const checked = !!(streams && streams[s.key]);
    const wrapper = document.createElement("label");
    wrapper.className = "inline-flex items-center gap-2 px-2 py-1 bg-slate-50 rounded";
    wrapper.innerHTML = `<input type="checkbox" data-stream="${s.key}" ${checked?"checked":""} /> <span class="text-sm">${s.label}</span>`;
    streamsContainer.appendChild(wrapper);
  });
}

function toggleStreamsVisibilityBasedOnPaid() {
  const checkboxes = paidClassesContainer.querySelectorAll("input[type=checkbox]");
  let class11 = false, class12 = false;
  checkboxes.forEach(cb => {
    if (cb.dataset.class === "11" && cb.checked) class11 = true;
    if (cb.dataset.class === "12" && cb.checked) class12 = true;
  });
  const showStreams = class11 || class12;
  if (showStreams) {
    streamsRow.style.display = "block";
  } else {
    streamsRow.style.display = "none";
    // also reset stream checkboxes visually (will be enforced on save)
    streamsContainer.querySelectorAll("input[type=checkbox]").forEach(cb => cb.checked = false);
  }
}

/* Modal buttons */
modalCancel.onclick = () => { modal.classList.add("hidden"); modal.style.display = "none"; editingUser = null; };
modalSave.onclick = async () => {
  if (!editingUser) return;
  modalSave.disabled = true;

  // build new paidClasses map
  const paid = {};
  paidClassesContainer.querySelectorAll("input[data-class]").forEach(cb => {
    paid[cb.dataset.class] = !!cb.checked;
  });

  // streams: only save if 11 or 12 true
  const showStreams = paid["11"] || paid["12"];
  const streams = { science: false, commerce: false, arts: false };
  if (showStreams) {
    streamsContainer.querySelectorAll("input[data-stream]").forEach(cb => {
      streams[cb.dataset.stream] = !!cb.checked;
    });
  }

  // perform update (merge)
  try {
    const ref = doc(db, "users", editingUser.uid);
    await updateDoc(ref, {
      paidClasses: paid,
      streams: streams
    });
    showToast("Saved changes");
    modal.classList.add("hidden");
    modal.style.display = "none";
    editingUser = null;
    // reload current page
    loadPage("first");
  } catch (err) {
    console.error("Save failed:", err);
    showToast("Failed to save. Check console.");
  } finally {
    modalSave.disabled = false;
  }
};

/* ---------------------------
   Utility / initial
   --------------------------- */
function capitalize(s){ return s && s[0].toUpperCase() + s.slice(1); }

// initial: hide dashboard until authenticated
loginCard.style.display = "block";
dashboard.classList.add("hidden");
logoutBtn.style.display = "none";
