import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, getIdTokenResult, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { collection, doc, getDoc, getFirestore, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { facilityLabel, roomLabel, roomsFor, slotLabel } from "./config.js";

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
const managerPendingSummary = document.querySelector("#manager-pending-summary");
const list = document.querySelector("#reservation-list");
const pendingReservationCount = document.querySelector("#pending-reservation-count");
const editForm = document.querySelector("#edit-form");
const emptyDetail = document.querySelector("#empty-detail");
const closedDayTemplateForm = document.querySelector("#closed-day-template-form");
const closedDayIndividualForm = document.querySelector("#closed-day-individual-form");
const closedDayStatus = document.querySelector("#closed-day-status");
const closedDayList = document.querySelector("#closed-day-list");
const closedDaysFacility = document.querySelector("#closed-days-facility");
const closedDaysMonth = document.querySelector("#closed-days-month");
const closedDaysMonthLabel = document.querySelector("#closed-days-month-label");
const closedDayFacility = document.querySelector("#closed-day-facility");
const closedDayMonth = document.querySelector("#closed-day-month");
const closedDayMonthLabel = document.querySelector("#closed-day-month-label");
const closedDayDate = document.querySelector("#closed-day-date");
const closedDayPreview = document.querySelector("#closed-day-preview");
const closedDayPreviewCount = document.querySelector("#closed-day-preview-count");
const saveClosedDays = document.querySelector("#save-closed-days");
const adminFacility = document.querySelector("#admin-facility");
const adminCalendar = document.querySelector("#admin-calendar");
const adminCalendarMonth = document.querySelector("#admin-calendar-month");
const staffReservationPanel = document.querySelector("#staff-reservation-panel");
const staffReservationForm = document.querySelector("#staff-reservation-form");
const staffReservationStatus = document.querySelector("#staff-reservation-status");
const staffFacility = document.querySelector("#staff-facility");
const staffRoom = document.querySelector("#staff-room");
const staffDate = document.querySelector("#staff-date");
const staffPhone = document.querySelector("#staff-phone");
const staffPhoneWarning = document.querySelector("#staff-phone-warning");
const adminOperationModal = document.querySelector("#admin-operation-modal");
const adminOperationModalPanel = document.querySelector("#admin-operation-modal .admin-operation-modal__panel");
let selectedId = null;
let reservations = new Map();
let stopListening = null;
let stopPendingSummary = null;
let stopClosedDays = null;
let stopAdminAvailability = null;
let accessFacility = null;
let configuredClosedDays = new Map();
let closurePreview = new Map();
let adminAvailability = new Map();
let operationModalTimer = null;
let operationModalHideTimer = null;
const facilities = ["higashiyama", "hatano", "toyohara"];

function showOperationModal(text, type = "success") {
  clearTimeout(operationModalTimer); clearTimeout(operationModalHideTimer);
  adminOperationModalPanel.textContent = text;
  adminOperationModal.className = `admin-operation-modal ${type}`;
  adminOperationModal.hidden = false;
  requestAnimationFrame(() => adminOperationModal.classList.add("is-visible"));
  operationModalTimer = setTimeout(() => {
    adminOperationModal.classList.remove("is-visible");
    operationModalHideTimer = setTimeout(() => { adminOperationModal.hidden = true; }, 220);
  }, 1800);
}
function message(target, text, type = "", toastText = text) {
  target.textContent = text; target.className = type;
  if (type === "success") showOperationModal(toastText, "success");
  if (type === "error") showOperationModal("処理に失敗しました。", "error");
}
function reservationId(facility, room, date, slot) { return `${facility}_${room}_${date}_${slot}`; }
function reservationStatusLabel(status) {
  return ({ pending: "受付中", confirmed: "確定", canceled: "取消済", closed: "停止" })[status] || status;
}
function validateStaffPhone() {
  const normalized = staffPhone.value.replace(/\D/g, "");
  if (staffPhone.value !== normalized) staffPhone.value = normalized;
  const valid = !normalized || normalized.length >= 10;
  staffPhoneWarning.hidden = valid;
  staffPhone.setAttribute("aria-invalid", String(!valid));
  return valid;
}

function fillRooms(select, facility, selected = "") {
  select.replaceChildren();
  for (const room of roomsFor(facility)) select.add(new Option(room.label, room.id, false, room.id === selected));
}

function selectReservation(id) {
  const reservation = reservations.get(id);
  if (!reservation) return;
  selectedId = id;
  document.querySelector("#edit-facility").value = reservation.facility;
  fillRooms(document.querySelector("#edit-room"), reservation.facility, reservation.room);
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
  const pendingCount = [...reservations.values()].filter((reservation) => reservation.status === "pending").length;
  pendingReservationCount.hidden = pendingCount === 0;
  pendingReservationCount.textContent = `受付中：${pendingCount}件`;
  if (!reservations.size) { list.textContent = "この館の予約はまだありません。"; return; }
  for (const [id, reservation] of reservations) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `reservation-item is-${reservation.status}${id === selectedId ? " selected" : ""}`;
    item.addEventListener("click", () => selectReservation(id));
    const date = document.createElement("strong"); date.textContent = `${reservation.date} ${slotLabel(reservation.slot)} · ${facilityLabel(reservation.facility)} ${roomLabel(reservation.facility, reservation.room)}`;
    const details = document.createElement("span"); details.className = "reservation-item-details";
    const summary = document.createElement("span"); summary.textContent = `${reservation.isStaffReservation ? "職員入力 · " : ""}${reservation.customerName || "氏名未入力"} · ${reservation.purpose}`;
    const status = document.createElement("span"); status.className = `reservation-status status-${reservation.status}`; status.textContent = reservationStatusLabel(reservation.status);
    details.append(summary, status);
    item.append(date, details);
    list.append(item);
  }
}

