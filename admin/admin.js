// ✅ PERSISTENT ADMIN DASHBOARD
import { initializeServices, getInitializedClients } from "../template/js/config.js"; 
import { collection, query, limit, getDocs, where, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// NEW: Import persistence functions
import { GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

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

// --- 0. LOADING SCREEN ( Prevents Flicker ) ---
function showLoading() {
  document.body.innerHTML = `
    <div style="height:100vh; display:flex; justify-content:center; align-items:center; background:#f8fafc; flex-direction:column;">
       <div style="width:40px; height:40px; border:4px solid #e2e8f0; border-top-color:#1a3e6a; border-radius:50%; animation:spin 1s linear infinite;"></div>
       <p style="margin-top:15px; font-family:sans-serif; color:#64748b; font-weight:bold;">Verifying Admin Access...</p>
       <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </div>
  `;
}

// --- 1. LOGIN SCREEN ---
function showLoginScreen(message = "Admin Access Required") {
  document.body.innerHTML = `
    <div style="min-height: 100vh; background: #f8fafc; display: flex; align-items: center; justify-content: center; font-family: 'Inter', sans-serif;">
      <div style="background: white; padding: 40px; border-radius: 24px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1); text-align: center; max-width: 400px; width: 90%;">
        <div style="width: 60px; height: 60px; background: #eff6ff; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
          <svg style="width: 30px; height: 30px; color: #1a3e6a;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
        </div>
        <h2 style="color: #1a3e6a; font-weight: 900; font-size: 24px; margin-bottom: 8px;">${message}</h2>
        <p style="color: #64748b; font-size: 14px; margin-bottom: 30px; line-height: 1.5;">
          This portal is restricted to authorized administrators only. Please sign in to continue.
        </p>
        <button id="google-login-btn" style="width: 100%; background: #1a3e6a; color: white; padding: 14px; border-radius: 12px; border: none; font-weight: bold; font-size: 15px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 10px;">
          Sign in with Google
        </button>
      </div>
    </div>
  `;
  document.getElementById("google-login-btn").addEventListener("click", handleAdminLogin);
}

// --- 2. LOGIN HANDLER (With Persistence) ---
async function handleAdminLogin() {
  const btn = document.getElementById("google-login-btn");
  btn.innerText = "Verifying...";
  btn.disabled = true;

  try {
    // 🔥 CRITICAL: Force session to stay "LOCAL" (Permanent until logout)
    await setPersistence(auth, browserLocalPersistence);
    
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    if (ADMIN_EMAILS.some(email => email.toLowerCase() === user.email.toLowerCase())) {
      location.reload(); 
    } else {
      await signOut(auth);
      alert("ACCESS DENIED: " + user.email + " is not an admin.");
      btn.innerText = "Try Different Account";
      btn.disabled = false;
    }
  } catch (error) {
    console.error("Login Error:", error);
    btn.innerText = "Sign in with Google";
    btn.disabled = false;
    alert("Login failed: " + error.message);
  }
}

// --- 3. GENERIC UPDATE FUNCTION ---
async function updateField(uid, obj) {
  try { await updateDoc(doc(db, "users", uid), obj); await fetchUsers(); } 
  catch (e) { alert("Update failed: " + e.message); }
}

// --- 4. RENDER ROW ---
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
      updateField(uid, { paidClasses: {}, streams: "", accessExpiryDate: yesterday.toISOString() }); 
    } 
  };
  
  actionTd.appendChild(revoke);
  tr.appendChild(actionTd);
  return tr;
}

// --- 5. CORE FETCH LOGIC ---
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
    
    // 🔥 SHOW LOADER INITIALLY (Prevents flickering Login screen)
    let isInitialLoad = true;
    showLoading();

    auth.onAuthStateChanged(async (user) => {
      // If no user found, show login screen
      if (!user) {
        showLoginScreen("Admin Access Required");
        isInitialLoad = false;
        return;
      }
      
      // If user found, check if they are admin
      if (ADMIN_EMAILS.some(e => e.toLowerCase() === user.email.toLowerCase())) {
        // If this is the first load, RE-RENDER the dashboard HTML because we wiped it with showLoading()
        if (isInitialLoad) {
           location.reload(); // Simplest way to restore the dashboard HTML
           return;
        }
        selectors.currentAdminEmail.textContent = user.email;
        fetchUsers();
      } else {
        showLoginScreen("Access Denied");
      }
      isInitialLoad = false;
    });

    selectors.applyFilters.onclick = fetchUsers;
    selectors.refreshBtn.onclick = fetchUsers;
    selectors.clearFilters.onclick = () => { selectors.filterEmail.value = ""; fetchUsers(); };
    selectors.logoutBtn.onclick = async () => { await signOut(auth); location.reload(); };
  } catch (err) { 
    console.error("Boot Error:", err);
    document.body.innerHTML = `<div style="padding:40px; text-align:center; color:red; font-weight:bold;">SYSTEM ERROR: ${err.message}</div>`;
  }
}
boot();
