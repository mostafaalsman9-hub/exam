// ============================================================
//  firebase.js — Firebase initialization & data layer
//  Uses: Realtime Database (not Firestore)
// ============================================================

// ════════════════════════════════════════════════════════════
//  ★ بيانات Firebase مدمجة مباشرة — تعمل على كل الأجهزة
// ════════════════════════════════════════════════════════════
const SITE_CONFIG = {
  apiKey:            "AIzaSyDx_RY-mBAh_NaZXLDWVAhy5nHB5UjMsvk",
  authDomain:        "mostafa-4a6af.firebaseapp.com",
  databaseURL:       "https://mostafa-4a6af-default-rtdb.firebaseio.com",
  projectId:         "mostafa-4a6af",
  storageBucket:     "mostafa-4a6af.firebasestorage.app",
  messagingSenderId: "99582552751",
  appId:             "1:99582552751:web:1702631a20396d739b025a",
};

// ── هل الكونفيج الثابت مكتمل؟ ──────────────────────────────
function isSiteConfigReady() {
  return !!(SITE_CONFIG.apiKey && SITE_CONFIG.databaseURL);
}

// ── Fallback: localStorage للمشرف فقط ───────────────────────
const STORAGE_KEY = "__ep_cfg__";

function loadConfig() {
  if (isSiteConfigReady()) return SITE_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(atob(raw));
    if (parsed && parsed.apiKey && parsed.databaseURL) return parsed;
    return null;
  } catch (_) { return null; }
}

function saveConfig(cfg) {
  if (!cfg || !cfg.apiKey) return false;
  try {
    localStorage.setItem(STORAGE_KEY, btoa(JSON.stringify(cfg)));
    return true;
  } catch (_) { return false; }
}

function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── تهيئة Firebase ──────────────────────────────────────────
const __fbCfg = loadConfig();

if (__fbCfg) {
  try {
    firebase.initializeApp(__fbCfg);
  } catch(e) {
    if (!e.message.includes("already")) throw e;
  }
}

const auth = __fbCfg ? firebase.auth()     : null;
const db   = __fbCfg ? firebase.database() : null;

// ── Cache helpers ──────────────────────────────────────────
const CACHE_TTL = 30 * 60 * 1000;
function cacheSet(key, data) {
  try { localStorage.setItem("c_"+key, JSON.stringify({ ts: Date.now(), data })); } catch (_) {}
}
function cacheGet(key) {
  try {
    const raw = localStorage.getItem("c_"+key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem("c_"+key); return null; }
    return data;
  } catch (_) { return null; }
}
function cacheClear(prefix) {
  Object.keys(localStorage).filter(k => k.startsWith("c_"+prefix)).forEach(k => localStorage.removeItem(k));
}

// ── Auth ───────────────────────────────────────────────────
async function signIn(email, password) { return auth.signInWithEmailAndPassword(email, password); }
function signOut()        { return auth.signOut(); }
function onAuthChange(cb) { return auth.onAuthStateChanged(cb); }

// ── Exams ──────────────────────────────────────────────────
async function getExam(examId) {
  const cached = cacheGet("exam_"+examId);
  if (cached) return cached;
  const snap = await db.ref("exams/" + examId).once("value");
  if (!snap.exists()) return null;
  const data = { id: examId, ...snap.val() };
  cacheSet("exam_"+examId, data);
  return data;
}

async function listExams() {
  const snap = await db.ref("exams").orderByChild("createdAt").once("value");
  if (!snap.exists()) return [];
  const results = [];
  snap.forEach(child => {
    results.unshift({ id: child.key, ...child.val() });
  });
  return results;
}

async function createExam(examData) {
  const ref = db.ref("exams").push();
  await ref.set({ ...examData, createdAt: firebase.database.ServerValue.TIMESTAMP });
  cacheClear("exam_");
  return ref.key;
}

async function updateExam(examId, data) {
  await db.ref("exams/" + examId).update(data);
  cacheClear("exam_"+examId);
}

async function deleteExam(examId) {
  await db.ref("exams/" + examId).remove();
  cacheClear("exam_"+examId);
}

// ── Responses ──────────────────────────────────────────────
async function submitResponse(responseData) {
  const ref = db.ref("responses").push();
  await ref.set({ ...responseData, submittedAt: firebase.database.ServerValue.TIMESTAMP });
  return ref.key;
}

async function getResponses(examId) {
  const snap = await db.ref("responses").orderByChild("examId").equalTo(examId).once("value");
  if (!snap.exists()) return [];
  const results = [];
  snap.forEach(child => results.push({ id: child.key, ...child.val() }));
  return results;
}

async function updateResponse(responseId, data) {
  await db.ref("responses/" + responseId).update(data);
}

// ── NEW: Check if student already submitted ────────────────
async function checkAlreadySubmitted(examId, username) {
  const snap = await db.ref("responses")
    .orderByChild("examId").equalTo(examId).once("value");
  if (!snap.exists()) return false;
  let found = false;
  snap.forEach(child => {
    if (child.val().studentUsername === username) found = true;
  });
  return found;
}
