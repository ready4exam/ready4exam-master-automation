// ✅ SAFE MODE ADMIN.JS
// 1. Imports assuming file is in 'admin/admin.js' and template is sibling
import { initializeServices, getInitializedClients } from "../template/js/config.js"; 
import { collection, query, limit, getDocs, where, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
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

// --- GENERIC UPDATE FUNCTION ---
async function updateField(uid, obj) {
  try { await updateDoc(doc(db, "users", uid), obj); await fetchUsers(); } 
  catch (e) { alert("Update failed: " + e.message); }
}

// --- RENDER ROW ---
function renderUserRow(uid, data) {
  const tr = document.createElement("tr");
  tr.className = "border-b border-slate-100 hover:bg-slate-50 transition";
  
  const isTelangana = data.paidClasses && data.paidClasses["TS_9"];
  const badgeHtml = isTelangana 
    ? `<span class="bg-purple-100 text-purple-700 text-[9px] px-2 py-0.5 rounded ml-2 uppercase font-black tracking-wider border border-purple-200">SCERT / TS</span>` 
    : ``;

  tr.innerHTML = `
    <td class="px-8 py-5">
      <div class="flex items-center">
          <div class="font-bold text-slate-800 text-sm">${data.email || 'No Email'}</div>
          ${badgeHtml}
      </div>
      <div class="text-[9px] text-slate-400 font-mono mt-1 tracking-tighter">${uid}</div>
    </td>`;

  // Expiry Date
  const expiryTd = document.createElement("td");
  expiryTd.className = "px-8 py-5";
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-cbse-blue outline-none";
  if (data.accessExpiryDate) dateInput.value = data.accessExpiryDate.split('T')[0];
  dateInput.onchange = async (e) => { const val = e.target.value ? new Date(e.target.value).toISOString() : null; await updateField(uid, { accessExpiryDate: val }); };
  expiryTd.appendChild(dateInput);
  tr.appendChild(expiryTd);

  // Class Buttons
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

  // Stream Buttons
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

  // --- REVOKE ACTION (Sets Date to Yesterday) ---
  const actionTd = document.createElement("td");
  actionTd.className = "px-8 py-5 text-right";
  const revoke = document.createElement("button");
  revoke.className = "text-red-400 font-bold text-[10px] uppercase tracking-widest hover:text-red-600 transition-colors";
  revoke.textContent = "Revoke Access";
  
  revoke.onclick = () => { 
    if(confirm("End user evaluation period? (This will block access immediately)")) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      updateField(uid, { 
        paidClasses: {}, 
        streams: "",
        accessExpiryDate: yesterday.toISOString() 
      }); 
    } 
  };
  
  actionTd.appendChild(revoke);
  tr.appendChild(actionTd);
  return tr;
}

// --- CORE FETCH LOGIC ---
async function fetchUsers() {
  selectors.tbody.innerHTML = ""; 
  try {
    const usersCol = collection(db, "users");
    let q = query(usersCol, limit(20));
    const searchEmail = selectors.filterEmail.value.trim();
    if (searchEmail) q = query(usersCol, where("email", "==", searchEmail));
    const snap = await getDocs(q);
    selectors.resultsCount.textContent = snap.docs.length;
    if (snap.empty) { document.getElementById("empty-state").classList.remove("hidden"); } 
    else { document.getElementById("empty-state").classList.add("hidden"); snap.docs.forEach(d => selectors.tbody.appendChild(renderUserRow(d.id, d.data()))); }
  } catch (e) { selectors.tbody.innerHTML = `<tr><td colspan='5' class='py-20 text-center text-red-500 font-black'>Access Denied: ${e.message}</td></tr>`; }
}

async function boot() {
  try {
    await initializeServices();
    const clients = getInitializedClients();
    db = clients.db; auth = clients.auth;
    
    auth.onAuthStateChanged(async (user) => {
      // 🚨 DEBUG MODE: STOP REDIRECT LOOP
      // If user is not logged in, we show a button instead of crashing with 404
      if (!user || !ADMIN_EMAILS.some(e => e.toLowerCase() === user.email.toLowerCase())) {
         document.body.innerHTML = `
           <div style="display:flex; height:100vh; justify-content:center; align-items:center; flex-direction:column; background:#f8fafc; font-family:sans-serif;">
              <h2 style="color:#1e293b; font-weight:900; font-size:24px;">Admin Access Required</h2>
              <p style="color:#64748b; margin-bottom:20px;">You are not logged in as an administrator.</p>
              <a href="../index.html" style="background:#1a3e6a; color:white; padding:12px 24px; text-decoration:none; border-radius:12px; font-weight:bold;">Go to Login Page</a>
           </div>
         `;
         return;
      }
      
      selectors.currentAdminEmail.textContent = user.email;
      fetchUsers();
    });

    selectors.applyFilters.onclick = fetchUsers;
    selectors.refreshBtn.onclick = fetchUsers;
    selectors.clearFilters.onclick = () => { selectors.filterEmail.value = ""; fetchUsers(); };
    selectors.logoutBtn.onclick = async () => { await signOut(); location.href = "../index.html"; };
  } catch (err) { 
    console.error("Boot Error:", err);
    // If imports fail, this will show on screen
    document.body.innerHTML = `<div style="padding:40px; text-align:center; color:red; font-weight:bold;">SCRIPT ERROR: ${err.message}<br><br>Check your Console (F12) for details.</div>`;
  }
}
boot();