function startReservations() {
  stopListening?.();
  const reservationsQuery = query(collection(db, "reservations"), where("facility", "==", adminFacility.value), orderBy("date"), orderBy("slot"));
  stopListening = onSnapshot(reservationsQuery, (snapshot) => {
    reservations = new Map(snapshot.docs.map((item) => [item.id, item.data()]));
    if (selectedId && !reservations.has(selectedId)) { selectedId = null; editForm.hidden = true; emptyDetail.hidden = false; }
    renderList();
    const pendingCount = [...reservations.values()].filter((reservation) => reservation.status === "pending").length;
    message(adminStatus, pendingCount ? `${facilityLabel(adminFacility.value)}の予約を ${pendingCount} 件受付中です。` : "");
  }, () => message(adminStatus, "予約一覧を取得できません。権限設定を確認してください。", "error"));
}

function renderManagerPendingSummary(pendingReservations) {
  const counts = new Map(facilities.map((facility) => [facility, 0]));
  for (const reservation of pendingReservations) {
    if (counts.has(reservation.facility)) counts.set(reservation.facility, counts.get(reservation.facility) + 1);
  }
  managerPendingSummary.replaceChildren();
  for (const facility of facilities) {
    const count = counts.get(facility);
    if (!count) continue;
    const line = document.createElement("p");
    line.textContent = `${facilityLabel(facility)}　受付中：${count}件`;
    managerPendingSummary.append(line);
  }
  managerPendingSummary.hidden = !managerPendingSummary.childElementCount;
}

function startManagerPendingSummary() {
  stopPendingSummary?.();
  if (accessFacility !== "all") {
    managerPendingSummary.hidden = true;
    managerPendingSummary.replaceChildren();
    return;
  }
  const pendingQuery = query(collection(db, "reservations"), where("status", "==", "pending"));
  stopPendingSummary = onSnapshot(pendingQuery, (snapshot) => {
    renderManagerPendingSummary(snapshot.docs.map((item) => item.data()));
  }, () => {
    managerPendingSummary.hidden = true;
  });
}

const closureTemplates = {
  higashiyama: [1, 5, 6],
  hatano: [1, 2, 5],
  toyohara: [1, 5],
};
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function closureId(facilityId, date) { return `${facilityId}_${date.replaceAll("-", "")}`; }
function publicClosureId(facilityId, date) { return `${facilityId}_${date}`; }

function monthBounds(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const end = new Date(year, monthNumber, 0);
  return [localDate(start), localDate(end)];
}

