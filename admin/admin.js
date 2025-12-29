// ✅ STABLE ADMIN DASHBOARD (No Reload Loops)
import { initializeServices, getInitializedClients } from "../template/js/config.js"; 
import { collection, query, limit, getDocs, where, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const ADMIN_EMAILS = ["keshav.karn@gmail.com", "ready4urexam@gmail.com"];
let db, auth;

// DOM Elements
const selectors = { 
  tbody: document.getElementById("users-tbody"), 
  resultsCount: document.getElementById("results-count"), 
  filterEmail: document.getElementById("filter-email"), 
  applyFilters: document.getElementById("apply-filters"), 
  clearFilters: document.getElementById("clear-filters"), 
  refreshBtn: document.getElementById("refresh-btn"), 
  logoutBtn: document.getElementById("logout-btn"), 
  currentAdminEmail: document.getElementById("current-admin-email"),
  // We will toggle this container's visibility
  mainContent: document.querySelector('main'),
  headerContent: document.querySelector('header')
};

/* ==========================================================================
   1. VIEW MANAGEMENT (Hide/Show Dashboard instead of Destroying it)
   ========================================================================== */

function setDashboardVisibility(visible) {
  const displayStyle = visible ? 'block' : 'none';
  if (selectors.mainContent) selectors.mainContent.style.display = displayStyle;
  if (selectors.headerContent) selectors.headerContent.style.display = displayStyle;
  
  // If we are showing the dashboard, remove any existing overlays
  if (visible) {
    const overlay = document.getElementById('admin-overlay');
    if (overlay) overlay.remove();
  }
}

function showOverlay(type, message = "") {
  // Hide dashboard while overlay is active
  setDashboardVisibility(false);

  // Remove existing overlay to prevent duplicates
  const existing = document.getElementById('admin-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'admin-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: #f8fafc; display: flex; align-items: center; justify-content: center;
    z-index: 9999; font-family: 'Inter', sans-serif;
  `;

  if (type === 'LOADING') {
    overlay.innerHTML = `
      <div style="text-align:center;">
         <div style="width:40px; height:40px; border:4px solid #e2e8f0; border-top-color:#1a3e6a; border-radius:50%; animation:spin 1s linear infinite; margin:0 auto;"></div>
         <p style="margin-top:20px; color:#64748b; font-weight:bold;">${message}</p>
         <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
      </div>
    `;
  } else if (type === 'LOGIN') {
    overlay.innerHTML = `
      <div style="background: white; padding: 40px; border-radius: 24px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 90%;">
        <div style="width: 60px; height: 60px; background: #eff6ff; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
          <svg style="width: 30px; height: 30px; color: #1a3e6a;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
        </div>
        <h2 style="color: #1a3e6a; font-weight: 900; font-size: 24px; margin-bottom: 8px;">${message}</h2>
        <p style="color: #64748b; font-size: 14px; margin-bottom: 30px;">Restricted Access. Please sign in.</p>
        <button id="google-login-btn" style="width: 100%; background: #1a3e6a; color: white; padding: 14px; border-radius: 12px; border: none; font-weight: bold; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;">
          Sign in with Google
        </button>
      </div>
    `;
  }
  
  document.body.appendChild(overlay);

  if (type === 'LOGIN') {
    document.getElementById("google-login-btn").addEventListener("click", handleAdminLogin);
  }
}

/* ==========================================================================
   2. AUTHENTICATION HANDLERS
   ========================================================================== */

async function handleAdminLogin() {
  const btn = document.getElementById("google-login-btn");
  if(btn) { btn.innerText = "Verifying..."; btn.disabled = true; }

  try {
    await setPersistence(auth, browserLocalPersistence);
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    if (ADMIN_EMAILS.some(email => email.toLowerCase() === user.email.toLowerCase())) {
      // ✅ SUCCESS: Just reveal dashboard, NO RELOAD
      setDashboardVisibility(true);
      selectors.currentAdminEmail.textContent = user.email;
      fetchUsers();
    } else {
      await signOut(auth);
      alert("Access Denied: " + user.email + " is not an authorized admin.");
      showOverlay('LOGIN', "Access Denied");
    }
  } catch (error) {
    console.error("Login Error:", error);
    alert("Login failed: " + error.message);
    if(btn) { btn.innerText = "Sign in with Google"; btn.disabled = false; }
  }
}

/* ==========================================================================
   3. DATA MANAGEMENT (User Table)
   ========================================================================== */

async function updateField(uid, obj) {
  try { 
    await updateDoc(doc(db, "users", uid), obj); 
    // We do NOT reload the page. We just fetch the list again to show updates.
    await fetchUsers(); 
  } catch (e) { 
    console.error("Update Failed:", e);
    alert("Update failed: " + e.message); 
  }
}

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
  dateInput.onchange = async (e) => { 
    const val = e.target.value ? new Date(e.target.value).toISOString() : null; 
    await updateField(uid, { accessExpiryDate: val }); 
  };
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
    // PREVENT DEFAULT to stop any form submission quirks
    btn.onclick = (e) => { e.preventDefault(); updateField(uid, { [`paidClasses.${c}`]: !active }); };
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
    btn.onclick = (e) => { e.preventDefault(); updateField(uid, { streams: active ? "" : s }); };
    streamTd.appendChild(btn);
  });
  tr.appendChild(streamTd);

  // --- REVOKE ACTION (Fixed & Stable) ---
  const actionTd = document.createElement("td");
  actionTd.className = "px-8 py-5 text-right";
  const revoke = document.createElement("button");
  revoke.className = "text-red-400 font-bold text-[10px] uppercase tracking-widest hover:text-red-600 transition-colors";
  revoke.textContent = "Revoke Access";
  
  revoke.onclick = (e) => { 
    e.preventDefault(); // Stop any weird button behavior
    if(confirm("End user evaluation period? (This will block access immediately)")) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      // Calls updateField which does NOT reload the page
      updateField(uid, { paidClasses: {}, streams: "", accessExpiryDate: yesterday.toISOString() }); 
    } 
  };
  
  actionTd.appendChild(revoke);
  tr.appendChild(actionTd);
  return tr;
}

async function fetchUsers() {
  selectors.tbody.innerHTML = ""; 
  try {
    const usersCol = collection(db, "users");
    let q = query(usersCol, limit(20));
    const searchEmail = selectors.filterEmail.value.trim();
    if (searchEmail) q = query(usersCol, where("email", "==", searchEmail));
    
    const snap = await getDocs(q);
    selectors.resultsCount.textContent = snap.docs.length;
    
    if (snap.empty) { 
      document.getElementById("empty-state").classList.remove("hidden"); 
    } else { 
      document.getElementById("empty-state").classList.add("hidden"); 
      snap.docs.forEach(d => selectors.tbody.appendChild(renderUserRow(d.id, d.data()))); 
    }
  } catch (e) { 
    selectors.tbody.innerHTML = `<tr><td colspan='5' class='py-20 text-center text-red-500 font-black'>Error: ${e.message}</td></tr>`; 
  }
}

/* ==========================================================================
   4. BOOTSTRAP (The "Main" Function)
   ========================================================================== */

async function boot() {
  try {
    // 1. Show Loading Overlay immediately
    showOverlay('LOADING', 'Connecting to Admin Console...');

    await initializeServices();
    const clients = getInitializedClients();
    db = clients.db; 
    auth = clients.auth;

    // 2. Listen for Auth State
    auth.onAuthStateChanged(async (user) => {
      // If user is logged out, show Login Overlay
      if (!user) {
        showOverlay('LOGIN', 'Admin Access Required');
        return;
      }

      // If user is logged in, check if they are an Admin
      if (ADMIN_EMAILS.some(e => e.toLowerCase() === user.email.toLowerCase())) {
        // ✅ SUCCESS: Reveal Dashboard and Load Data
        selectors.currentAdminEmail.textContent = user.email;
        setDashboardVisibility(true); // This removes the overlay
        fetchUsers();
      } else {
        // Logged in but not allowed
        showOverlay('LOGIN', 'Access Denied: Unauthorized Email');
      }
    });

    // 3. Attach Global Event Listeners
    selectors.applyFilters.onclick = fetchUsers;
    selectors.refreshBtn.onclick = fetchUsers;
    selectors.clearFilters.onclick = () => { selectors.filterEmail.value = ""; fetchUsers(); };
    selectors.logoutBtn.onclick = async () => { 
      await signOut(auth); 
      // Auth state change listener will handle showing the login screen automatically
    };

  } catch (err) { 
    console.error("Boot Error:", err);
    document.body.innerHTML = `<div style="padding:40px; text-align:center; color:red; font-weight:bold;">SYSTEM ERROR: ${err.message}</div>`;
  }
}

boot();
