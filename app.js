// ============================================================
//  الحوزة الذهبية — app.js
//  Firebase Firestore + full offline support (IndexedDB cache)
// ============================================================
import { initializeApp }        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs,
         deleteDoc, updateDoc, onSnapshot, enableIndexedDbPersistence,
         serverTimestamp, query, orderBy, where }
         from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ──────────────────────────────────────────────
//  Firebase init
// ──────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBCcFRkN-g8_qrDk8X2BUWu0_MWFQmOiz8",
  authDomain: "seminary-6f774.firebaseapp.com",
  projectId: "seminary-6f774",
  storageBucket: "seminary-6f774.firebasestorage.app",
  messagingSenderId: "459732986404",
  appId: "1:459732986404:web:8b052b16e28e437b8ac6b1",
  measurementId: "G-XB3BTMTCND"
};
const fireApp = initializeApp(firebaseConfig);
const db      = getFirestore(fireApp);

// Enable offline persistence
enableIndexedDbPersistence(db).catch(e => console.warn("Persistence:", e.code));

// ──────────────────────────────────────────────
//  Hardcoded admin accounts
// ──────────────────────────────────────────────
const ADMINS = [
  { username: "aaaaa", password: "123456", name: "المشرف الأول" },
  { username: "sssss", password: "123456", name: "المشرف الثاني" },
  { username: "ddddd", password: "123456", name: "المشرف الثالث" },
  { username: "fffff", password: "123456", name: "المشرف الرابع" },
  { username: "ggggg", password: "123456", name: "المشرف الخامس" }
];

// ──────────────────────────────────────────────
//  App State
// ──────────────────────────────────────────────
let currentUser   = null;   // { role, id, data }
let currentTab    = "admin";
let editStudentId = null;
let confirmCb     = null;
let allStudents   = [];
let allParents    = [];
let allQuestions  = [];
let allLessons    = [];
let attendanceMap = {};     // { studentId: 'present'|'absent' }
let currentAttendDate = todayStr();
let scheduleView  = "weekly";
let pendingParentStudentId = null;

// ──────────────────────────────────────────────
//  Boot sequence
// ──────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  // Check saved session
  const saved = localStorage.getItem("hawzaSession");
  if (saved) {
    currentUser = JSON.parse(saved);
    setTimeout(() => hideSplash(), 800);
  } else {
    setTimeout(() => { hideSplash(); showScreen("loginScreen"); }, 1800);
  }
  setTodayDate();

  // Tab buttons
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      const label = document.getElementById("loginLabel");
      if (currentTab === "parent") label.textContent = "رقم الهاتف";
      else label.textContent = "اسم المستخدم";
    });
  });

  // Enter key on login
  document.getElementById("loginPass").addEventListener("keydown", e => {
    if (e.key === "Enter") doLogin();
  });
});

function hideSplash() {
  const splash = document.getElementById("splash");
  splash.style.opacity = "0";
  splash.style.transition = "opacity 0.5s";
  setTimeout(() => {
    splash.style.display = "none";
    if (currentUser) enterDashboard();
  }, 500);
}

// ──────────────────────────────────────────────
//  Auth
// ──────────────────────────────────────────────
window.doLogin = async function() {
  const userVal = document.getElementById("loginUser").value.trim();
  const passVal = document.getElementById("loginPass").value.trim();
  const errEl   = document.getElementById("loginError");
  errEl.classList.add("hidden");

  if (!userVal || !passVal) {
    showError(errEl, "يرجى إدخال جميع الحقول");
    return;
  }

  if (currentTab === "admin") {
    const admin = ADMINS.find(a => a.username === userVal && a.password === passVal);
    if (admin) {
      currentUser = { role: "admin", id: admin.username, data: admin };
      saveSession(); enterDashboard();
    } else {
      showError(errEl, "اسم المستخدم أو كلمة المرور غير صحيحة");
    }
    return;
  }

  if (currentTab === "student") {
    const snap = await getDocs(query(collection(db, "students"), where("username", "==", userVal)));
    if (snap.empty) { showError(errEl, "المستخدم غير موجود"); return; }
    const docData = snap.docs[0];
    if (docData.data().password !== passVal) { showError(errEl, "كلمة المرور غير صحيحة"); return; }
    currentUser = { role: "student", id: docData.id, data: docData.data() };
    saveSession(); enterDashboard();
    return;
  }

  if (currentTab === "parent") {
    const snap = await getDocs(query(collection(db, "parents"), where("phone", "==", userVal)));
    if (snap.empty) { showError(errEl, "رقم الهاتف غير مسجل"); return; }
    const docData = snap.docs[0];
    if (docData.data().password !== passVal) { showError(errEl, "كلمة المرور غير صحيحة"); return; }
    currentUser = { role: "parent", id: docData.id, data: docData.data() };
    saveSession(); enterDashboard();
    return;
  }
};

window.logout = function() {
  currentUser = null;
  localStorage.removeItem("hawzaSession");
  showScreen("loginScreen");
  document.getElementById("loginUser").value = "";
  document.getElementById("loginPass").value = "";
};

function saveSession() {
  localStorage.setItem("hawzaSession", JSON.stringify(currentUser));
}

