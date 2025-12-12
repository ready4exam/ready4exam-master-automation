// js/admin.js
// Admin Dashboard client script — modular and production ready
// Relies on config.js → initializeServices() and getInitializedClients()

import { initializeServices, getInitializedClients } from "./config.js";
import {
  collection, query, orderBy, limit, startAfter, getDocs, where, doc, updateDoc, getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { signOut } from "./auth-paywall.js"; // reuse your signOut
import { ensureUserDocExists } from "./firebase-expiry.js";

const ADMIN_EMAILS = ["keshav.karn@gmail.com", "ready4urexam@gmail.com"];

const selectors = {
  tbody: document.getElementById("users-tbody"),
  resultsCount: document.getElementById("results-count"),
  filterEmail: document.getElementById("filter-email"),
  filterClass: document.getElementById("filter-class"),
  filterStream: document.getElementById("filter-stream"),
  applyFilters: document.getElementById("apply-filters"),
  clearFilters: document.getElementById("clear-filters"),
  prevPage: document.getElementById("prev-page"),
  nextPage: document.getElementById("next-page"),
  pageSize: document.getElementById("page-size"),
  refreshBtn: document.getElementById("refresh-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  currentAdminEmail: document.getElementById("current-admin-email")
};

let db, auth;
let pageSize = Number(selectors.pageSize.value) || 20;
let lastVisible = null;
let cursorStack = []; // used for prev/next page navigation
let currentQueryParams = {}; // { email, classId, stream }

// ---------- utility ----------
function el(tag, attrs = {}, inner = "") {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => {
    if (k === "class") e.className = v; else e.setAttribute(k, v);
  });
  if (inner !== "") e.innerHTML = inner;
  return e;
}

function fmtDate(ts) {
  if (!ts) return "-";
  try {
    if (ts.toMillis) ts = ts.toMillis();
    return new Date(ts).toLocaleString();
  } catch { return "-"; }
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes((email || "").toLowerCase());
}

// ---------- build firestore query ----------
function buildQuery(params = {}) {
  const usersCol = collection(db, "users");
  let q = query(usersCol, orderBy("email"), limit(pageSize));

  if (params.email) {
    // exact match preferred for performance
    q = query(usersCol, where("email", "==", params.email), orderBy("email"), limit(pageSize));
    return q;
  }

  if (params.classId) {
    // query map field paidClasses.<classId> == true
    q = query(usersCol, where(`paidClasses.${params.classId}`, "==", true), orderBy("email"), limit(pageSize));
    // stream filter can be combined
    if (params.stream) {
      q = query(usersCol,
        where(`paidClasses.${params.classId}`, "==", true),
        where(`streams.${params.stream}`, "==", true),
        orderBy("email"),
        limit(pageSize)
      );
    }
    return q;
  }

  if (params.stream) {
    q = query(usersCol, where(`streams.${params.stream}`, "==", true), orderBy("email"), limit(pageSize));
    return q;
  }

  return q;
}

// ---------- render a single user row ----------
function renderUserRow(uid, data) {
  const tr = el("tr", { class: "hover:bg-gray-50" });

  // email / uid
  const emailTd = el("td", { class: "px-4 py-3" });
  emailTd.appendChild(el("div", { class: "email" }, data.email || uid));
  emailTd.appendChild(el("div", { class: "muted" }, uid));
  tr.appendChild(emailTd);

  // role
  tr.appendChild(el("td", { class: "px-4 py-3" }, data.role || "student"));

  // signup
  tr.appendChild(el("td", { class: "px-4 py-3" }, fmtDate(data.signupDate)));

  // paid classes - render buttons/toggles per class
  const classesTd = el("td", { class: "px-4 py-3" });
  const classesList = ["6","7","8","9","10","11","12"];
  classesList.forEach(c => {
    const active = data.paidClasses && data.paidClasses[c];
    const btn = el("button", { class: `px-2 py-1 mr-2 mb-2 text-xs rounded ${active ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}` }, `C${c}`);
    btn.onclick = async (ev) => {
      ev.stopPropagation();
      await togglePaidClass(uid, c, !active, tr);
    };
    classesTd.appendChild(btn);
  });
  tr.appendChild(classesTd);

  // streams
  const streamsTd = el("td", { class: "px-4 py-3" });
  const streamKeys = ["science","commerce","arts"];
  streamKeys.forEach(s => {
    const on = data.streams && data.streams[s];
    const wrap = el("div", { class: "inline-block mr-3 mb-2" });
    const sw = el("div", { class: `switch ${on ? 'on' : ''}`, title: s });
    const knob = el("div", { class: "knob" });
    sw.appendChild(knob);
    sw.onclick = async (ev) => {
      ev.stopPropagation();
      await toggleStream(uid, s, !on, tr);
    };
    wrap.appendChild(sw);
    wrap.appendChild(el("div", { class: "text-xs muted mt-1" }, `<span style="display:block;text-align:center">${s}</span>`));
    streamsTd.appendChild(wrap);
  });
  tr.appendChild(streamsTd);

  // actions
  const actionsTd = el("td", { class: "px-4 py-3" });
  // Make Admin toggle (only show if not the current user)
  const makeAdminBtn = el("button", { class: "btn-secondary mr-2" }, "Make Admin");
  makeAdminBtn.onclick = async (ev) => {
    ev.stopPropagation();
    if (!confirm(`Grant admin role to ${data.email}?`)) return;
    await updateUserRole(uid, "admin", tr);
  };
  const removeAdminBtn = el("button", { class: "btn-secondary mr-2" }, "Remove Admin");
  removeAdminBtn.onclick = async (ev) => {
    ev.stopPropagation();
    if (!confirm(`Remove admin role from ${data.email}?`)) return;
    await updateUserRole(uid, "student", tr);
  };

  actionsTd.appendChild(makeAdminBtn);
  actionsTd.appendChild(removeAdminBtn);

  // Quick open user doc in console for debugging
  const inspectBtn = el("button", { class: "btn-ghost ml-2" }, "Inspect");
  inspectBtn.onclick = (ev) => {
    ev.stopPropagation();
    console.log("User doc", uid, data);
    alert(JSON.stringify(data, null, 2).slice(0, 800));
  };
  actionsTd.appendChild(inspectBtn);

  tr.appendChild(actionsTd);

  return tr;
}

// ---------- updates ----------
async function togglePaidClass(uid, classId, value, rowEl) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { [`paidClasses.${classId}`]: value });
    // update UI quickly
    await refreshCurrentPage(true);
  } catch (e) {
    console.error(e);
    alert("Failed to update paid class: " + (e.message || e));
  }
}
async function toggleStream(uid, stream, value, rowEl) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { [`streams.${stream}`]: value });
    await refreshCurrentPage(true);
  } catch (e) {
    console.error(e);
    alert("Failed to update stream: " + (e.message || e));
  }
}
async function updateUserRole(uid, role, rowEl) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { role });
    await refreshCurrentPage(true);
  } catch (e) {
    console.error(e);
    alert("Failed to update role: " + (e.message || e));
  }
}

