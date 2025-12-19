import { initializeServices, getInitializedClients } from "../template/js/config.js";
import { 
  collection, query, orderBy, limit, getDocs, where, doc, updateDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { signOut } from "../template/js/auth-paywall.js";

// 1. ACCESS CONFIG
const ADMIN_EMAILS = ["keshav.karn@gmail.com", "ready4urexam@gmail.com"];

let db, auth;
const selectors = {
  tbody: document.getElementById("users-tbody"),
  emptyState: document.getElementById("empty-state"),
  resultsCount: document.getElementById("results-count"),
  filterEmail: document.getElementById("filter-email"),
  applyFilters: document.getElementById("apply-filters"),
  clearFilters: document.getElementById("clear-filters"),
  refreshBtn: document.getElementById("refresh-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  currentAdminEmail: document.getElementById("current-admin-email")
};

/* -----------------------------------
   UI RENDERING COMPONENT
----------------------------------- */

function renderUserRow(uid, data) {
  const tr = document.createElement("tr");
  tr.className = "group hover:bg-slate-50 transition-colors";

  // DETAILS
  tr.innerHTML = `
    <td class="px-8 py-6">
      <div class="flex flex-col">
        <span class="text-sm font-black text-slate-800">${data.email || 'No Email'}</span>
        <span class="text-[9px] font-mono text-slate-400 uppercase tracking-tighter mt-1">${uid}</span>
        <div class="mt-2 flex gap-2">
            <span class="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${data.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}">
                ${data.role || 'student'}
            </span>
        </div>
      </div>
    </td>`;

  // EXPIRY PICKER (Manual 15-day override)
  const expiryTd = document.createElement("td");
  expiryTd.className = "px-8 py-6";
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-cbse-blue bg-slate-50";
  if (data.accessExpiryDate) dateInput.value = data.accessExpiryDate.split('T')[0];
  dateInput.onchange = async (e) => await updateField(uid, { accessExpiryDate: new Date(e.target.value).toISOString() });
  expiryTd.appendChild(dateInput);
  tr.appendChild(expiryTd);

  // PAID CLASSES (C6-C12)
  const classesTd = document.createElement("td");
  classesTd.className = "px-8 py-6";
  const classGrid = document.createElement("div");
  classGrid.className = "flex flex-wrap gap-1.5 max-w-[180px]";
  
  ["6","7","8","9","10","11","12"].forEach(c => {
    const active = data.paidClasses && data.paidClasses[c];
    const btn = document.createElement("button");
    btn.className = `w-7 h-7 flex items-center justify-center rounded-lg text-[10px] font-black transition-all ${active ? 'bg-green-600 text-white shadow-md shadow-green-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`;
    btn.textContent = c;
    btn.onclick = () => updateField(uid, { [`paidClasses.${c}`]: !active });
    classGrid.appendChild(btn);
  });
  classesTd.appendChild(classGrid);
  tr.appendChild(classesTd);

  // STREAM ASSIGNMENT (11/12 Science/Commerce/Arts)
  const streamTd = document.createElement("td");
  streamTd.className = "px-8 py-6";
  const streamWrap = document.createElement("div");
  streamWrap.className = "flex gap-2";
  ["science", "commerce", "arts"].forEach(s => {
    const active = data.streams === s;
    const btn = document.createElement("button");
    btn.className = `px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${active ? 'bg-cbse-blue text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`;
    btn.textContent = s;
    btn.onclick = () => updateField(uid, { streams: active ? "" : s });
    streamWrap.appendChild(btn);
  });
  streamTd.appendChild(streamWrap);
  tr.appendChild(streamTd);

  // ACTION PANEL
  const actionTd = document.createElement("td");
  actionTd.className = "px-8 py-6 text-right";
  const revokeBtn = document.createElement("button");
  revokeBtn.className = "text-[10px] font-black text-slate-300 hover:text-red-500 uppercase tracking-widest transition-colors";
  revokeBtn.textContent = "Revoke All";
  revokeBtn.onclick = () => { if(confirm("Clear all manual overrides?")) updateField(uid, { paidClasses: {}, streams: "" }); };
  actionTd.appendChild(revokeBtn);
  tr.appendChild(actionTd);

  return tr;
}

/* -----------------------------------
   DATA OPERATIONS
----------------------------------- */

async function updateField(uid, obj) {
  try {
    await updateDoc(doc(db, "users", uid), obj);
    fetchUsers(); // Live Refresh
  } catch (e) {
    alert("Permission Denied: Ensure your email is whitelisted in Security Rules.");
  }
}

async function fetchUsers() {
  selectors.tbody.innerHTML = `<tr><td colspan="5" class="py-20 text-center text-slate-400 font-bold animate-pulse">Syncing with Firestore...</td></tr>`;
  selectors.emptyState.classList.add("hidden");

  try {
    const usersCol = collection(db, "users");
    let q = query(usersCol, orderBy("email"), limit(50));

    // Email Search Filter
    const searchEmail = selectors.filterEmail.value.trim();
    if (searchEmail) {
      q = query(usersCol, where("email", "==", searchEmail));
    }

    const snap = await getDocs(q);
    selectors.tbody.innerHTML = "";
    selectors.resultsCount.textContent = `${snap.docs.length} Student${snap.docs.length === 1 ? '' : 's'}`;

    if (snap.empty) {
        selectors.emptyState.classList.remove("hidden");
    } else {
        snap.docs.forEach(d => selectors.tbody.appendChild(renderUserRow(d.id, d.data())));
    }
  } catch (e) {
    selectors.tbody.innerHTML = `<tr><td colspan="5" class="py-20 text-center text-red-500 font-bold">Query Error: ${e.message}</td></tr>`;
  }
}

/* -----------------------------------
   INITIALIZATION
----------------------------------- */

async function boot() {
  await initializeServices();
  const clients = getInitializedClients();
  db = clients.db;
  auth = clients.auth;

  auth.onAuthStateChanged(async user => {
    if (!user || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
        alert("Access Blocked: Not an authorized admin.");
        location.href = "../index.html";
        return;
    }
    selectors.currentAdminEmail.textContent = user.email;
    fetchUsers();
  });

  // Event Listeners
  selectors.applyFilters.onclick = fetchUsers;
  selectors.refreshBtn.onclick = fetchUsers;
  selectors.clearFilters.onclick = () => { selectors.filterEmail.value = ""; fetchUsers(); };
  selectors.logoutBtn.onclick = async () => { await signOut(); location.href = "../index.html"; };
}

boot();
