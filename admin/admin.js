// js/admin.js - Production Admin Dashboard
import { initializeServices, getInitializedClients } from "../template/js/config.js";
import {
  collection, query, orderBy, limit, startAfter,
  getDocs, where, doc, updateDoc, getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { signOut } from "../template/js/auth-paywall.js";
import { ensureUserDocExists } from "../template/js/firebase-expiry.js";

// Whitelist for hardcoded admin access
const ADMIN_EMAILS = ["keshav.karn@gmail.com", "ready4urexam@gmail.com"];

let db, auth;
let pageSize = 20;
let lastVisible = null;
let cursorStack = []; 
let currentQueryParams = {}; 
let allCurriculumData = {};

// UI Selectors
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
  pageSizeSelector: document.getElementById("page-size"),
  refreshBtn: document.getElementById("refresh-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  currentAdminEmail: document.getElementById("current-admin-email")
};

/* -----------------------------------
   CORE LOGIC & RBAC
----------------------------------- */

function isAdmin(user, userData) {
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase()) || (userData && userData.role === "admin");
}

async function updateField(uid, updateObj) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, updateObj);
    await refreshCurrentPage();
  } catch (e) {
    alert("Manual override failed: " + e.message);
  }
}

/* -----------------------------------
   QUERY ENGINE
----------------------------------- */

function buildFirestoreQuery(params = {}) {
  const usersCol = collection(db, "users");
  let q = query(usersCol, orderBy("email"));

  // Manual Email Search
  if (params.email) {
    return query(usersCol, where("email", "==", params.email));
  }

  // RBAC Class Filter
  if (params.classId) {
    q = query(q, where(`paidClasses.${params.classId}`, "==", true));
  }

  // Stream Filter (Checks your string field in Firestore)
  if (params.stream) {
    q = query(q, where("streams", "==", params.stream));
  }

  return query(q, limit(pageSize));
}

/* -----------------------------------
   UI RENDERING
----------------------------------- */

function renderUserRow(uid, data) {
  const tr = document.createElement("tr");
  tr.className = "hover:bg-gray-50 border-b border-gray-100 transition";

  // Details Column
  tr.innerHTML = `
    <td class="px-6 py-4">
      <div class="font-bold text-gray-900">${data.email || 'Anonymous'}</div>
      <div class="text-[9px] font-mono text-gray-400 uppercase tracking-tighter">${uid}</div>
    </td>
    <td class="px-6 py-4">
      <span class="px-2 py-1 rounded text-[10px] font-black uppercase ${data.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">
        ${data.role || 'student'}
      </span>
      <div class="text-[9px] text-gray-400 mt-1 italic">Joined: ${data.signupDate ? new Date(data.signupDate).toLocaleDateString() : '-'}</div>
    </td>
  `;

  // Manual Expiry (15-day control)
  const expiryTd = document.createElement("td");
  expiryTd.className = "px-6 py-4";
  const expiryInput = document.createElement("input");
  expiryInput.type = "date";
  expiryInput.className = "border rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-cbse-blue outline-none";
  if (data.accessExpiryDate) expiryInput.value = data.accessExpiryDate.split('T')[0];
  expiryInput.onchange = async (e) => await updateField(uid, { accessExpiryDate: new Date(e.target.value).toISOString() });
  expiryTd.appendChild(expiryInput);
  tr.appendChild(expiryTd);

  // Manual Class Assignment
  const classesTd = document.createElement("td");
  classesTd.className = "px-6 py-4";
  const classWrap = document.createElement("div");
  classWrap.className = "flex flex-wrap gap-1";
  ["6","7","8","9","10","11","12"].forEach(c => {
    const active = data.paidClasses && data.paidClasses[c];
    const btn = document.createElement("button");
    btn.className = `w-7 h-7 rounded-md text-[10px] font-black transition ${active ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-400'}`;
    btn.textContent = c;
    btn.onclick = () => updateField(uid, { [`paidClasses.${c}`]: !active });
    classWrap.appendChild(btn);
  });
  classesTd.appendChild(classWrap);
  tr.appendChild(classesTd);

  // Manual Stream Assignment (Class 11/12)
  const streamsTd = document.createElement("td");
  streamsTd.className = "px-6 py-4";
  const streamWrap = document.createElement("div");
  streamWrap.className = "flex gap-2";
  ["science", "commerce", "arts"].forEach(s => {
    const active = data.streams === s;
    const btn = document.createElement("button");
    btn.className = `px-2 py-1 rounded text-[9px] font-black uppercase ${active ? 'bg-cbse-blue text-white' : 'bg-gray-100 text-gray-400'}`;
    btn.textContent = s;
    btn.onclick = () => updateField(uid, { streams: active ? "" : s });
    streamWrap.appendChild(btn);
  });
  streamsTd.appendChild(streamWrap);
  tr.appendChild(streamsTd);

  // Chapter Access Modal Button
  const chapterTd = document.createElement("td");
  chapterTd.className = "px-6 py-4";
  const chBtn = document.createElement("button");
  chBtn.className = "text-cbse-blue font-bold text-xs hover:underline uppercase tracking-tighter";
  chBtn.textContent = "Override Ch.";
  chBtn.onclick = () => openChapterModal(uid, data);
  chapterTd.appendChild(chBtn);
  tr.appendChild(chapterTd);

  // Admin Role Toggle
  const actionsTd = document.createElement("td");
  actionsTd.className = "px-6 py-4 text-center space-x-2";
  const roleBtn = document.createElement("button");
  roleBtn.className = "text-[9px] font-black uppercase text-gray-400 hover:text-cbse-blue";
  roleBtn.textContent = data.role === 'admin' ? "Demote" : "Promote";
  roleBtn.onclick = () => updateField(uid, { role: data.role === 'admin' ? 'student' : 'admin' });
  actionsTd.appendChild(roleBtn);
  tr.appendChild(actionsTd);

  return tr;
}

