import { initializeServices, getInitializedClients } from "../template/js/config.js";
import { 
  collection, query, limit, getDocs, where, doc, updateDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { signOut } from "../template/js/auth-paywall.js";

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

/**
 * DRY RUN CHECK 1: updateField
 * Updates Firestore and triggers a UI refresh.
 */
async function updateField(uid, obj) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, obj);
    await fetchUsers(); 
  } catch (e) {
    console.error("Update failed:", e);
    alert("Update failed: " + e.message);
  }
}

/**
 * DRY RUN CHECK 2: renderUserRow
 * Generates the HTML for each user. Defined before fetchUsers to avoid ReferenceErrors.
 */
function renderUserRow(uid, data) {
  const tr = document.createElement("tr");
  tr.className = "border-b border-slate-100 hover:bg-slate-50 transition";

  tr.innerHTML = `
    <td class="px-8 py-5">
      <div class="font-bold text-slate-800 text-sm">${data.email || 'No Email'}</div>
      <div class="text-[9px] text-slate-400 font-mono mt-1 tracking-tighter">${uid}</div>
    </td>`;

  // Expiry Column
  const expiryTd = document.createElement("td");
  expiryTd.className = "px-8 py-5";
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-cbse-blue outline-none";
  if (data.accessExpiryDate) dateInput.value = data.accessExpiryDate.split('T')[0];
  dateInput.onchange = async (e) => {
      const val = e.target.value ? new Date(e.target.value).toISOString() : null;
      await updateField(uid, { accessExpiryDate: val });
  };
  expiryTd.appendChild(dateInput);
  tr.appendChild(expiryTd);

  // Class Toggles (6-12)
  const classesTd = document.createElement("td");
  classesTd.className = "px-8 py-5 flex flex-wrap gap-1.5 max-w-[240px]";
  ["6","7","8","9","10","11","12"].forEach(c => {
    const active = data.paidClasses && data.paidClasses[c];
    const btn = document.createElement("button");
    btn.className = `w-8 h-8 rounded-xl text-[10px] font-black transition-all ${active ? 'bg-green-600 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`;
    btn.textContent = c;
    btn.onclick = () => updateField(uid, { [`paidClasses.${c}`]: !active });
    classesTd.appendChild(btn);
  });
  tr.appendChild(classesTd);

  // Stream Selection
  const streamTd = document.createElement("td");
  streamTd.className = "px-8 py-5 space-x-2";
  ["science", "commerce", "arts"].forEach(s => {
    const active = data.streams === s;
    const btn = document.createElement("button");
    btn.className = `px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${active ? 'bg-cbse-blue text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`;
    btn.textContent = s;
    btn.onclick = () => updateField(uid, { streams: active ? "" : s });
    streamTd.appendChild(btn);
  });
  tr.appendChild(streamTd);

  // Revoke Action
  const actionTd = document.createElement("td");
  actionTd.className = "px-8 py-5 text-right";
  const revoke = document.createElement("button");
  revoke.className = "text-red-400 font-bold text-[10px] uppercase tracking-widest hover:text-red-600 transition-colors";
  revoke.textContent = "Reset Access";
  revoke.onclick = () => { if(confirm("Revoke all access for this student?")) updateField(uid, { paidClasses: {}, streams: "" }); };
  actionTd.appendChild(revoke);
  tr.appendChild(actionTd);

  return tr;
}

/**
 * DRY RUN CHECK 3: fetchUsers
 * Clears the revolving spinner and populates the table.
 */
async function fetchUsers() {
  selectors.tbody.innerHTML = ""; // This kills the revolving circle
  
  try {
    const usersCol = collection(db, "users");
    let q = query(usersCol, limit(20));

    const searchEmail = selectors.filterEmail.value.trim();
    if (searchEmail) {
      q = query(usersCol, where("email", "==", searchEmail));
    }

    const snap = await getDocs(q);
    selectors.resultsCount.textContent = snap.docs.length;
    
    if (snap.empty) {
        document.getElementById("empty-state").classList.remove("hidden");
    } else {
        document.getElementById("empty-state").classList.add("hidden");
        snap.docs.forEach(d => {
            selectors.tbody.appendChild(renderUserRow(d.id, d.data()));
        });
    }
  } catch (e) {
    console.error("Fetch Error:", e);
    selectors.tbody.innerHTML = `<tr><td colspan='5' class='py-20 text-center text-red-500 font-black'>Error: ${e.message}</td></tr>`;
  }
}

/**
 * DRY RUN CHECK 4: boot
 * Connects to config.js and verifies Admin status.
 */
async function boot() {
  try {
    await initializeServices();
    const clients = getInitializedClients();
    db = clients.db;
    auth = clients.auth;

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        location.href = "../index.html";
        return;
      }

      const emailLower = user.email.toLowerCase();
      
      // Allow if email is in whitelist
      if (ADMIN_EMAILS.includes(emailLower)) {
        selectors.currentAdminEmail.textContent = user.email;
        fetchUsers();
      } else {
        // Double check Firestore for role before kicking them out
        alert("Unauthorized Access. Redirecting...");
        location.href = "../index.html";
      }
    });

    // Event Binding
    selectors.applyFilters.onclick = fetchUsers;
    selectors.refreshBtn.onclick = fetchUsers;
    selectors.clearFilters.onclick = () => { selectors.filterEmail.value = ""; fetchUsers(); };
    selectors.logoutBtn.onclick = async () => { await signOut(); location.href = "../index.html"; };

  } catch (err) {
    console.error("Boot Error:", err);
    selectors.tbody.innerHTML = `<tr><td colspan='5' class='py-20 text-center text-red-500 font-black'>System Initialization Failed: ${err.message}</td></tr>`;
  }
}

boot();