function enterDashboard() {
  if (currentUser.role === "admin") {
    showScreen("adminDash");
    document.getElementById("adminName").textContent = currentUser.data.name;
    loadAllData();
  } else {
    showScreen("studentDash");
    loadStudentView();
  }
}

// ──────────────────────────────────────────────
//  Screen helpers
// ──────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

window.togglePass = function() {
  const inp = document.getElementById("loginPass");
  inp.type = inp.type === "password" ? "text" : "password";
};

window.toggleSidebar = function() {
  document.getElementById("sidebar").classList.toggle("open");
};

// ──────────────────────────────────────────────
//  Page navigation (admin)
// ──────────────────────────────────────────────
window.showPage = function(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById("page-" + name).classList.add("active");
  document.querySelector(`[data-page="${name}"]`).classList.add("active");
  // Close sidebar on mobile
  document.getElementById("sidebar").classList.remove("open");
  // Lazy load page content
  if (name === "leaderboard") renderLeaderboard();
  if (name === "schedule")    renderSchedule();
  if (name === "parents")     renderParents();
  if (name === "settings")    renderSettings();
  if (name === "attendance") {
    document.getElementById("attendDatePicker").value = currentAttendDate;
    loadAttendance();
  }
};

// ──────────────────────────────────────────────
//  Load all data from Firestore
// ──────────────────────────────────────────────
async function loadAllData() {
  await Promise.all([loadStudents(), loadParents(), loadQuestions(), loadLessons()]);
  renderDashboard();
  renderStudents();
  renderQuestionsPage();
  renderSchedule();
  renderSettings();
}

