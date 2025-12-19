// admin/admin.js - Production Manual Override Control
import { initializeServices, getInitializedClients } from "../template/js/config.js";
import { 
  collection, query, orderBy, limit, getDocs, where, doc, updateDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { signOut } from "../template/js/auth-paywall.js";

// 1. SECURITY: Whitelisted Admin Emails
const ADMIN_EMAILS = ["keshav.karn@gmail.com", "ready4urexam@gmail.com"];

let db, auth;
const selectors = {
  tbody: document.getElementById("users-tbody"),
  resultsCount: document.getElementById("results-count"),
  filterEmail: document.getElementById("filter-email"),
  applyFilters: document.getElementById("apply-filters"),
  clearFilters: document.getElementById("clear-filters"),
  refreshBtn: document.getElementById("refresh-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  currentAdminEmail: document.getElementById("current-admin-email")
};

/* -----------------------------------
   UI RENDERING
----------------------------------- */

function renderUserRow(uid, data) {
  const tr = document.createElement("tr");
  tr.className = "border-b border-slate-100 hover:bg-slate-50 transition";

  // Identification Column
  tr.innerHTML = `
    <td class="px-6 py-4">
      <div class="font-bold text-slate-800">${data.email || 'No Email'}</div>
      <div class="text-[9px] text-slate-400 font-mono tracking-tighter">${uid}</div>
    </td>`;

  // Manual Expiry (Only triggers if YOU set a date)
  const expiryTd = document.createElement("td");
  expiryTd.className = "px-6 py-4";
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "text-xs border rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-cbse-blue";
  if (data.accessExpiryDate) dateInput.value = data.accessExpiryDate.split('T')[0];
  dateInput.onchange = async (e) => await updateField(uid, { 
      accessExpiryDate: e.target.value ? new Date(e.target.value).toISOString() : null 
  });
  expiryTd.appendChild(dateInput);
  tr.appendChild(expiryTd);

  // Paid Classes (6-12)
  const classesTd = document.createElement("td");
  classesTd.className = "px-6 py-4 flex flex-wrap gap-1 max-w-[200px]";
  ["6","7","8","9","10","11","12"].forEach(c => {
    const active = data.paidClasses && data.paidClasses[c];
    const btn = document.createElement("button");
    btn.className = `w-7 h-7 rounded-lg text-[10px] font-black transition-all ${active ? 'bg-green-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`;
    btn.textContent = c;
    btn.onclick = () => updateField(uid, { [`paidClasses.${c}`]: !active });
    classGrid.appendChild(btn); // Fixed Reference
    classesTd.appendChild(btn);
  });
  tr.appendChild(classesTd);

  // Stream Assignment (Science/Commerce/Arts)
  const streamTd = document.createElement("td");
  streamTd.className = "px-6 py-4 space-x-2";
  ["science", "commerce", "arts"].forEach(s => {
    const active = data.streams === s;
    const btn = document.createElement("button");
    btn.className = `px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${active ? 'bg-cbse-blue text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`;
    btn.textContent = s;
    btn.onclick = () => updateField(uid, { streams: active ? "" : s });
    streamTd.appendChild(btn);
  });
  tr.appendChild(streamTd);

  // Revoke All Action
  const actionTd = document.createElement("td");
  actionTd.className = "px-6 py-4 text-right";
  const revoke = document.createElement("button");
  revoke.className = "text-red-400 font-bold text-[10px] uppercase tracking-widest hover:text-red-600";
  revoke.textContent = "Revoke All";
  revoke.onclick = () => { if(confirm("Revoke all access for this user?")) updateField(uid, { paidClasses: {}, streams: "" }); };
  actionTd.appendChild(revoke);
  tr.appendChild(actionTd);

  return tr;
}

/* -----------------------------------
   DATA OPERATIONS
----------------------------------- */

async function updateField(uid, obj) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, obj);
    await fetchUsers(); // Immediate UI Refresh
  } catch (e) {
    alert("Update failed: " + e.message);
  }
}

async function fetchUsers() {
  selectors.tbody.innerHTML = "<tr><td colspan='5' class='py-20 text-center text-slate-400 font-bold'>Syncing Student Records...</td></tr>";
  try {
    const usersCol = collection(db, "users");
    let q = query(usersCol, limit(20));

    // Handle Manual Email Search
    const searchEmail = selectors.filterEmail.value.trim();
    if (searchEmail) {
      q = query(usersCol, where("email", "==", searchEmail));
    }

    const snap = await getDocs(q);
    selectors.tbody.innerHTML = "";
    selectors.resultsCount.textContent = `${snap.docs.length} Users Found`;
    
    if (snap.empty) {
        selectors.tbody.innerHTML = "<tr><td colspan='5' class='py-20 text-center text-slate-400'>No users found.</td></tr>";
    } else {
        snap.docs.forEach(d => selectors.tbody.appendChild(renderUserRow(d.id, d.data())));
    }
  } catch (e) {
    selectors.tbody.innerHTML = `<tr><td colspan='5' class='py-20 text-center text-red-500'>Error: ${e.message}</td></tr>`;
  }
}

/* -----------------------------------
   INITIALIZATION & BOOT
----------------------------------- */

async function boot() {
  await initializeServices();
  const clients = getInitializedClients();
  db = clients.db;
  auth = clients.auth;

  // Verify Admin Authentication
  auth.onAuthStateChanged(user => {
    if (!user || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
        alert("Access Denied: Admin role required.");
        location.href = "../index.html";
        return;
    }
    selectors.currentAdminEmail.textContent = user.email;
    fetchUsers();
  });

  // Attach Event Handlers
  selectors.applyFilters.onclick = fetchUsers;
  selectors.refreshBtn.onclick = fetchUsers;
  selectors.clearFilters.onclick = () => { selectors.filterEmail.value = ""; fetchUsers(); };
  selectors.logoutBtn.onclick = async () => { await signOut(); location.href = "../index.html"; };
}

boot();