function renderClosedDaysMonthLabel() {
  const [year, month] = closedDaysMonth.value.split("-").map(Number);
  closedDaysMonthLabel.textContent = `${year}年${month}月`;
  closedDayMonthLabel.textContent = `${year}年${month}月`;
  const [start, end] = monthBounds(closedDaysMonth.value);
  closedDayDate.min = start;
  closedDayDate.max = end;
  if (!closedDayDate.value || closedDayDate.value < start || closedDayDate.value > end) closedDayDate.value = start;
}

function nthWeekday(year, month, weekday, occurrence) {
  const date = new Date(year, month - 1, 1);
  date.setDate(1 + ((weekday - date.getDay() + 7) % 7) + 7 * (occurrence - 1));
  return localDate(date);
}

function equinoxDay(year, autumn = false) {
  const base = autumn ? 23.2488 : 20.8431;
  return Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function japaneseHolidays(year) {
  const holidays = new Map();
  const add = (month, day, name) => holidays.set(localDate(new Date(year, month - 1, day)), name);
  const addDate = (date, name) => holidays.set(date, name);
  add(1, 1, "元日");
  addDate(nthWeekday(year, 1, 1, 2), "成人の日");
  add(2, 11, "建国記念の日");
  add(2, 23, "天皇誕生日");
  add(3, equinoxDay(year), "春分の日");
  add(4, 29, "昭和の日");
  add(5, 3, "憲法記念日");
  add(5, 4, "みどりの日");
  add(5, 5, "こどもの日");
  addDate(nthWeekday(year, 7, 1, 3), "海の日");
  add(8, 11, "山の日");
  addDate(nthWeekday(year, 9, 1, 3), "敬老の日");
  add(9, equinoxDay(year, true), "秋分の日");
  addDate(nthWeekday(year, 10, 1, 2), "スポーツの日");
  add(11, 3, "文化の日");
  add(11, 23, "勤労感謝の日");

  for (const [date, name] of [...holidays]) {
    const original = new Date(`${date}T00:00:00`);
    if (original.getDay() !== 0) continue;
    const substitute = new Date(original);
    do { substitute.setDate(substitute.getDate() + 1); } while (holidays.has(localDate(substitute)));
    addDate(localDate(substitute), `振替休日（${name}）`);
  }
  for (let date = new Date(year, 0, 2); date < new Date(year, 11, 31); date.setDate(date.getDate() + 1)) {
    const key = localDate(date);
    const previous = new Date(date); previous.setDate(previous.getDate() - 1);
    const next = new Date(date); next.setDate(next.getDate() + 1);
    if (date.getDay() !== 0 && !holidays.has(key) && holidays.has(localDate(previous)) && holidays.has(localDate(next))) addDate(key, "国民の休日");
  }
  return holidays;
}

function closureMetadata(date) {
  const [year] = date.split("-").map(Number);
  const holidayName = japaneseHolidays(year).get(date) || "";
  const day = new Date(`${date}T00:00:00`).getDay();
  return { date, weekday: weekdays[day], weekdayLabel: weekdayLabels[day], isHoliday: Boolean(holidayName), holidayName };
}

function formatTimestamp(value) {
  if (!value?.toDate) return "保存中…";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(value.toDate());
}

function adminDateStatus(date) {
  if (configuredClosedDays.has(closureId(closedDaysFacility.value, date))) return "closed";
  return [...adminAvailability.values()].some((record) => record.date === date && record.status !== "available") ? "pending" : "available";
}

async function deleteClosedDay(day) {
  const data = day.data();
  const batch = writeBatch(db);
  batch.delete(day.ref);
  batch.delete(doc(db, "closureAvailability", publicClosureId(data.facilityId, data.date)));
  batch.set(doc(collection(db, "closedDayAuditLogs")), {
    action: "delete", facilityId: data.facilityId, date: data.date,
    deletedBy: auth.currentUser.email, deletedAt: serverTimestamp(),
  });
  await batch.commit();
}

async function addClosedDay(facilityId, date) {
  const email = auth.currentUser?.email;
  if (!email) throw new Error("No signed-in staff member");
  const entry = closureMetadata(date);
  const batch = writeBatch(db);
  batch.set(doc(db, "closedDays", closureId(facilityId, date)), {
    facilityId, date, weekday: entry.weekday, isHoliday: entry.isHoliday,
    holidayName: entry.holidayName, createdBy: email, createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "closureAvailability", publicClosureId(facilityId, date)), { facilityId, date });
  await batch.commit();
}

function renderAdminCalendar() {
  const month = closedDaysMonth.value;
  if (!month) return;
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const days = new Date(year, monthNumber, 0).getDate();
  adminCalendar.replaceChildren();
  adminCalendarMonth.textContent = `${year}年${monthNumber}月`;
  for (const labelText of ["日", "月", "火", "水", "木", "金", "土"]) {
    const label = document.createElement("div"); label.className = "weekday"; label.textContent = labelText; adminCalendar.append(label);
  }
  for (let index = 0; index < firstDay.getDay(); index += 1) adminCalendar.append(document.createElement("div"));
  for (let day = 1; day <= days; day += 1) {
    const date = localDate(new Date(year, monthNumber - 1, day));
    const status = adminDateStatus(date);
    const button = document.createElement("button");
    button.type = "button"; button.className = `calendar-day is-${status}`;
    button.setAttribute("aria-label", `${date}、${status === "closed" ? "休館日" : status === "pending" ? "予約あり" : "開館日"}`);
    const dayNumber = document.createElement("strong"); dayNumber.textContent = String(day);
    const marker = document.createElement("span"); marker.className = "day-marker"; marker.textContent = status === "closed" ? "休館日" : status === "pending" ? "予約あり" : "開館日";
    button.append(dayNumber, marker);
    button.addEventListener("click", async () => {
      const facilityId = closedDaysFacility.value;
      if (status === "closed") {
        if (!window.confirm(`${date} を休館日から削除し、開館扱いにしますか？`)) return;
        try {
          await deleteClosedDay(configuredClosedDays.get(closureId(facilityId, date)));
          message(closedDayStatus, "休館日を削除し、開館扱いとしました。", "success");
        } catch { message(closedDayStatus, "休館日を削除できません。職員権限を確認してください。", "error"); }
      } else {
        if (!window.confirm(`${date} を休館日に設定しますか？`)) return;
        try {
          await addClosedDay(facilityId, date);
          message(closedDayStatus, "休館日として登録しました。", "success");
        } catch { message(closedDayStatus, "休館日を設定できません。職員権限を確認してください。", "error"); }
      }
    });
    adminCalendar.append(button);
  }
}

function renderPreview() {
  closedDayPreview.replaceChildren();
  const entries = [...closurePreview.values()].sort((a, b) => a.date.localeCompare(b.date));
  closedDayPreviewCount.textContent = entries.length ? `${entries.length}日` : "";
  saveClosedDays.disabled = entries.length === 0;
  if (!entries.length) { closedDayPreview.textContent = "テンプレートを適用するか、個別の日付を追加してください。"; return; }
  for (const entry of entries) {
    const row = document.createElement("div"); row.className = "closed-day-preview-item";
    const text = document.createElement("span");
    text.textContent = `${entry.date}（${entry.weekdayLabel}）${entry.holidayName ? ` · ${entry.holidayName}` : ""}`;
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "secondary"; remove.textContent = "除外";
    remove.addEventListener("click", () => { closurePreview.delete(entry.date); renderPreview(); });
    row.append(text, remove); closedDayPreview.append(row);
  }
}

function renderClosedDays(days) {
  closedDayList.replaceChildren();
  if (!days.length) { closedDayList.textContent = "設定済みの休館日はありません。"; return; }
  for (const day of days) {
    const data = day.data();
    const item = document.createElement("div");
    item.className = "closed-day-item";
    const label = document.createElement("span"); label.className = "closed-day-details";
    label.textContent = `${data.date}（${weekdayLabels[weekdays.indexOf(data.weekday)] || "—"}） · ${data.holidayName || "祝日ではありません"} · ${data.createdBy || "—"} · ${formatTimestamp(data.createdAt)}`;
    const button = document.createElement("button"); button.className = "secondary"; button.type = "button"; button.textContent = "削除";
    button.addEventListener("click", async () => {
      if (!window.confirm(`${data.date} を休館日から削除し、開館扱いにしますか？`)) return;
      try {
        await deleteClosedDay(day);
        message(closedDayStatus, "休館日を削除し、開館扱いとしました。", "success");
      } catch { message(closedDayStatus, "休館日を削除できません。職員権限を確認してください。", "error"); }
    });
    item.append(label, button); closedDayList.append(item);
  }
}

function startClosedDays() {
  stopClosedDays?.(); stopAdminAvailability?.();
  renderClosedDaysMonthLabel();
  const facilityId = closedDaysFacility.value;
  const [start, end] = monthBounds(closedDaysMonth.value);
  configuredClosedDays = new Map();
  adminAvailability = new Map();
  renderAdminCalendar();
  const closedDaysQuery = query(collection(db, "closedDays"), where("facilityId", "==", facilityId), where("date", ">=", start), where("date", "<=", end), orderBy("date"));
  stopClosedDays = onSnapshot(closedDaysQuery, (snapshot) => {
    configuredClosedDays = new Map(snapshot.docs.map((item) => [item.id, item]));
    renderClosedDays(snapshot.docs);
    renderAdminCalendar();
  }, () => {
    message(closedDayStatus, "休館日一覧を取得できません。職員権限を確認してください。", "error");
  });
  const availabilityQuery = query(collection(db, "availability"), where("facility", "==", facilityId), where("date", ">=", start), where("date", "<=", end), orderBy("date"));
  stopAdminAvailability = onSnapshot(availabilityQuery, (snapshot) => {
    adminAvailability = new Map(snapshot.docs.map((item) => [item.id, item.data()]));
    renderAdminCalendar();
  }, () => message(adminStatus, "カレンダーの予約状況を取得できません。", "error"));
}

function changeAdminFacility(facility) {
  const nextFacility = accessFacility === "all" ? facility : accessFacility;
  adminFacility.value = nextFacility;
  closedDaysFacility.value = nextFacility;
  closedDayFacility.value = nextFacility;
  if (!staffReservationPanel.hidden) {
    staffFacility.value = nextFacility;
    prepareStaffReservationForm();
  }
  closurePreview = new Map();
  renderPreview();
  startReservations();
  startClosedDays();
}

function changeAdminMonth(month) {
  closedDaysMonth.value = month;
  closedDayMonth.value = month;
  renderClosedDaysMonthLabel();
  closurePreview = new Map();
  renderPreview();
  startClosedDays();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#login-email").value;
  const password = document.querySelector("#login-password").value;
  message(loginStatus, "ログインしています…");
  try { await signInWithEmailAndPassword(auth, email, password); }
  catch { message(loginStatus, "メールアドレスまたはパスワードを確認してください。", "error"); }
});

closedDayTemplateForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!closedDayTemplateForm.reportValidity()) return;
  const facility = closedDayFacility.value;
  const month = closedDayMonth.value;
  const [start, end] = monthBounds(month);
  const templateDays = closureTemplates[facility];
  changeAdminFacility(facility);
  changeAdminMonth(month);
  closurePreview = new Map();
  for (let date = new Date(`${start}T00:00:00`); localDate(date) <= end; date.setDate(date.getDate() + 1)) {
    const key = localDate(date);
    const metadata = closureMetadata(key);
    if (templateDays.includes(date.getDay()) || metadata.isHoliday) closurePreview.set(key, metadata);
  }
  renderPreview();
  message(closedDayStatus, `${facilityLabel(facility)}の${month.replace("-", "年")}月分を登録予定として作成しました。内容を確認してください。`);
});

closedDayIndividualForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!closedDayIndividualForm.reportValidity()) return;
  const date = closedDayDate.value;
  closurePreview.set(date, closureMetadata(date));
  renderPreview();
  message(closedDayStatus, `${date} を登録予定に追加しました。`);
});

saveClosedDays.addEventListener("click", async () => {
  const facilityId = closedDayFacility.value;
  const email = auth.currentUser?.email;
  const entries = [...closurePreview.values()].filter((entry) => !configuredClosedDays.has(closureId(facilityId, entry.date)));
  if (!email || !entries.length) {
    message(closedDayStatus, "登録する新しい休館日がありません。", "error");
    return;
  }
  saveClosedDays.disabled = true;
  try {
    const batch = writeBatch(db);
    for (const entry of entries) {
      const id = closureId(facilityId, entry.date);
      batch.set(doc(db, "closedDays", id), {
        facilityId, date: entry.date, weekday: entry.weekday,
        isHoliday: entry.isHoliday, holidayName: entry.holidayName,
        createdBy: email, createdAt: serverTimestamp(),
      });
      batch.set(doc(db, "closureAvailability", publicClosureId(facilityId, entry.date)), { facilityId, date: entry.date });
    }
    await batch.commit();
    closurePreview = new Map(); renderPreview();
    message(closedDayStatus, `${entries.length}日分の休館日を登録しました。`, "success", "休館日として登録しました。");
  } catch { message(closedDayStatus, "休館日を登録できません。職員権限を確認してください。", "error"); }
  finally { renderPreview(); }
});

