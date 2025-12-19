// admin/admin.js
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

// ... (keep your renderUserRow and updateField functions here) ...

async function fetchUsers() {
  // CRITICAL: This line removes the "Revolving Circle" spinner
  selectors.tbody.innerHTML = ""; 
  
  try {
    const usersCol = collection(db, "users");
    let q = query(usersCol, limit(20));

    if (selectors.filterEmail.value.trim()) {
      q = query(usersCol, where("email", "==", selectors.filterEmail.value.trim()));
    }

    const snap = await getDocs(q);
    selectors.resultsCount.textContent = snap.docs.length;
    
    if (snap.empty) {
        document.getElementById("empty-state").classList.remove("hidden");
    } else {
        document.getElementById("empty-state").classList.add("hidden");
        snap.docs.forEach(d => selectors.tbody.appendChild(renderUserRow(d.id, d.data())));
    }
  } catch (e) {
    console.error(e);
    selectors.tbody.innerHTML = `<tr><td colspan='5' class='py-10 text-center text-red-500 font-bold'>Error: ${e.message}</td></tr>`;
  }
}

async function boot() {
  try {
    await initializeServices();
    const clients = getInitializedClients();
    db = clients.db; 
    auth = clients.auth;

    auth.onAuthStateChanged(user => {
      if (!user || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
          alert("Access Denied: Please login with an Admin email.");
          location.href = "../index.html";
          return;
      }
      selectors.currentAdminEmail.textContent = user.email;
      fetchUsers();
    });
  } catch (err) {
    // If initialization fails, show the error instead of spinning forever
    selectors.tbody.innerHTML = `<tr><td colspan='5' class='py-10 text-center text-red-500 font-bold'>Init Failed: ${err.message}</td></tr>`;
  }
}

boot();
