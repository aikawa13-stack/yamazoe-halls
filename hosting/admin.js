import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, getIdTokenResult, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { collection, collectionGroup, deleteDoc, doc, getFirestore, onSnapshot, orderBy, query, serverTimestamp, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

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
const closedDayForm = document.querySelector("#closed-day-form");
const closedDayStatus = document.querySelector("#closed-day-status");
const closedDayList = document.querySelector("#closed-day-list");
let selectedId = null;
let reservations = new Map();
let stopListening = null;
let stopClosedDays = null;

function message(target, text, type = "") { target.textContent = text; target.className = type; }

function selectReservation(id) {
  const reservation = reservations.get(id);
  if (!reservation) return;
  selectedId = id;
  document.querySelector("#edit-facility").value = reservation.facility;
  document.querySelector("#edit-date").value = reservation.date;
  document.querySelector("#edit-slot").value = reservation.slot;
  document.querySelector("#edit-name").value = reservation.customerName;
  document.querySelector("#edit-phone").value = reservation.phone;
  document.querySelector("#edit-purpose").value = reservation.purpose;
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
    const date = document.createElement("strong"); date.textContent = `${reservation.date} ${reservation.slot} · ${reservation.facility}`;
    const details = document.createElement("span"); details.textContent = `${reservation.customerName} · ${reservation.purpose} · ${reservation.status}`;
    item.append(date, details);
    list.append(item);
  }
}

function startReservations() {
  stopListening?.();
  const reservationsQuery = query(collection(db, "reservations"), orderBy("date"), orderBy("slot"));
  stopListening = onSnapshot(reservationsQuery, (snapshot) => {
    reservations = new Map(snapshot.docs.map((item) => [item.id, item.data()]));
    if (selectedId && !reservations.has(selectedId)) { selectedId = null; editForm.hidden = true; emptyDetail.hidden = false; }
    renderList();
    message(adminStatus, `${reservations.size}件の予約を表示しています。`);
  }, () => message(adminStatus, "予約一覧を取得できません。権限設定を確認してください。", "error"));
}

function renderClosedDays(days) {
  closedDayList.replaceChildren();
  if (!days.length) { closedDayList.textContent = "設定済みの休館日はありません。"; return; }
  for (const day of days) {
    const item = document.createElement("div");
    item.className = "closed-day-item";
    const label = document.createElement("span"); label.textContent = `${day.data().facility} · ${day.data().date}`;
    const button = document.createElement("button"); button.className = "secondary"; button.type = "button"; button.textContent = "解除";
    button.addEventListener("click", async () => {
      if (!window.confirm(`${label.textContent} を休館日から解除しますか？`)) return;
      try { await deleteDoc(day.ref); message(closedDayStatus, "休館日を解除しました。", "success"); }
      catch { message(closedDayStatus, "休館日を解除できません。職員権限を確認してください。", "error"); }
    });
    item.append(label, button); closedDayList.append(item);
  }
}

function startClosedDays() {
  stopClosedDays?.();
  const closedDaysQuery = query(collectionGroup(db, "dates"), orderBy("date"));
  stopClosedDays = onSnapshot(closedDaysQuery, (snapshot) => renderClosedDays(snapshot.docs), () => {
    message(closedDayStatus, "休館日一覧を取得できません。職員権限を確認してください。", "error");
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#login-email").value;
  const password = document.querySelector("#login-password").value;
  message(loginStatus, "ログインしています…");
  try { await signInWithEmailAndPassword(auth, email, password); }
  catch { message(loginStatus, "メールアドレスまたはパスワードを確認してください。", "error"); }
});

closedDayForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!closedDayForm.reportValidity()) return;
  const facility = document.querySelector("#closed-day-facility").value;
  const date = document.querySelector("#closed-day-date").value;
  try {
    await setDoc(doc(db, "closed_days", facility, "dates", date), { facility, date, createdAt: serverTimestamp() });
    message(closedDayStatus, "休館日に設定しました。", "success");
  } catch { message(closedDayStatus, "休館日を設定できません。職員権限を確認してください。", "error"); }
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedId || !editForm.reportValidity()) return;
  try {
    const reservation = reservations.get(selectedId);
    const status = document.querySelector("#edit-status").value;
    const batch = writeBatch(db);
    batch.update(doc(db, "reservations", selectedId), {
      customerName: document.querySelector("#edit-name").value.trim(),
      phone: document.querySelector("#edit-phone").value.trim(),
      purpose: document.querySelector("#edit-purpose").value.trim(),
      notes: document.querySelector("#edit-notes").value.trim(),
      status,
    });
    batch.set(doc(db, "availability", selectedId), {
      slotId: selectedId, facility: reservation.facility, date: reservation.date, slot: reservation.slot, status,
    }, { merge: true });
    await batch.commit();
    message(adminStatus, "予約内容を保存しました。", "success");
  } catch { message(adminStatus, "保存できません。職員権限を確認してください。", "error"); }
});

document.querySelector("#delete-reservation").addEventListener("click", async () => {
  if (!selectedId || !window.confirm("この予約を削除しますか？")) return;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "reservations", selectedId));
    batch.delete(doc(db, "availability", selectedId));
    await batch.commit();
    message(adminStatus, "予約を削除しました。", "success");
  }
  catch { message(adminStatus, "削除できません。職員権限を確認してください。", "error"); }
});

document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  stopListening?.(); stopListening = null; stopClosedDays?.(); stopClosedDays = null; selectedId = null;
  if (!user) { loginPanel.hidden = false; adminPanel.hidden = true; return; }
  try {
    const token = await getIdTokenResult(user, true);
    if (token.claims.admin !== true) {
      await signOut(auth);
      message(loginStatus, "このアカウントには職員権限がありません。", "error");
      return;
    }
    loginPanel.hidden = true; adminPanel.hidden = false; startReservations(); startClosedDays();
  } catch {
    await signOut(auth);
    message(loginStatus, "職員権限を確認できません。もう一度ログインしてください。", "error");
  }
});