function addReservationAudit(batch, action, reservation, id) {
  batch.set(doc(collection(db, "reservationAuditLogs")), {
    action, reservationId: id, facility: reservation.facility, room: reservation.room,
    date: reservation.date, slot: reservation.slot,
    performedBy: auth.currentUser.email, performedAt: serverTimestamp(),
  });
}

function prepareStaffReservationForm() {
  const facility = accessFacility === "all" ? adminFacility.value : accessFacility;
  staffFacility.value = facility;
  staffFacility.disabled = accessFacility !== "all";
  fillRooms(staffRoom, facility, staffRoom.value);
  staffDate.min = localDate(new Date());
  if (!staffDate.value || staffDate.value < staffDate.min) staffDate.value = staffDate.min;
}

document.querySelector("#open-staff-reservation").addEventListener("click", () => {
  prepareStaffReservationForm();
  staffReservationPanel.hidden = false;
  staffReservationPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  staffFacility.focus();
});
document.querySelector("#close-staff-reservation").addEventListener("click", () => {
  staffReservationPanel.hidden = true;
  message(staffReservationStatus, "");
});
staffFacility.addEventListener("change", () => changeAdminFacility(staffFacility.value));

staffReservationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateStaffPhone()) {
    const phoneError = "電話番号の桁数が不足しています。入力する場合は10桁以上で入力してください。";
    message(staffReservationStatus, phoneError, "error"); showOperationModal(phoneError, "error"); staffPhone.focus(); return;
  }
  if (!staffReservationForm.reportValidity()) return;
  const facility = staffFacility.value;
  const room = staffRoom.value;
  const date = staffDate.value;
  const slot = document.querySelector("#staff-slot").value;
  const id = reservationId(facility, room, date, slot);
  const email = auth.currentUser?.email;
  if (!email) { message(staffReservationStatus, "職員ログインを確認できません。", "error"); return; }
  try {
    const [existingReservation, closure] = await Promise.all([
      getDoc(doc(db, "reservations", id)),
      getDoc(doc(db, "closureAvailability", publicClosureId(facility, date))),
    ]);
    if (closure.exists()) { message(staffReservationStatus, "この日は休館日です。例外開館として休館日を削除してから登録してください。", "error"); return; }
    if (existingReservation.exists()) { message(staffReservationStatus, "同じ館・部屋・利用日・利用区分には既存予約があります。", "error"); return; }
    const reservation = {
      slotId: id, facility, room, date, slot,
      customerName: document.querySelector("#staff-name").value.trim(),
      phone: staffPhone.value.trim(),
      purpose: document.querySelector("#staff-purpose").value.trim(),
      notes: document.querySelector("#staff-notes").value.trim(),
      status: "confirmed", isStaffReservation: true, createdBy: email, createdAt: serverTimestamp(),
    };
    const availabilityRecord = { slotId: id, facility, room, date, slot, status: "confirmed", createdAt: serverTimestamp() };
    const batch = writeBatch(db);
    batch.set(doc(db, "reservations", id), reservation);
    batch.set(doc(db, "availability", id), availabilityRecord);
    addReservationAudit(batch, "create", reservation, id);
    await batch.commit();
    staffReservationForm.reset(); prepareStaffReservationForm();
    message(staffReservationStatus, "確定予約を登録しました。予約一覧と公開カレンダーへ反映されます。", "success", "職員予約を作成しました。");
  } catch (error) {
    console.error("Staff reservation submission failed", error);
    message(staffReservationStatus, "予約を登録できません。競合または職員権限を確認してください。", "error");
  }
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
      slotId: selectedId, facility: reservation.facility, room: reservation.room, date: reservation.date, slot: reservation.slot, status: status === "canceled" ? "available" : status,
    }, { merge: true });
    addReservationAudit(batch, "update", reservation, selectedId);
    await batch.commit();
    message(adminStatus, "予約内容を保存しました。", "success", reservation.isStaffReservation ? "職員予約を更新しました。" : "予約内容を保存しました。");
  } catch { message(adminStatus, "保存できません。職員権限を確認してください。", "error"); }
});

