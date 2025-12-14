// js/admin.js
// Admin Dashboard client script — production aligned
// Uses shared modules inside /template/js/
// Admin folder does NOT get copied into class repos.

// ⭐ FIX 1: Import db and auth directly (they are exported by config.js/firebase-expiry.js) ⭐
import { initializeServices, db, auth } from "../template/js/config.js";

import {
  collection, query, orderBy, limit, startAfter,
  getDocs, where, doc, updateDoc, getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { signOut } from "../template/js/auth-paywall.js";
import { ensureUserDocExists } from "../template/js/firebase-expiry.js";

const ADMIN_EMAILS = ["keshav.karn@gmail.com", "ready4urexam@gmail.com"];

// UI selectors
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

// ⭐ FIX 2: REMOVED THE CONFLICTING LINE: let db, auth; ⭐
let pageSize = Number(selectors.pageSize.value) || 20;
let lastVisible = null;
let cursorStack = []; 
let currentQueryParams = {}; 

// Small helpers
function el(tag, attrs = {}, inner = "") {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
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
  } catch {
    return "-";
  }
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes((email || "").toLowerCase());
}

// ----------------------
// Build Firestore query
// ----------------------
function buildQuery(params = {}) {
  // Uses imported 'db'
  const usersCol = collection(db, "users");
  let q = query(usersCol, orderBy("email"), limit(pageSize));

  if (params.email) {
    return query(usersCol, where("email", "==", params.email), orderBy("email"), limit(pageSize));
  }

  if (params.classId) {
    q = query(
      usersCol,
      where(`paidClasses.${params.classId}`, "==", true),
      orderBy("email"),
      limit(pageSize)
    );
    if (params.stream) {
      q = query(
        usersCol,
        where(`paidClasses.${params.classId}`, "==", true),
        where(`streams.${params.stream}`, "==", true),
        orderBy("email"),
        limit(pageSize)
      );
    }
    return q;
  }

  if (params.stream) {
    return query(usersCol, where(`streams.${params.stream}`, "==", true), orderBy("email"), limit(pageSize));
  }

  return q;
}

// ----------------------
// Render a single row
// ----------------------
function renderUserRow(uid, data) {
  const tr = el("tr", { class: "hover:bg-gray-50" });

  const emailTd = el("td", { class: "px-4 py-3" });
  emailTd.appendChild(el("div", { class: "email" }, data.email || uid));
  emailTd.appendChild(el("div", { class: "muted" }, uid));
  tr.appendChild(emailTd);

  tr.appendChild(el("td", { class: "px-4 py-3" }, data.role || "student"));
  tr.appendChild(el("td", { class: "px-4 py-3" }, fmtDate(data.signupDate)));

  // Expiry Date
  const expiryTd = el("td", { class: "px-4 py-3" });
  const expiryInput = el("input", { type: "date", class: "border rounded px-2 py-1" });
  if (data.accessExpiryDate) {
    expiryInput.value = new Date(data.accessExpiryDate).toISOString().split('T')[0];
  }
  expiryInput.onchange = async (e) => {
    await updateAccessExpiry(uid, e.target.value);
  };
  expiryTd.appendChild(expiryInput);
  tr.appendChild(expiryTd);

  // PAID CLASSES
  const classesTd = el("td", { class: "px-4 py-3" });
  ["6","7","8","9","10","11","12"].forEach(c => {
    const active = data.paidClasses && data.paidClasses[c];
    const btn = el("button",
      { class: `px-2 py-1 mr-2 mb-2 text-xs rounded ${active ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}` },
      `C${c}`
    );
    btn.onclick = async ev => {
      ev.stopPropagation();
      await togglePaidClass(uid, c, !active);
    };
    classesTd.appendChild(btn);
  });
  tr.appendChild(classesTd);

  // STREAMS
  const streamsTd = el("td", { class: "px-4 py-3" });
  ["science", "commerce", "arts"].forEach(s => {
    const on = data.streams && data.streams[s];
    const wrap = el("div", { class: "inline-block mr-3 mb-2" });

    const sw = el("div", { class: `switch ${on ? 'on' : ''}` });
    const knob = el("div", { class: "knob" });
    sw.appendChild(knob);

    sw.onclick = async ev => {
      ev.stopPropagation();
      await toggleStream(uid, s, !on);
    };

    wrap.appendChild(sw);
    wrap.appendChild(el("div", { class: "text-xs muted mt-1" }, s));
    streamsTd.appendChild(wrap);
  });
  tr.appendChild(streamsTd);

  // Chapter Access
  const chapterTd = el("td", { class: "px-4 py-3" });
  const manageChaptersBtn = el("button", { class: "btn-secondary" }, "Manage Chapters");
  manageChaptersBtn.onclick = () => {
    openChapterModal(uid, data);
  };
  chapterTd.appendChild(manageChaptersBtn);
  tr.appendChild(chapterTd);

  // Actions
  const actionsTd = el("td", { class: "px-4 py-3" });

  const makeAdminBtn = el("button", { class: "btn-secondary mr-2" }, "Make Admin");
  makeAdminBtn.onclick = async ev => {
    ev.stopPropagation();
    await updateUserRole(uid, "admin");
  };

  const removeAdminBtn = el("button", { class: "btn-secondary mr-2" }, "Remove Admin");
  removeAdminBtn.onclick = async ev => {
    ev.stopPropagation();
    await updateUserRole(uid, "student");
  };

  const inspectBtn = el("button", { class: "btn-ghost ml-2" }, "Inspect");
  inspectBtn.onclick = () => alert(JSON.stringify(data, null, 2).slice(0, 800));

  actionsTd.appendChild(makeAdminBtn);
  actionsTd.appendChild(removeAdminBtn);
  actionsTd.appendChild(inspectBtn);
  tr.appendChild(actionsTd);

  return tr;
}

