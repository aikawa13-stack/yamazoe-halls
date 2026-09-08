import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, getIdTokenResult, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { collection, deleteDoc, doc, getFirestore, onSnapshot, orderBy, query, updateDoc } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB4RYPAvnwets8LI6Vefnuxc_eC7ftymig",
  authDomain: "yamazoe-halls-staging.firebaseapp.com",
  projectId: "yamazoe-halls-staging",
  appId: "1:715762011677:web:e31b304a036c23f64240f4",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const loginPanel = document.querySelector("#login-panel");
const adminPanel = document.querySelector("#admin-panel");
const loginForm = document.querySelector("#login-form");
const loginStatus = document.querySelector("#login-status");
const adminStatus = document.querySelector("#admin-status");
const list = document.querySelector("#reservation-list");
const editForm = document.querySelector("#edit-form");
const emptyDetail = document.querySelector("#empty-detail");
let selectedId = null;
let reservations = new Map();
let stopListening = null;

function message(target, text, type = "") { target.textContent = text; target.className = type; }

function selectReservation(id) {
  const reservation = reservations.get(id);
  if (!reservation) return;
  selectedId = id;
  document.querySelector("#edit-date").value = reservation.date;
  document.querySelector("#edit-time").value = reservation.time;
  document.querySelector("#edit-guests").value = reservation.guestCount;
  document.querySelector("#edit-name").value = reservation.customerName;
  document.querySelector("#edit-email").value = reservation.email;
  document.querySelector("#edit-phone").value = reservation.phone;
  document.querySelector("#edit-status").value = reservation.status;
  document.querySelector("#edit-notes").value = reservation.notes || "";
  editForm.hidden = false;
  emptyDetail.hidden = true;
  renderList();
}

function renderList() {
  list.replaceChildren();
  if (!reservations.size) { list.textContent = "予約はまだありません。"; return; }
  for (const [id, reservation] of reservations) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `reservation-item${id === selectedId ? " selected" : ""}`;
    item.addEventListener("click", () => selectReservation(id));
    const date = document.createElement("strong"); date.textContent = `${reservation.date} ${reservation.time}`;
    const details = document.createElement("span"); details.textContent = `${reservation.customerName} · ${reservation.guestCount}名 · ${reservation.status}`;
    item.append(date, details);
    list.append(item);
  }
}

function startReservations() {
  stopListening?.();
  const reservationsQuery = query(collection(db, "reservations"), orderBy("date"), orderBy("time"));
  stopListening = onSnapshot(reservationsQuery, (snapshot) => {
    reservations = new Map(snapshot.docs.map((item) => [item.id, item.data()]));
    if (selectedId && !reservations.has(selectedId)) { selectedId = null; editForm.hidden = true; emptyDetail.hidden = false; }
    renderList();
    message(adminStatus, `${reservations.size}件の予約を表示しています。`);
  }, () => message(adminStatus, "予約一覧を取得できません。権限設定を確認してください。", "error"));
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#login-email").value;
  const password = document.querySelector("#login-password").value;
  message(loginStatus, "ログインしています…");
  try { await signInWithEmailAndPassword(auth, email, password); }
  catch { message(loginStatus, "メールアドレスまたはパスワードを確認してください。", "error"); }
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedId || !editForm.reportValidity()) return;
  try {
    await updateDoc(doc(db, "reservations", selectedId), {
      guestCount: Number(document.querySelector("#edit-guests").value),
      customerName: document.querySelector("#edit-name").value.trim(),
      email: document.querySelector("#edit-email").value.trim(),
      phone: document.querySelector("#edit-phone").value.trim(),
      notes: document.querySelector("#edit-notes").value.trim(),
      status: document.querySelector("#edit-status").value,
    });
    message(adminStatus, "予約内容を保存しました。", "success");
  } catch { message(adminStatus, "保存できません。職員権限を確認してください。", "error"); }
});

document.querySelector("#delete-reservation").addEventListener("click", async () => {
  if (!selectedId || !window.confirm("この予約を削除しますか？")) return;
  try { await deleteDoc(doc(db, "reservations", selectedId)); message(adminStatus, "予約を削除しました。", "success"); }
  catch { message(adminStatus, "削除できません。職員権限を確認してください。", "error"); }
});

document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  stopListening?.(); stopListening = null; selectedId = null;
  if (!user) { loginPanel.hidden = false; adminPanel.hidden = true; return; }
  try {
    const token = await getIdTokenResult(user, true);
    if (token.claims.admin !== true) {
      await signOut(auth);
      message(loginStatus, "このアカウントには職員権限がありません。", "error");
      return;
    }
    loginPanel.hidden = true; adminPanel.hidden = false; startReservations();
  } catch {
    await signOut(auth);
    message(loginStatus, "職員権限を確認できません。もう一度ログインしてください。", "error");
  }
});