// ---------- fetch page ----------
async function fetchPage(params = {}, cursor = null) {
  const q = buildQuery(params);
  let qToRun = q;
  if (cursor) {
    qToRun = query(q, startAfter(cursor));
  }
  const snap = await getDocs(qToRun);
  return snap;
}

// ---------- render page ----------
async function renderPage(snap) {
  selectors.tbody.innerHTML = "";
  const docs = snap.docs || [];
  selectors.resultsCount.textContent = docs.length;

  if (!docs.length) {
    selectors.tbody.appendChild(el("tr", {}, `<td colspan="6" class="px-4 py-6 text-center muted">No users found</td>`));
    return;
  }

  docs.forEach(d => {
    const uid = d.id;
    const data = d.data();
    selectors.tbody.appendChild(renderUserRow(uid, data));
  });

  // pagination cursors
  lastVisible = docs[docs.length - 1];
}

// ---------- refresh helpers ----------
async function refreshCurrentPage(skipStackPush = false) {
  // use currentQueryParams and cursorStack to determine where to fetch
  let cursor = null;
  if (cursorStack.length > 0) cursor = cursorStack[cursorStack.length - 1];

  const snap = await fetchPage(currentQueryParams, cursor);
  await renderPage(snap);
}

// ---------- event handlers ----------
async function applyFiltersHandler() {
  currentQueryParams = {
    email: (selectors.filterEmail.value || "").trim() || null,
    classId: selectors.filterClass.value || null,
    stream: selectors.filterStream.value || null
  };
  // reset pagination
  cursorStack = [];
  lastVisible = null;
  pageSize = Number(selectors.pageSize.value) || 20;
  // fetch first page
  const q = buildQuery(currentQueryParams);
  const snap = await getDocs(query(q, limit(pageSize)));
  await renderPage(snap);
  // push initial cursor for prev stack
  if (snap.docs.length) cursorStack = [snap.docs[ snap.docs.length - 1 ]];
}

