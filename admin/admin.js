import { initializeServices, getInitializedClients } from "../js/config.js"; 
import { collection, query, limit, getDocs, where, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { signOut } from "../js/auth-paywall.js"; 

const ADMIN_EMAILS = ["keshav.karn@gmail.com", "ready4urexam@gmail.com"];
let db, auth;
const selectors = { tbody: document.getElementById("users-tbody"), resultsCount: document.getElementById("results-count"), filterEmail: document.getElementById("filter-email"), applyFilters: document.getElementById("apply-filters"), clearFilters: document.getElementById("clear-filters"), refreshBtn: document.getElementById("refresh-btn"), logoutBtn: document.getElementById("logout-btn"), currentAdminEmail: document.getElementById("current-admin-email") };

async function updateField(uid, obj) {
  try { await updateDoc(doc(db, "users", uid), obj); await fetchUsers(); } 
  catch (e) { alert("Update failed: " + e.message); }
}

function renderUserRow(uid, data) {
  const tr = document.createElement("tr");
  tr.className = "border-b border-slate-100 hover:bg-slate-50 transition";
  
  // PURPLE BADGE LOGIC
  const isTelangana = data.paidClasses && data.paidClasses["TS_9"];
  const badgeHtml = isTelangana ? `<span class="bg-purple-100 text-purple-700 text-[9px] px-2 py-0.5 rounded ml-2 uppercase font-black tracking-wider border border-purple-200">SCERT / TS</span>` : ``;

  tr.innerHTML = `<td class="px-8 py-5"><div class="flex items-center"><div class="font-bold text-slate-800 text-sm">${data.email || 'No Email'}</div>${badgeHtml}</div><div class="text-[9px] text-slate-400 font-mono mt-1 tracking-tighter">${uid}</div></td>`;

  const expiryTd = document.createElement("td");
  expiryTd.className = "px-8 py-5";
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-cbse-blue outline-none";
  if (data.accessExpiryDate) dateInput.value = data.accessExpiryDate.split('T')[0];
  dateInput.onchange = async (e) => { const val = e.target.value ? new Date(e.target.value).toISOString() : null; await updateField(uid, { accessExpiryDate: val }); };
  expiryTd.appendChild(dateInput);
  tr.appendChild(expiryTd);

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

  const actionTd = document.createElement("td");
  actionTd.className = "px-8 py-5 text-right";
  const revoke = document.createElement("button");
  revoke.className = "text-red-400 font-bold text-[10px] uppercase tracking-widest hover:text-red-600 transition-colors";
  revoke.textContent = "Reset Access";
  revoke.onclick = () => { if(confirm("Revoke all access?")) updateField(uid, { paidClasses: {}, streams: "" }); };
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
      if (!user || !ADMIN_EMAILS.some(e => e.toLowerCase() === user.email.toLowerCase())) return location.href = "../index.html";
      selectors.currentAdminEmail.textContent = user.email;
      fetchUsers();
    });
    selectors.applyFilters.onclick = fetchUsers;
    selectors.refreshBtn.onclick = fetchUsers;
    selectors.clearFilters.onclick = () => { selectors.filterEmail.value = ""; fetchUsers(); };
    selectors.logoutBtn.onclick = async () => { await signOut(); location.href = "../index.html"; };
  } catch (err) { selectors.tbody.innerHTML = `<tr><td colspan='5' class='py-20 text-center text-red-500 font-black'>Init Failed: ${err.message}</td></tr>`; }
}
boot();