/* -----------------------------------
   CHAPTER OVERRIDE MODAL
----------------------------------- */

function openChapterModal(uid, userData) {
  const modal = document.getElementById("chapter-modal");
  const body = document.getElementById("chapter-modal-body");
  body.innerHTML = `<p class="text-[10px] font-bold text-gray-400 mb-4">Select individual chapters to manually unlock for ${userData.email}</p>`;

  Object.keys(userData.paidClasses || {}).forEach(classId => {
    if (!userData.paidClasses[classId]) return;
    const section = document.createElement("div");
    section.className = "mb-4 border-b pb-4";
    section.innerHTML = `<h4 class="font-black text-cbse-blue text-sm mb-2 uppercase">Class ${classId} Curriculum</h4>`;
    
    // Fetch curriculum based on assigned class
    const curric = allCurriculumData[classId] || {};
    Object.keys(curric).forEach(subject => {
        const subWrap = document.createElement("div");
        subWrap.className = "ml-2 mt-2";
        subWrap.innerHTML = `<p class="text-[10px] font-black text-gray-400 uppercase mb-1">${subject}</p>`;
        
        // Flatten chapters for toggling
        const chapters = Object.values(curric[subject]).flat();
        chapters.forEach(ch => {
            const chRow = document.createElement("label");
            chRow.className = "flex items-center gap-2 mb-1 cursor-pointer hover:bg-gray-50 p-1 rounded";
            const isUnlocked = userData.chapters && userData.chapters[ch.chapter_title];
            chRow.innerHTML = `
                <input type="checkbox" class="rounded" ${isUnlocked ? 'checked' : ''}>
                <span class="text-xs font-medium text-gray-700">${ch.chapter_title}</span>
            `;
            chRow.querySelector('input').onchange = (e) => updateField(uid, { [`chapters.${ch.chapter_title}`]: e.target.checked });
            subWrap.appendChild(chRow);
        });
        section.appendChild(subWrap);
    });
    body.appendChild(section);
  });
  modal.classList.remove("hidden");
}

/* -----------------------------------
   PAGINATION & BOOT
----------------------------------- */

async function fetchPage(params = {}, cursor = null) {
  let q = buildFirestoreQuery(params);
  if (cursor) q = query(q, startAfter(cursor));
  const snap = await getDocs(q);
  selectors.tbody.innerHTML = "";
  selectors.resultsCount.textContent = `${snap.docs.length} Users Found`;
  snap.docs.forEach(d => selectors.tbody.appendChild(renderUserRow(d.id, d.data())));
  lastVisible = snap.docs[snap.docs.length - 1];
}

async function refreshCurrentPage() {
  await fetchPage(currentQueryParams);
}

async function boot() {
  await initializeServices();
  const clients = getInitializedClients();
  db = clients.db;
  auth = clients.auth;

  // Verify Admin Access
  auth.onAuthStateChanged(async user => {
    if (!user) { location.href = "../index.html"; return; }
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!isAdmin(user, snap.exists() ? snap.data() : null)) {
        alert("Access Denied: Admin role required.");
        location.href = "../index.html";
        return;
    }
    selectors.currentAdminEmail.textContent = user.email;
    
    // Load Curriculum and initial page
    for (let i = 6; i <= 12; i++) {
        try {
            const mod = await import(`../static_curriculum/class${i}/curriculum.js`);
            allCurriculumData[i] = mod.curriculum;
        } catch(e) {}
    }
    fetchPage();
  });

  // Event Listeners
  selectors.applyFilters.onclick = () => {
    currentQueryParams = {
      email: selectors.filterEmail.value.trim(),
      classId: selectors.filterClass.value,
      stream: selectors.filterStream.value
    };
    fetchPage(currentQueryParams);
  };
  selectors.clearFilters.onclick = () => {
    selectors.filterEmail.value = "";
    selectors.filterClass.value = "";
    selectors.filterStream.value = "";
    currentQueryParams = {};
    fetchPage();
  };
  selectors.nextPage.onclick = () => fetchPage(currentQueryParams, lastVisible);
  selectors.logoutBtn.onclick = async () => { await signOut(); location.href = "../index.html"; };
  document.getElementById("close-modal-btn").onclick = () => document.getElementById("chapter-modal").classList.add("hidden");
}

boot();