document.querySelector("#delete-reservation").addEventListener("click", async () => {
  if (!selectedId || !window.confirm("この予約を削除しますか？")) return;
  try {
    const reservation = reservations.get(selectedId);
    if (!reservation) throw new Error("Reservation was not found");
    const batch = writeBatch(db);
    addReservationAudit(batch, "delete", reservation, selectedId);
    batch.delete(doc(db, "reservations", selectedId));
    batch.delete(doc(db, "availability", selectedId));
    await batch.commit();
    message(adminStatus, "予約を削除しました。", "success");
  }
  catch { message(adminStatus, "削除できません。職員権限を確認してください。", "error"); }
});

document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));
staffPhone.addEventListener("input", validateStaffPhone);

const currentMonth = localDate(new Date()).slice(0, 7);
closedDaysMonth.value = currentMonth;
closedDayMonth.value = currentMonth;

adminFacility.addEventListener("change", () => changeAdminFacility(adminFacility.value));
closedDaysFacility.addEventListener("change", () => changeAdminFacility(closedDaysFacility.value));
closedDayFacility.addEventListener("change", () => changeAdminFacility(closedDayFacility.value));
closedDaysMonth.addEventListener("change", () => changeAdminMonth(closedDaysMonth.value));
closedDayMonth.addEventListener("change", () => changeAdminMonth(closedDayMonth.value));
function shiftClosedDaysMonth(offset) {
  const [year, month] = closedDaysMonth.value.split("-").map(Number);
  const next = new Date(year, month - 1 + offset, 1);
  changeAdminMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
}
document.querySelector("#previous-admin-month").addEventListener("click", () => shiftClosedDaysMonth(-1));
document.querySelector("#next-admin-month").addEventListener("click", () => shiftClosedDaysMonth(1));
document.querySelector("#previous-closed-days-month").addEventListener("click", () => shiftClosedDaysMonth(-1));
document.querySelector("#next-closed-days-month").addEventListener("click", () => shiftClosedDaysMonth(1));
document.querySelector("#previous-template-month").addEventListener("click", () => shiftClosedDaysMonth(-1));
document.querySelector("#next-template-month").addEventListener("click", () => shiftClosedDaysMonth(1));