// ----------------------
// Update Handlers
// ----------------------
async function togglePaidClass(uid, classId, value) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { [`paidClasses.${classId}`]: value });
    await refreshCurrentPage(true);
  } catch (e) {
    alert("Failed to update paid class: " + e.message);
  }
}

async function toggleStream(uid, stream, value) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { [`streams.${stream}`]: value });
    await refreshCurrentPage(true);
  } catch (e) {
    alert("Failed to update stream: " + e.message);
  }
}

async function updateUserRole(uid, role) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { role });
    await refreshCurrentPage(true);
  } catch (e) {
    alert("Failed to update role: " + e.message);
  }
}

async function fetchAllCurriculumData() {
  const curriculum = {};
  for (let i = 6; i <= 12; i++) {
    try {
      const module = await import(`../static_curriculum/class${i}/curriculum.js`);
      curriculum[i] = module.curriculum;
    } catch (e) {
      console.error(`Failed to load curriculum for class ${i}:`, e);
    }
  }
  return curriculum;
}

async function updateAccessExpiry(uid, dateString) {
  try {
    const userRef = doc(db, "users", uid);
    const accessExpiryDate = dateString ? new Date(dateString).toISOString() : null;
    await updateDoc(userRef, { accessExpiryDate });
    await refreshCurrentPage(true);
  } catch (e) {
    alert("Failed to update access expiry: " + e.message);
  }
}

async function updateChapterAccess(uid, chapter, checked) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { [`chapters.${chapter}`]: checked });
    // No need to refresh the whole page, just update the local state
  } catch (e) {
    alert("Failed to update chapter access: " + e.message);
  }
}

function openChapterModal(uid, userData) {
  const modal = document.getElementById("chapter-modal");
  const modalBody = document.getElementById("chapter-modal-body");
  modalBody.innerHTML = "";

  for (const classId in userData.paidClasses) {
    if (userData.paidClasses[classId]) {
      const classCurriculum = allCurriculumData[classId];
      if (classCurriculum) {
        const classContainer = el("div", { class: "mb-4" });
        const classTitle = el("h4", { class: "text-lg font-bold" }, `Class ${classId}`);
        classContainer.appendChild(classTitle);

        for (const subject in classCurriculum) {
          const subjectContainer = el("div", { class: "mb-2" });
          const subjectTitle = el("h5", { class: "text-md font-semibold" }, subject);
          subjectContainer.appendChild(subjectTitle);

          for (const section in classCurriculum[subject]) {
            classCurriculum[subject][section].forEach(chapter => {
              const chapterContainer = el("div", { class: "flex items-center" });
              const checkbox = el("input", { type: "checkbox", id: chapter.chapter_title });
              checkbox.checked = userData.chapters && userData.chapters[chapter.chapter_title];
              checkbox.onchange = (e) => {
                updateChapterAccess(uid, chapter.chapter_title, e.target.checked);
              };
              const label = el("label", { for: chapter.chapter_title, class: "ml-2" }, chapter.chapter_title);
              chapterContainer.appendChild(checkbox);
              chapterContainer.appendChild(label);
              subjectContainer.appendChild(chapterContainer);
            });
          }
          classContainer.appendChild(subjectContainer);
        }
        modalBody.appendChild(classContainer);
      }
    }
  }

  modal.classList.remove("hidden");
}