async function loadStudents() {
  const snap = await getDocs(query(collection(db, "students"), orderBy("name")));
  allStudents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function loadParents() {
  const snap = await getDocs(collection(db, "parents"));
  allParents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function loadQuestions() {
  const snap = await getDocs(query(collection(db, "questions"), orderBy("createdAt", "desc")));
  allQuestions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function loadLessons() {
  const snap = await getDocs(collection(db, "lessons"));
  allLessons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ──────────────────────────────────────────────
//  Dashboard
// ──────────────────────────────────────────────
async function renderDashboard() {
  document.getElementById("statStudents").textContent = allStudents.length;
  // Today attendance
  const attendSnap = await getDocs(collection(db, "attendance_" + todayStr()));
  let present = 0;
  attendSnap.forEach(d => { if (d.data().status === "present") present++; });
  document.getElementById("statPresent").textContent = present;
  document.getElementById("statAbsent").textContent  = allStudents.length - present;
  const top = allStudents.filter(s => (s.streak || 0) >= 7).length;
  document.getElementById("statTop").textContent = top;

  // Populate lesson select
  const sel = document.getElementById("broadcastLesson");
  sel.innerHTML = '<option value="">اختر الدرس</option>';
  allLessons.forEach(l => {
    const o = document.createElement("option");
    o.value = l.id; o.textContent = l.title;
    sel.appendChild(o);
  });

  // Recent activity
  renderActivity();
}

async function renderActivity() {
  const el = document.getElementById("recentActivity");
  const items = allQuestions.slice(0, 5).map(q => `
    <div class="activity-item">
      <span>❓</span>
      <span>${q.text?.substring(0,50)}...</span>
    </div>`).join("") || '<div class="empty-state">لا توجد أنشطة بعد</div>';
  el.innerHTML = items;
}

// ──────────────────────────────────────────────
//  Students
// ──────────────────────────────────────────────
function getRankLabel(streak) {
  if (!streak || streak < 7)  return { label: "مبتدئ",         idx: 0 };
  if (streak < 14)             return { label: "طالب جيد",     idx: 1 };
  if (streak < 21)             return { label: "طالب جيد جداً", idx: 2 };
  if (streak < 28)             return { label: "طالب ملتزم",   idx: 3 };
  return                              { label: "طالب ملتزم ومجتهد", idx: 4 };
}

function renderStudents(filtered) {
  const list = filtered || allStudents;
  const el = document.getElementById("studentsList");
  if (!list.length) { el.innerHTML = '<div class="empty-state" style="grid-column:1/-1">لا يوجد طلاب مسجلون</div>'; return; }
  el.innerHTML = list.map(s => studentCardHTML(s)).join("");
}

function studentCardHTML(s) {
  const rank = getRankLabel(s.streak || 0);
  const avatar = s.photo
    ? `<img src="${s.photo}" alt="${s.name}" />`
    : "👤";
  return `
  <div class="student-card" onclick="viewStudent('${s.id}')">
    <div class="student-card-header">
      <div class="student-avatar">${avatar}</div>
      <div>
        <div class="student-name">${s.name}</div>
        <div class="student-region">${s.region || ""} — ${s.tribe || ""}</div>
      </div>
    </div>
    <div class="rank-badge rank-${rank.idx}">${rankEmoji(rank.idx)} ${rank.label}</div>
    <div class="student-stats">
      <div class="s-stat"><div class="s-stat-n">${s.stars || 0}</div><div class="s-stat-l">نجمة</div></div>
      <div class="s-stat"><div class="s-stat-n">${s.streak || 0}</div><div class="s-stat-l">سلسلة</div></div>
      <div class="s-stat"><div class="s-stat-n">${s.totalPresent || 0}</div><div class="s-stat-l">حضور</div></div>
    </div>
    ${(s.streak > 0) ? `<div class="streak-badge">🔥 ${s.streak} يوم متواصل</div>` : ""}
    <div class="card-actions" onclick="event.stopPropagation()">
      <button class="btn-gold" onclick="viewStudent('${s.id}')">عرض البطاقة</button>
      <button class="btn-outline" onclick="editStudent('${s.id}')">✏️ تعديل</button>
      <button style="border:1.5px solid var(--red);color:var(--red);background:transparent;border-radius:8px;flex:0.5" onclick="confirmDelete('student','${s.id}','${s.name}')">🗑</button>
    </div>
  </div>`;
}

function rankEmoji(idx) {
  return ["📘","🌟","⭐","🏅","🏆"][idx] || "";
}

window.filterStudents = function() {
  const q    = document.getElementById("searchStudent").value.toLowerCase();
  const rank = document.getElementById("filterRank").value;
  const filtered = allStudents.filter(s => {
    const matchName  = s.name?.toLowerCase().includes(q) || s.username?.toLowerCase().includes(q);
    const matchRank  = !rank || getRankLabel(s.streak || 0).label === rank;
    return matchName && matchRank;
  });
  renderStudents(filtered);
};

// ──────────────────────────────────────────────
//  Add / Edit Student Modal
// ──────────────────────────────────────────────
window.openAddStudent = function() {
  editStudentId = null;
  document.getElementById("modalStudentTitle").textContent = "إضافة طالب جديد";
  clearStudentForm();
  openModal("modalAddStudent");
};

window.editStudent = function(id) {
  editStudentId = id;
  const s = allStudents.find(s => s.id === id);
  if (!s) return;
  document.getElementById("modalStudentTitle").textContent = "تعديل بيانات الطالب";
  document.getElementById("sName").value        = s.name        || "";
  document.getElementById("sBirth").value       = s.birth       || "";
  document.getElementById("sRegion").value      = s.region      || "";
  document.getElementById("sTribe").value       = s.tribe       || "";
  document.getElementById("sParentPhone").value = s.parentPhone || "";
  document.getElementById("sParentName").value  = s.parentName  || "";
  document.getElementById("sUsername").value    = s.username    || "";
  document.getElementById("sPassword").value    = s.password    || "";
  document.getElementById("studentPhotoData").value = s.photo  || "";
  if (s.photo) {
    document.getElementById("studentPhotoPreview").innerHTML = `<img src="${s.photo}" />`;
  }
  openModal("modalAddStudent");
};

function clearStudentForm() {
  ["sName","sBirth","sRegion","sTribe","sParentPhone","sParentName","sUsername","sPassword","studentPhotoData"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("studentPhotoPreview").innerHTML = "<span>📷</span><p>انقر لالتقاط صورة</p>";
  document.getElementById("modalStudentError").classList.add("hidden");
}

window.saveStudent = async function() {
  const name        = document.getElementById("sName").value.trim();
  const birth       = document.getElementById("sBirth").value;
  const region      = document.getElementById("sRegion").value.trim();
  const tribe       = document.getElementById("sTribe").value.trim();
  const parentPhone = document.getElementById("sParentPhone").value.trim();
  const parentName  = document.getElementById("sParentName").value.trim();
  const username    = document.getElementById("sUsername").value.trim().toLowerCase();
  const password    = document.getElementById("sPassword").value.trim();
  const photo       = document.getElementById("studentPhotoData").value;
  const errEl       = document.getElementById("modalStudentError");

  // Validation
  if (!name || !birth || !region || !parentPhone || !username || !password) {
    showError(errEl, "يرجى إكمال الحقول المطلوبة (*)"); return;
  }
  if (!/^[a-zA-Z0-9_]{3,}$/.test(username)) {
    showError(errEl, "اسم المستخدم يجب أن يكون انجليزي ولا يقل عن 3 أحرف"); return;
  }
  if (password.length < 6) {
    showError(errEl, "كلمة المرور يجب أن لا تقل عن 6 رموز"); return;
  }

  // Check username uniqueness
  if (!editStudentId) {
    const exists = allStudents.find(s => s.username === username);
    if (exists) { showError(errEl, "اسم المستخدم مستخدم بالفعل"); return; }
  }

  const data = { name, birth, region, tribe, parentPhone, parentName, username, password, photo,
                 stars: 0, streak: 0, totalPresent: 0, totalAbsent: 0, createdAt: serverTimestamp() };

  try {
    if (editStudentId) {
      await updateDoc(doc(db, "students", editStudentId), { name, birth, region, tribe, parentPhone, parentName, username, password, photo });
    } else {
      const ref = doc(collection(db, "students"));
      await setDoc(ref, data);
    }
    await loadStudents();
    renderStudents();
    renderDashboard();
    closeAllModals();
    showToast("تم حفظ بيانات الطالب بنجاح ✅", "success");
    logActivity(`تم ${editStudentId ? "تعديل" : "إضافة"} الطالب: ${name}`);
  } catch (e) {
    showError(errEl, "حدث خطأ: " + e.message);
  }
};

// ──────────────────────────────────────────────
//  View Student (card)
// ──────────────────────────────────────────────
window.viewStudent = async function(id) {
  const s = allStudents.find(s => s.id === id);
  if (!s) return;
  const rank   = getRankLabel(s.streak || 0);
  const avatar = s.photo ? `<img src="${s.photo}" />` : "👤";
  const parent = allParents.find(p => p.studentId === id);

  // Attendance history
  let attendRows = "";
  try {
    const snap = await getDocs(query(collection(db, "studentAttendance_" + id), orderBy("date", "desc")));
    snap.docs.slice(0,10).forEach(d => {
      const status = d.data().status === "present" ? "✅ حاضر" : "❌ غائب";
      attendRows += `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--surface2);font-size:0.83rem"><span>${d.data().date}</span><span>${status}</span></div>`;
    });
  } catch(e) {}

  const parentSection = parent ? `
    <div class="parent-account-section">
      <h4>👨‍👩‍👦 حساب ولي الأمر</h4>
      <div class="account-row"><span>الاسم</span><span>${parent.name}</span></div>
      <div class="account-row"><span>الهاتف</span><span dir="ltr">${parent.phone}</span></div>
      <div class="account-row"><span>كلمة المرور</span><span dir="ltr">${parent.password}</span></div>
    </div>` : `
    <button class="no-parent-btn" onclick="openAddParent('${id}','${s.parentName || s.name}','${s.parentPhone || ""}')">
      ➕ إنشاء حساب ولي الأمر
    </button>`;

  document.getElementById("viewStudentBody").innerHTML = `
    <div class="view-student-wrap">
      <div class="view-student-card">
        <div class="view-avatar-lg">${avatar}</div>
        <div class="view-stu-name">${s.name}</div>
        <div class="view-stu-rank">${rankEmoji(rank.idx)} ${rank.label}</div>
        <div class="view-stu-stars">⭐ ${s.stars||0} نجمة</div>
        <div class="view-stu-stars">🔥 ${s.streak||0} يوم</div>
        <div class="view-stu-stars">📖 ${s.totalPresent||0} حضور</div>
      </div>
      <div class="view-info-section">
        <div class="info-grid">
          <div class="info-item"><div class="info-label">تاريخ الميلاد</div><div class="info-value">${s.birth||"-"}</div></div>
          <div class="info-item"><div class="info-label">المنطقة</div><div class="info-value">${s.region||"-"}</div></div>
          <div class="info-item"><div class="info-label">لقب العشيرة</div><div class="info-value">${s.tribe||"-"}</div></div>
          <div class="info-item"><div class="info-label">هاتف ولي الأمر</div><div class="info-value" dir="ltr">${s.parentPhone||"-"}</div></div>
          <div class="info-item"><div class="info-label">اسم ولي الأمر</div><div class="info-value">${s.parentName||"-"}</div></div>
          <div class="info-item"><div class="info-label">النقاط الكلية</div><div class="info-value">${s.stars||0}</div></div>
        </div>
        <div class="account-section">
          <h4>🔑 بيانات الحساب</h4>
          <div class="account-row"><span>اسم المستخدم</span><span dir="ltr">${s.username}</span></div>
          <div class="account-row"><span>كلمة المرور</span><span dir="ltr">${s.password}</span></div>
        </div>
        ${parentSection}
        ${attendRows ? `<div style="margin-top:14px"><h4 style="font-size:0.88rem;margin-bottom:8px">📋 آخر سجلات الحضور</h4>${attendRows}</div>` : ""}
      </div>
    </div>`;

  document.getElementById("viewStudentFooter").innerHTML = `
    <button class="btn-gold" onclick="editStudent('${id}');closeAllModals()">✏️ تعديل</button>
    <button class="btn-danger" onclick="confirmDelete('student','${id}','${s.name}')">🗑 حذف</button>
    <button class="btn-outline" onclick="closeAllModals()">إغلاق</button>`;

  openModal("modalViewStudent");
};

// ──────────────────────────────────────────────
//  Parent Account
// ──────────────────────────────────────────────
window.openAddParent = function(studentId, name, phone) {
  pendingParentStudentId = studentId;
  document.getElementById("pName").value     = name  || "";
  document.getElementById("pPhone").value    = phone || "";
  document.getElementById("pPassword").value = "";
  document.getElementById("modalParentError").classList.add("hidden");
  closeAllModals();
  openModal("modalAddParent");
};

window.saveParentAccount = async function() {
  const name     = document.getElementById("pName").value.trim();
  const phone    = document.getElementById("pPhone").value.trim();
  const password = document.getElementById("pPassword").value.trim();
  const errEl    = document.getElementById("modalParentError");

  if (!name || !phone || !password) {
    showError(errEl, "يرجى إكمال جميع الحقول"); return;
  }
  if (phone.length < 11) {
    showError(errEl, "رقم الهاتف يجب أن لا يقل عن 11 رقم"); return;
  }
  if (password.length < 6) {
    showError(errEl, "كلمة المرور يجب أن لا تقل عن 6 رموز"); return;
  }

  try {
    const ref = doc(collection(db, "parents"));
    await setDoc(ref, { name, phone, password, studentId: pendingParentStudentId, createdAt: serverTimestamp() });
    await loadParents();
    renderParents();
    closeAllModals();
    showToast("تم إنشاء حساب ولي الأمر بنجاح ✅", "success");
  } catch(e) {
    showError(errEl, "خطأ: " + e.message);
  }
};

// ──────────────────────────────────────────────
//  Attendance
// ──────────────────────────────────────────────
window.loadAttendance = async function() {
  currentAttendDate = document.getElementById("attendDatePicker").value || todayStr();
  document.getElementById("attendDate").textContent = currentAttendDate;
  attendanceMap = {};

  // Load existing attendance
  try {
    const snap = await getDocs(collection(db, "attendance_" + currentAttendDate));
    snap.forEach(d => { attendanceMap[d.id] = d.data().status; });
  } catch(e) {}

  const el = document.getElementById("attendanceList");
  if (!allStudents.length) {
    el.innerHTML = '<div class="empty-state">لا يوجد طلاب مسجلون</div>'; return;
  }
  el.innerHTML = allStudents.map(s => {
    const status  = attendanceMap[s.id] || "";
    const pActive = status === "present" ? "active" : "";
    const aActive = status === "absent"  ? "active" : "";
    const avatar  = s.photo ? `<img src="${s.photo}" />` : "👤";
    return `
    <div class="attend-row" id="attend_${s.id}">
      <div class="attend-student">
        <div class="attend-avatar">${avatar}</div>
        <div>
          <div class="attend-name">${s.name}</div>
          <div style="font-size:0.75rem;color:var(--text-light)">${s.region||""}</div>
        </div>
      </div>
      <div class="attend-toggle">
        <button class="toggle-btn toggle-present ${pActive}" onclick="setAttend('${s.id}','present',this)">✅ حاضر</button>
        <button class="toggle-btn toggle-absent ${aActive}"  onclick="setAttend('${s.id}','absent',this)">❌ غائب</button>
      </div>
    </div>`;
  }).join("");
};

window.setAttend = function(id, status, btn) {
  attendanceMap[id] = status;
  const row = document.getElementById("attend_" + id);
  row.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
};

window.markAllPresent = function() {
  allStudents.forEach(s => { attendanceMap[s.id] = "present"; });
  loadAttendance();
};

window.saveAttendance = async function() {
  try {
    const batch = [];
    for (const [sid, status] of Object.entries(attendanceMap)) {
      batch.push(setDoc(doc(db, "attendance_" + currentAttendDate, sid), { status, date: currentAttendDate }));
      batch.push(setDoc(doc(db, "studentAttendance_" + sid, currentAttendDate), { status, date: currentAttendDate }));
    }
    await Promise.all(batch);

    // Update streaks & counts
    for (const s of allStudents) {
      const st = attendanceMap[s.id] || "absent";
      const isPresent = st === "present";
      const newStreak = isPresent ? (s.streak || 0) + 1 : 0;
      const newPresent = (s.totalPresent || 0) + (isPresent ? 1 : 0);
      const newAbsent  = (s.totalAbsent  || 0) + (isPresent ? 0 : 1);
      await updateDoc(doc(db, "students", s.id), {
        streak: newStreak,
        totalPresent: newPresent,
        totalAbsent: newAbsent
      });
    }
    await loadStudents();
    renderStudents();
    renderDashboard();
    showToast("تم حفظ الحضور بنجاح ✅", "success");
    logActivity(`تم تسجيل حضور يوم ${currentAttendDate}`);
  } catch(e) {
    showToast("خطأ في الحفظ: " + e.message, "error");
  }
};

// ──────────────────────────────────────────────
//  Questions
// ──────────────────────────────────────────────
window.openAddQuestion = function() {
  document.getElementById("qText").value   = "";
  document.getElementById("qPoints").value = 1;
  document.getElementById("modalQError").classList.add("hidden");
  openModal("modalAddQuestion");
};

window.saveQuestion = async function() {
  const text   = document.getElementById("qText").value.trim();
  const points = parseInt(document.getElementById("qPoints").value) || 1;
  const errEl  = document.getElementById("modalQError");
  if (!text) { showError(errEl, "يرجى كتابة نص السؤال"); return; }
  try {
    await setDoc(doc(collection(db, "questions")), {
      text, points, active: true, answers: 0, correct: 0,
      createdBy: currentUser.id, createdAt: serverTimestamp()
    });
    await loadQuestions();
    renderQuestionsPage();
    closeAllModals();
    showToast("تم إذاعة السؤال بنجاح 📡", "success");
    logActivity("تم إذاعة سؤال جديد: " + text.substring(0,40));
  } catch(e) {
    showError(errEl, "خطأ: " + e.message);
  }
};

window.broadcastQuestion = async function() {
  const text = document.getElementById("broadcastQ").value.trim();
  if (!text) { showToast("يرجى كتابة نص السؤال", "error"); return; }
  document.getElementById("qText").value   = text;
  document.getElementById("qPoints").value = 1;
  await saveQuestion();
  document.getElementById("broadcastQ").value = "";
};

function renderQuestionsPage() {
  const el = document.getElementById("questionsList");
  if (!allQuestions.length) {
    el.innerHTML = '<div class="empty-state">لا توجد أسئلة مذاعة</div>'; return;
  }
  el.innerHTML = allQuestions.map(q => `
    <div class="question-card">
      <div class="q-text">${q.text}</div>
      <div class="q-meta">
        <span class="q-badge">⭐ ${q.points} نقطة</span>
        <span class="q-stats">إجابات: ${q.answers||0} | صحيح: ${q.correct||0}</span>
        <span class="q-date">${formatDate(q.createdAt)}</span>
        <button style="margin-right:auto;padding:4px 12px;border:1px solid var(--red);color:var(--red);background:transparent;border-radius:6px;cursor:pointer;font-family:var(--font-ar);font-size:0.78rem"
          onclick="confirmDelete('question','${q.id}','هذا السؤال')">🗑 حذف</button>
      </div>
    </div>`).join("");
}

// ──────────────────────────────────────────────
//  Schedule
// ──────────────────────────────────────────────
window.openAddLesson = function() {
  ["lTitle","lTeacher"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("lStart").value = "";
  document.getElementById("lEnd").value   = "";
  document.getElementById("modalLError").classList.add("hidden");
  openModal("modalAddLesson");
};

window.saveLesson = async function() {
  const title   = document.getElementById("lTitle").value.trim();
  const day     = document.getElementById("lDay").value;
  const start   = document.getElementById("lStart").value;
  const end     = document.getElementById("lEnd").value;
  const teacher = document.getElementById("lTeacher").value.trim();
  const type    = document.getElementById("lType").value;
  const errEl   = document.getElementById("modalLError");
  if (!title) { showError(errEl, "يرجى إدخال عنوان الدرس"); return; }
  try {
    await setDoc(doc(collection(db, "lessons")), { title, day, start, end, teacher, type, createdAt: serverTimestamp() });
    await loadLessons();
    renderSchedule();
    closeAllModals();
    showToast("تم إضافة الدرس ✅", "success");
  } catch(e) {
    showError(errEl, "خطأ: " + e.message);
  }
};

window.setScheduleView = function(view) {
  scheduleView = view;
  document.querySelectorAll(".stab").forEach(t => t.classList.remove("active"));
  event.target.classList.add("active");
  renderSchedule();
};

window.openScheduleImage = function() {
  document.getElementById("scheduleImgData").value = "";
  document.getElementById("scheduleImgPreview").innerHTML = "<span>🖼</span><p>اختر صورة الجدول</p>";
  openModal("modalScheduleImage");
};

window.saveScheduleImage = async function() {
  const img = document.getElementById("scheduleImgData").value;
  if (!img) { showToast("يرجى اختيار صورة", "error"); return; }
  await setDoc(doc(db, "settings", "scheduleImage"), { url: img });
  closeAllModals();
  renderSchedule();
  showToast("تم رفع صورة الجدول ✅", "success");
};

async function renderSchedule() {
  const el = document.getElementById("scheduleContent");
  const filtered = scheduleView === "image" ? [] : allLessons.filter(l => l.type === scheduleView || scheduleView === "weekly");

  if (scheduleView === "image") {
    try {
      const snap = await getDoc(doc(db, "settings", "scheduleImage"));
      if (snap.exists()) {
        el.innerHTML = `<div class="schedule-image-view"><img src="${snap.data().url}" alt="جدول الدروس" /></div>`;
      } else {
        el.innerHTML = '<div class="empty-state">لم يتم رفع صورة الجدول بعد</div>';
      }
    } catch(e) { el.innerHTML = '<div class="empty-state">خطأ في التحميل</div>'; }
    return;
  }

  const days = ["السبت","الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة"];
  const rows = days.map(day => {
    const lessons = allLessons.filter(l => l.day === day);
    const cells = lessons.map(l => `<div class="lesson-chip">${l.title}${l.teacher ? ` — ${l.teacher}` : ""}<br/><small>${l.start||""} ${l.end ? "— " + l.end : ""}</small></div>`).join("") || "-";
    return `<tr><td style="font-weight:700;color:var(--gold)">${day}</td><td>${cells}</td></tr>`;
  }).join("");

  el.innerHTML = `
    <table class="schedule-table">
      <thead><tr><th>اليوم</th><th>الدروس</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${!allLessons.length ? '<div class="empty-state" style="margin-top:16px">لم يتم إضافة دروس بعد</div>' : ""}`;
}

// ──────────────────────────────────────────────
//  Leaderboard
// ──────────────────────────────────────────────
function renderLeaderboard() {
  const sorted = [...allStudents].sort((a,b) => (b.stars||0) - (a.stars||0));
  const el = document.getElementById("leaderboardContent");
  if (!sorted.length) { el.innerHTML = '<div class="empty-state">لا يوجد طلاب</div>'; return; }
  el.innerHTML = sorted.map((s, i) => {
    const rankClass = i === 0 ? "rank-1st" : i === 1 ? "rank-2nd" : i === 2 ? "rank-3rd" : "rank-other";
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i+1);
    const avatar = s.photo ? `<img src="${s.photo}" />` : "👤";
    const rank = getRankLabel(s.streak||0);
    return `
    <div class="leader-row">
      <div class="leader-rank ${rankClass}">${medal}</div>
      <div class="leader-avatar">${avatar}</div>
      <div style="flex:1">
        <div class="leader-name">${s.name}</div>
        <div class="leader-region">${rank.label} — ${s.region||""}</div>
      </div>
      <div class="leader-score">
        <div class="leader-stars">⭐ ${s.stars||0}</div>
        <div class="leader-streak">🔥 ${s.streak||0} يوم</div>
      </div>
    </div>`;
  }).join("");
}

// ──────────────────────────────────────────────
//  Parents Page
// ──────────────────────────────────────────────
function renderParents() {
  const el = document.getElementById("parentsList");
  if (!allParents.length) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1">لا يوجد أولياء أمور مسجلون</div>'; return;
  }
  el.innerHTML = allParents.map(p => {
    const student = allStudents.find(s => s.id === p.studentId);
    return `
    <div class="student-card">
      <div class="student-card-header">
        <div class="student-avatar">👤</div>
        <div>
          <div class="student-name">${p.name}</div>
          <div class="student-region" dir="ltr">${p.phone}</div>
        </div>
      </div>
      ${student ? `<div class="rank-badge rank-0">👨‍🎓 ولي أمر: ${student.name}</div>` : ""}
      <div class="account-section" style="margin-top:10px;border-radius:8px;padding:10px 12px;background:var(--surface)">
        <div style="display:flex;justify-content:space-between;font-size:0.83rem">
          <span style="color:var(--text-light)">الهاتف</span><span dir="ltr">${p.phone}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.83rem;margin-top:6px">
          <span style="color:var(--text-light)">كلمة المرور</span><span dir="ltr">${p.password}</span>
        </div>
      </div>
      <div class="card-actions">
        <button style="border:1.5px solid var(--red);color:var(--red);background:transparent;border-radius:8px;flex:1;padding:7px;cursor:pointer;font-family:var(--font-ar);font-size:0.8rem"
          onclick="confirmDelete('parent','${p.id}','${p.name}')">🗑 حذف</button>
      </div>
    </div>`;
  }).join("");
}

// ──────────────────────────────────────────────
//  Settings
// ──────────────────────────────────────────────
function renderSettings() {
  document.getElementById("adminsList").innerHTML = ADMINS.map(a => `
    <div class="admin-row">
      <span>👤 ${a.name}</span>
      <span style="color:var(--text-light);font-size:0.78rem" dir="ltr">${a.username}</span>
    </div>`).join("");
}

window.saveSettings = async function() {
  const name = document.getElementById("settingName").value.trim();
  const address = document.getElementById("settingAddress").value.trim();
  await setDoc(doc(db, "settings", "general"), { name, address });
  showToast("تم حفظ الإعدادات ✅", "success");
};

// ──────────────────────────────────────────────
//  Delete
// ──────────────────────────────────────────────
window.confirmDelete = function(type, id, label) {
  document.getElementById("confirmMsg").textContent = `هل أنت متأكد من حذف "${label}"؟`;
  document.getElementById("confirmBtn").onclick = () => doDelete(type, id);
  openModal("modalConfirm");
};

async function doDelete(type, id) {
  try {
    if (type === "student") {
      await deleteDoc(doc(db, "students", id));
      await loadStudents();
      renderStudents();
      renderDashboard();
    } else if (type === "parent") {
      await deleteDoc(doc(db, "parents", id));
      await loadParents();
      renderParents();
    } else if (type === "question") {
      await deleteDoc(doc(db, "questions", id));
      await loadQuestions();
      renderQuestionsPage();
    } else if (type === "lesson") {
      await deleteDoc(doc(db, "lessons", id));
      await loadLessons();
      renderSchedule();
    }
    closeAllModals();
    showToast("تم الحذف بنجاح 🗑", "success");
  } catch(e) {
    showToast("خطأ في الحذف: " + e.message, "error");
  }
}

// ──────────────────────────────────────────────
//  Student Dashboard view
// ──────────────────────────────────────────────
async function loadStudentView() {
  let studentData = null;

  if (currentUser.role === "student") {
    const snap = await getDoc(doc(db, "students", currentUser.id));
    if (snap.exists()) studentData = { id: snap.id, ...snap.data() };
  } else if (currentUser.role === "parent") {
    // Find linked student
    const snap = await getDocs(query(collection(db, "parents"), where("phone", "==", currentUser.data.phone)));
    if (!snap.empty) {
      const pData = snap.docs[0].data();
      const sSnap = await getDoc(doc(db, "students", pData.studentId));
      if (sSnap.exists()) studentData = { id: sSnap.id, ...sSnap.data() };
    }
  }

  if (!studentData) {
    showToast("لم يتم العثور على بيانات الطالب", "error"); return;
  }

  // Update card
  const rank = getRankLabel(studentData.streak || 0);
  document.getElementById("heroName").textContent   = studentData.name;
  document.getElementById("heroRank").textContent   = `${rankEmoji(rank.idx)} ${rank.label}`;
  document.getElementById("heroStars").textContent  = `⭐ ${studentData.stars||0} نجمة`;
  document.getElementById("heroStreak").textContent = `🔥 ${studentData.streak||0} يوم`;

  if (studentData.photo) {
    document.getElementById("heroAvatar").innerHTML = `<img src="${studentData.photo}" />`;
  }

  document.getElementById("stuPresent").textContent = studentData.totalPresent || 0;
  document.getElementById("stuAbsent").textContent  = studentData.totalAbsent  || 0;
  document.getElementById("stuScore").textContent   = studentData.stars        || 0;

  // Rank among all students
  const allSnap = await getDocs(query(collection(db, "students"), orderBy("stars", "desc")));
  const allStu  = allSnap.docs.map(d => d.id);
  const rankPos = allStu.indexOf(studentData.id) + 1;
  document.getElementById("stuRank").textContent = "#" + (rankPos || "-");

  // Active question
  loadDailyQuestion(studentData.id);

  // Schedule
  const lesSnap = await getDocs(collection(db, "lessons"));
  const lessons = lesSnap.docs.map(d => d.data());
  const schedEl = document.getElementById("stuScheduleContent");
  if (lessons.length) {
    schedEl.innerHTML = lessons.slice(0,8).map(l => `
      <div class="stu-lesson-row">
        <div class="stu-lesson-day">${l.day}</div>
        <div class="stu-lesson-info">
          <div>${l.title}</div>
          ${l.teacher ? `<div class="stu-lesson-time">👨‍🏫 ${l.teacher}</div>` : ""}
          ${l.start ? `<div class="stu-lesson-time">🕐 ${l.start}${l.end ? " — " + l.end : ""}</div>` : ""}
        </div>
      </div>`).join("");
  } else {
    schedEl.innerHTML = '<div class="empty-state">لم يُضَف جدول بعد</div>';
  }

  // Mini leaderboard
  const top5 = allSnap.docs.slice(0, 5);
  document.getElementById("stuLeaderboard").innerHTML = top5.map((d, i) => {
    const sd = d.data();
    const medal = ["🥇","🥈","🥉","4️⃣","5️⃣"][i];
    return `<div class="stu-lesson-row"><span>${medal}</span><span style="flex:1;margin-right:10px">${sd.name}</span><span>⭐ ${sd.stars||0}</span></div>`;
  }).join("");
}

async function loadDailyQuestion(studentId) {
  // Get latest active question
  const snap = await getDocs(query(collection(db, "questions"), orderBy("createdAt","desc")));
  if (snap.empty) return;
  const latest = snap.docs[0];
  const q = { id: latest.id, ...latest.data() };

  // Check if already answered
  const answered = await getDoc(doc(db, "answers", studentId + "_" + q.id));
  if (answered.exists()) return; // Already answered

  const card = document.getElementById("dailyQuestionCard");
  document.getElementById("dqText").textContent = q.text;
  card.classList.remove("hidden");

  // Simple yes/no answering
  document.getElementById("dqOptions").innerHTML = `
    <button class="dq-option" onclick="answerQuestion('${q.id}','${studentId}',${q.points},true,this)">✅ أعرف الإجابة (نجمة)</button>
    <button class="dq-option" onclick="answerQuestion('${q.id}','${studentId}',${q.points},false,this)">❌ لا أعرف</button>`;
}

window.answerQuestion = async function(qId, studentId, points, correct, btn) {
  document.getElementById("dqOptions").querySelectorAll(".dq-option").forEach(b => b.disabled = true);
  const resEl = document.getElementById("dqResult");
  resEl.classList.remove("hidden");

  // Record answer
  await setDoc(doc(db, "answers", studentId + "_" + qId), {
    studentId, questionId: qId, correct, answeredAt: serverTimestamp()
  });

  // Update stats
  if (correct) {
    const sSnap = await getDoc(doc(db, "students", studentId));
    if (sSnap.exists()) {
      await updateDoc(doc(db, "students", studentId), { stars: (sSnap.data().stars||0) + points });
    }
    await updateDoc(doc(db, "questions", qId), {
      answers: (await getDoc(doc(db,"questions",qId))).data().answers + 1,
      correct:  (await getDoc(doc(db,"questions",qId))).data().correct  + 1
    });
    resEl.className = "dq-result dq-correct";
    resEl.textContent = `🎉 أحسنت! حصلت على ${points} نجمة`;
  } else {
    resEl.className = "dq-result dq-wrong";
    resEl.textContent = "لا بأس، حاول مراجعة الدرس السابق";
  }
};

// ──────────────────────────────────────────────
//  Utilities
// ──────────────────────────────────────────────
window.previewPhoto = function(input, previewId, dataId) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById(previewId).innerHTML = `<img src="${e.target.result}" />`;
    document.getElementById(dataId).value = e.target.result;
  };
  reader.readAsDataURL(file);
};

function openModal(id) {
  document.getElementById("modalOverlay").classList.remove("hidden");
  document.getElementById(id).classList.remove("hidden");
}
window.closeAllModals = function() {
  document.getElementById("modalOverlay").classList.add("hidden");
  document.querySelectorAll(".modal").forEach(m => m.classList.add("hidden"));
};
window.closeModal = function(e) {
  if (e.target === document.getElementById("modalOverlay")) closeAllModals();
};

function showToast(msg, type="success") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast " + type;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 3500);
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}

function todayStr() {
  return new Date().toISOString().slice(0,10);
}

function setTodayDate() {
  const d = new Date();
  const opts = { weekday:"long", year:"numeric", month:"long", day:"numeric" };
  const str  = d.toLocaleDateString("ar-IQ", opts);
  const el   = document.getElementById("todayDate");
  if (el) el.textContent = str;
}

function formatDate(ts) {
  if (!ts) return "";
  if (ts.toDate) return ts.toDate().toLocaleDateString("ar-IQ");
  return "";
}

async function logActivity(text) {
  try {
    await setDoc(doc(collection(db, "activity")), {
      text, createdAt: serverTimestamp(), admin: currentUser?.id
    });
  } catch(e) {}
}