onAuthStateChanged(auth, async (user) => {
  stopListening?.(); stopListening = null; stopPendingSummary?.(); stopPendingSummary = null; stopClosedDays?.(); stopClosedDays = null; stopAdminAvailability?.(); stopAdminAvailability = null; selectedId = null;
  if (!user) { loginPanel.hidden = false; adminPanel.hidden = true; staffReservationPanel.hidden = true; managerPendingSummary.hidden = true; managerPendingSummary.replaceChildren(); return; }
  try {
    const token = await getIdTokenResult(user, true);
    const role = token.claims.role;
    const facility = token.claims.facility;
    const validManager = role === "manager" && facility === "all";
    const validStaff = role === "staff" && ["higashiyama", "hatano", "toyohara"].includes(facility);
    if (token.claims.admin !== true || (!validManager && !validStaff)) {
      await signOut(auth);
      message(loginStatus, "このアカウントには有効な職員権限がありません。", "error");
      return;
    }
    accessFacility = facility;
    const selectedFacility = facility === "all" ? "higashiyama" : facility;
    adminFacility.value = selectedFacility;
    closedDaysFacility.value = selectedFacility;
    closedDayFacility.value = selectedFacility;
    adminFacility.disabled = facility !== "all";
    closedDaysFacility.disabled = facility !== "all";
    closedDayFacility.disabled = facility !== "all";
    loginPanel.hidden = true; adminPanel.hidden = false; changeAdminFacility(selectedFacility); startManagerPendingSummary();
  } catch {
    await signOut(auth);
    message(loginStatus, "職員権限を確認できません。もう一度ログインしてください。", "error");
  }
});