document.getElementById("close-modal-btn").onclick = () => {
  document.getElementById("chapter-modal").classList.add("hidden");
  refreshCurrentPage(true);
};

// ----------------------
// Pagination + Query execution
// ----------------------
async function fetchPage(params = {}, cursor = null) {
  let q = buildQuery(params);
  if (cursor) q = query(q, startAfter(cursor));
  return await getDocs(q);
}

async function renderPage(snap) {
  selectors.tbody.innerHTML = "";
  const docs = snap.docs || [];

  selectors.resultsCount.textContent = docs.length;

  if (!docs.length) {
    selectors.tbody.innerHTML =
      `<tr><td colspan="6" class="px-4 py-6 text-center muted">No users found</td></tr>`;
    return;
  }

  docs.forEach(d => {
    selectors.tbody.appendChild(renderUserRow(d.id, d.data()));
  });

  lastVisible = docs[docs.length - 1];
}

async function refreshCurrentPage() {
  let cursor = cursorStack.length ? cursorStack[cursorStack.length - 1] : null;
  const snap = await fetchPage(currentQueryParams, cursor);
  await renderPage(snap);
}

// ----------------------
// Event handlers
// ----------------------
async function applyFiltersHandler() {
  currentQueryParams = {
    email: selectors.filterEmail.value.trim() || null,
    classId: selectors.filterClass.value || null,
    stream: selectors.filterStream.value || null
  };

  cursorStack = [];
  pageSize = Number(selectors.pageSize.value) || 20;

  const snap = await fetchPage(currentQueryParams);
  await renderPage(snap);

  if (snap.docs.length) cursorStack.push(snap.docs[snap.docs.length - 1]);
}

async function nextPageHandler() {
  if (!lastVisible) return;
  cursorStack.push(lastVisible);
  const snap = await fetchPage(currentQueryParams, lastVisible);
  await renderPage(snap);
}

async function prevPageHandler() {
  if (cursorStack.length <= 1) {
    cursorStack = [];
    const snap = await fetchPage(currentQueryParams);
    await renderPage(snap);
    return;
  }

  cursorStack.pop();
  const prevCursor = cursorStack[cursorStack.length - 1];
  const snap = await fetchPage(currentQueryParams, prevCursor);
  await renderPage(snap);
}

function clearFiltersHandler() {
  selectors.filterEmail.value = "";
  selectors.filterClass.value = "";
  selectors.filterStream.value = "";
  selectors.pageSize.value = "20";

  currentQueryParams = {};
  cursorStack = [];
  refreshCurrentPage();
}

// ----------------------
// Boot
// ----------------------
let allCurriculumData = {};

async function boot() {
  await initializeServices();
  
  // NOTE: The lines that previously assigned 'db' and 'auth' from 'getInitializedClients()'
  // are now redundant because 'db' and 'auth' were imported directly.
  
  allCurriculumData = await fetchAllCurriculumData();
  await ensureUserDocExists();

  const user = auth.currentUser; // 'auth' is available from the import
  if (!user) {
    alert("Please sign in as admin.");
    location.href = "../index.html";
    return;
  }

  selectors.currentAdminEmail.textContent = user.email;

  let allowed = isAdminEmail(user.email);
  if (!allowed) {
    // NOTE: 'db' is available from the import
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists() && snap.data().role === "admin") allowed = true;
  }

  if (!allowed) {
    alert("You are not an admin.");
    location.href = "../index.html";
    return;
  }

  // Wire events
  selectors.applyFilters.onclick = applyFiltersHandler;
  selectors.clearFilters.onclick = clearFiltersHandler;
  selectors.nextPage.onclick = nextPageHandler;
  selectors.prevPage.onclick = prevPageHandler;
  selectors.refreshBtn.onclick = () => refreshCurrentPage();
  selectors.logoutBtn.onclick = async () => {
    await signOut();
    location.href = "../index.html";
  };

  await applyFiltersHandler();
}

boot();