function clearFiltersHandler() {
  selectors.filterEmail.value = "";
  selectors.filterClass.value = "";
  selectors.filterStream.value = "";
  selectors.pageSize.value = "20";
  currentQueryParams = {};
  cursorStack = [];
  refreshCurrentPage(true);
}

async function nextPageHandler() {
  if (!lastVisible) return;
  // push lastVisible to stack and fetch next
  cursorStack.push(lastVisible);
  const snap = await fetchPage(currentQueryParams, lastVisible);
  await renderPage(snap);
}

async function prevPageHandler() {
  if (cursorStack.length <= 1) {
    // reload first page
    cursorStack = [];
    const q = buildQuery(currentQueryParams);
    const snap = await getDocs(query(q, limit(pageSize)));
    await renderPage(snap);
    return;
  }
  // remove last cursor and use previous
  cursorStack.pop(); // remove current
  const prevCursor = cursorStack[cursorStack.length - 1];
  const snap = await fetchPage(currentQueryParams, prevCursor);
  await renderPage(snap);
}

// ---------- boot sequence ----------
async function boot() {
  try {
    await initializeServices();
    const clients = getInitializedClients();
    db = clients.db;
    auth = clients.auth;

    // Wait for current user to be available — small poll
    await ensureUserDocExists();

    // must be admin: check current auth user email or role
    const u = auth.currentUser;
    if (!u) {
      alert("Please sign in as admin.");
      location.href = "/";
      return;
    }

    selectors.currentAdminEmail.textContent = u.email;

    // Quick admin check: allow if email in ADMIN_EMAILS OR role=admin in Firestore
    let allowed = false;
    if (isAdminEmail(u.email)) allowed = true;
    else {
      // fetch user doc to check role
      const ud = await getDoc(doc(db, "users", u.uid));
      const role = ud.exists() && ud.data().role;
      if (role === "admin") allowed = true;
    }

    if (!allowed) {
      alert("You are not an admin.");
      location.href = "/";
      return;
    }

    // wire events
    selectors.applyFilters.onclick = applyFiltersHandler;
    selectors.clearFilters.onclick = clearFiltersHandler;
    selectors.nextPage.onclick = nextPageHandler;
    selectors.prevPage.onclick = prevPageHandler;
    selectors.pageSize.onchange = () => { pageSize = Number(selectors.pageSize.value); applyFiltersHandler(); };
    selectors.refreshBtn.onclick = () => refreshCurrentPage(true);
    selectors.logoutBtn.onclick = async () => {
      await signOut();
      location.href = "/";
    };

    // initial load
    await applyFiltersHandler();

  } catch (e) {
    console.error("Admin boot failed:", e);
    alert("Admin dashboard failed to start: " + (e.message || e));
  }
}

boot();
