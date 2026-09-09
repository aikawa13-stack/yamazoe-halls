import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { collection, doc, getDoc, getFirestore, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { facilityLabel, roomLabel, roomsFor, slots } from "./config.js";

const firebaseConfig = { apiKey: "AIzaSyB4RYPAvnwets8LI6Vefnuxc_eC7ftymig", authDomain: "yamazoe-halls-staging.firebaseapp.com", projectId: "yamazoe-halls-staging", appId: "1:715762011677:web:e31b304a036c23f64240f4" };
const db = getFirestore(initializeApp(firebaseConfig));
const form = document.querySelector("#reservation-form");
const formStatus = document.querySelector("#form-status");
const phoneInput = document.querySelector("#phone");
const phoneWarning = document.querySelector("#phone-warning");
const publicOperationModal = document.querySelector("#public-operation-modal");
const publicOperationModalPanel = document.querySelector("#public-operation-modal .public-operation-modal__panel");
const submitButton = document.querySelector("#submit-button");
const dateInput = document.querySelector("#date");
const formFacility = document.querySelector("#facility");
const formRoom = document.querySelector("#room");
const formSlot = document.querySelector("#slot");
const availabilityFacility = document.querySelector("#availability-facility");
const availabilityRoom = document.querySelector("#availability-room");
const calendar = document.querySelector("#calendar");
const calendarMonth = document.querySelector("#calendar-month");
const availabilityStatus = document.querySelector("#availability-status");
const selectedDateLabel = document.querySelector("#selected-date-label");
const slotList = document.querySelector("#slot-list");
let selectedFacility = availabilityFacility.value;
let selectedRoom = "";
let selectedDate = localDate(new Date());
let displayedMonth = new Date(`${selectedDate}T00:00:00`);
let availability = new Map();
let closedDays = new Set();
let legacyClosedDays = new Set();
let stoppedDays = new Set();
let stopAvailability = null;
let stopClosedDays = null;
let stopLegacyClosedDays = null;
let stopStoppedDays = null;
let publicOperationModalTimer = null;
let publicOperationModalHideTimer = null;
displayedMonth.setDate(1);
dateInput.min = localDate(new Date());
dateInput.value = selectedDate;

function localDate(date) { const local = new Date(date); local.setMinutes(local.getMinutes() - local.getTimezoneOffset()); return local.toISOString().slice(0, 10); }
function reservationId(facility, room, date, slot) { return `${facility}_${room}_${date}_${slot}`; }
function closureAvailabilityId(facility, date) { return `${facility}_${date}`; }
function closedDayRef(facility, date) { return doc(db, "closed_days", facility, "dates", date); }
function stoppedDayRef(facility, room, date) { return doc(db, "stopped_days", facility, "rooms", room, "dates", date); }
function refreshClosedDays() { closedDays = new Set([...legacyClosedDays, ...closedDays]); }
function setMessage(target, message, type = "") { target.textContent = message; target.className = type; }
function validatePhone() {
  const normalized = phoneInput.value.replace(/\D/g, "");
  if (phoneInput.value !== normalized) phoneInput.value = normalized;
  const valid = normalized.length >= 10;
  phoneWarning.hidden = valid;
  phoneInput.setAttribute("aria-invalid", String(!valid));
  return valid;
}
function showPublicOperationModal(text) {
  clearTimeout(publicOperationModalTimer); clearTimeout(publicOperationModalHideTimer);
  publicOperationModalPanel.textContent = text;
  publicOperationModal.hidden = false;
  requestAnimationFrame(() => publicOperationModal.classList.add("is-visible"));
  publicOperationModalTimer = setTimeout(() => {
    publicOperationModal.classList.remove("is-visible");
    publicOperationModalHideTimer = setTimeout(() => { publicOperationModal.hidden = true; }, 220);
  }, 2800);
}
function fillRooms(select, facility, selected = "") {
  select.replaceChildren();
  for (const room of roomsFor(facility)) select.add(new Option(room.label, room.id, false, room.id === selected));
  if (!select.value) select.value = roomsFor(facility)[0]?.id || "";
}
function setFacility(facility, room = "") {
  selectedFacility = facility;
  availabilityFacility.value = facility;
  formFacility.value = facility;
  fillRooms(availabilityRoom, facility, room);
  fillRooms(formRoom, facility, availabilityRoom.value);
  selectedRoom = availabilityRoom.value;
  listenCalendarData();
}
function monthBounds() { const start = localDate(displayedMonth); const end = new Date(displayedMonth); end.setMonth(end.getMonth() + 1); end.setDate(0); return [start, localDate(end)]; }
function statusFor(date, slot) {
  if (closedDays.has(date)) return "closed";
  if (stoppedDays.has(date)) return "stopped";
  const status = availability.get(reservationId(selectedFacility, selectedRoom, date, slot))?.status || "available";
  if (status === "closed") return "stopped";
  return status === "confirmed" ? "reserved" : status;
}
function dateStatus(date) {
  if (closedDays.has(date)) return "closed";
  if (stoppedDays.has(date)) return "stopped";
  const states = slots.map((slot) => statusFor(date, slot.id));
  if (states.some((status) => status !== "available")) return "pending";
  return "available";
}
function statusLabel(status) { return ({ available: "空き", pending: "受付中", reserved: "予約あり", closed: "休館日", stopped: "停止日" })[status] || "受付中"; }
function renderCalendar() {
  calendar.replaceChildren();
  calendarMonth.textContent = `${displayedMonth.getFullYear()}年${displayedMonth.getMonth() + 1}月`;
  const currentMonth = new Date(); currentMonth.setDate(1); currentMonth.setHours(0, 0, 0, 0);
  document.querySelector("#previous-month").disabled = displayedMonth <= currentMonth;
  for (const day of ["日", "月", "火", "水", "木", "金", "土"]) { const label = document.createElement("div"); label.className = "weekday"; label.textContent = day; calendar.append(label); }
  for (let index = 0; index < displayedMonth.getDay(); index += 1) calendar.append(document.createElement("div"));
  const days = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 0).getDate();
  const today = localDate(new Date());
  for (let day = 1; day <= days; day += 1) {
    const date = localDate(new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), day));
    const status = dateStatus(date);
    const button = document.createElement("button"); button.type = "button"; button.className = `calendar-day is-${status}${date === selectedDate ? " selected" : ""}`; button.disabled = date < today; button.setAttribute("aria-label", `${date}、${statusLabel(status)}`);
    const dayNumber = document.createElement("strong"); dayNumber.textContent = String(day);
    const marker = document.createElement("span"); marker.className = "day-marker"; marker.textContent = statusLabel(status);
    button.append(dayNumber, marker); button.addEventListener("click", () => selectDate(date)); calendar.append(button);
  }
}
function selectDate(date) { selectedDate = date; dateInput.value = date; renderCalendar(); renderSlots(); }
function selectMonth(offset) {
  const nextMonth = new Date(displayedMonth); nextMonth.setMonth(nextMonth.getMonth() + offset);
  const currentMonth = new Date(); currentMonth.setDate(1); currentMonth.setHours(0, 0, 0, 0);
  if (nextMonth < currentMonth) return;
  displayedMonth = nextMonth; selectedDate = localDate(displayedMonth); dateInput.value = selectedDate; listenCalendarData();
}
function renderSlots() {
  selectedDateLabel.textContent = `${facilityLabel(selectedFacility)} · ${roomLabel(selectedFacility, selectedRoom)} · ${selectedDate}`;
  slotList.replaceChildren();
  for (const slot of slots) {
    const status = statusFor(selectedDate, slot.id);
    const item = document.createElement("article"); item.className = `slot-item is-${status}`;
    const title = document.createElement("h3"); title.textContent = `${slot.label}（${slot.hours}）`;
    const state = document.createElement("p"); state.textContent = statusLabel(status); item.append(title, state);
    if (status === "available") {
      const button = document.createElement("button"); button.type = "button"; button.textContent = "この区分を予約する";
      button.addEventListener("click", () => { formFacility.value = selectedFacility; formRoom.value = selectedRoom; dateInput.value = selectedDate; formSlot.value = slot.id; document.querySelector("#booking").scrollIntoView({ behavior: "smooth", block: "start" }); formSlot.focus(); });
      item.append(button);
    }
    slotList.append(item);
  }
}
function listenCalendarData() {
  stopAvailability?.(); stopClosedDays?.(); stopLegacyClosedDays?.(); stopStoppedDays?.();
  const [start, end] = monthBounds(); availability = new Map(); closedDays = new Set(); legacyClosedDays = new Set(); stoppedDays = new Set();
  setMessage(availabilityStatus, "空き状況を読み込んでいます…");
  const availabilityQuery = query(collection(db, "availability"), where("facility", "==", selectedFacility), where("room", "==", selectedRoom), where("date", ">=", start), where("date", "<=", end), orderBy("date"));
  const successMessage = "青は空き、灰色は受付中、オレンジは停止日、赤は休館日です。";
  stopAvailability = onSnapshot(availabilityQuery, (snapshot) => { availability = new Map(snapshot.docs.map((item) => [item.id, item.data()])); renderCalendar(); renderSlots(); setMessage(availabilityStatus, successMessage, "success"); }, () => setMessage(availabilityStatus, "予約状況を取得できません。しばらくしてからお試しください。", "error"));
  const closedQuery = query(collection(db, "closed_days", selectedFacility, "dates"), where("date", ">=", start), where("date", "<=", end), orderBy("date"));
  stopClosedDays = onSnapshot(closedQuery, (snapshot) => { closedDays = new Set(snapshot.docs.map((item) => item.data().date)); refreshClosedDays(); renderCalendar(); renderSlots(); setMessage(availabilityStatus, successMessage, "success"); }, () => setMessage(availabilityStatus, "休館日情報を取得できません。しばらくしてからお試しください。", "error"));
  const legacyClosedQuery = query(collection(db, "closureAvailability"), where("facilityId", "==", selectedFacility), where("date", ">=", start), where("date", "<=", end), orderBy("date"));
  stopLegacyClosedDays = onSnapshot(legacyClosedQuery, (snapshot) => { legacyClosedDays = new Set(snapshot.docs.map((item) => item.data().date)); refreshClosedDays(); renderCalendar(); renderSlots(); }, () => setMessage(availabilityStatus, "休館日情報を取得できません。しばらくしてからお試しください。", "error"));
  const stoppedQuery = query(collection(db, "stopped_days", selectedFacility, "rooms", selectedRoom, "dates"), where("date", ">=", start), where("date", "<=", end), orderBy("date"));
  stopStoppedDays = onSnapshot(stoppedQuery, (snapshot) => { stoppedDays = new Set(snapshot.docs.map((item) => item.data().date)); renderCalendar(); renderSlots(); }, () => setMessage(availabilityStatus, "停止日情報を取得できません。しばらくしてからお試しください。", "error"));
}

availabilityFacility.addEventListener("change", () => setFacility(availabilityFacility.value));
availabilityRoom.addEventListener("change", () => { selectedRoom = availabilityRoom.value; formRoom.value = selectedRoom; listenCalendarData(); });
formFacility.addEventListener("change", () => setFacility(formFacility.value));
formRoom.addEventListener("change", () => { selectedRoom = formRoom.value; availabilityRoom.value = selectedRoom; listenCalendarData(); });
dateInput.addEventListener("change", () => { selectedDate = dateInput.value; displayedMonth = new Date(`${selectedDate}T00:00:00`); displayedMonth.setDate(1); listenCalendarData(); });
document.querySelector("#previous-month").addEventListener("click", () => selectMonth(-1));
document.querySelector("#next-month").addEventListener("click", () => selectMonth(1));
phoneInput.addEventListener("input", validatePhone);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validatePhone()) {
    const phoneError = "電話番号の桁数が不足しているため、予約を受け付けられません。10桁以上で入力してください。";
    setMessage(formStatus, phoneError, "error"); showPublicOperationModal(phoneError); phoneInput.focus(); return;
  }
  if (!form.reportValidity()) return;
  const data = new FormData(form); const facility = String(data.get("facility")); const room = String(data.get("room")); const date = String(data.get("date")); const slot = String(data.get("slot")); const id = reservationId(facility, room, date, slot); const createdAt = serverTimestamp();
  const reservation = { slotId: id, facility, room, date, slot, customerName: String(data.get("customerName")).trim(), phone: String(data.get("phone")).trim(), purpose: String(data.get("purpose")).trim(), notes: String(data.get("notes")).trim(), status: "pending", createdAt };
  const availabilityRecord = { slotId: id, facility, room, date, slot, status: "pending", createdAt };
  submitButton.disabled = true; setMessage(formStatus, "予約を送信しています…");
  try {
    const [existingAvailability, closure, publicClosedDay, stoppedDay] = await Promise.all([
      getDoc(doc(db, "availability", id)),
      getDoc(doc(db, "closureAvailability", closureAvailabilityId(facility, date))),
      getDoc(closedDayRef(facility, date)),
      getDoc(stoppedDayRef(facility, room, date)),
    ]);
    if (closure.exists() || publicClosedDay.exists()) {
      closedDays.add(date); renderCalendar(); renderSlots();
      setMessage(formStatus, "選択した利用日は休館日のため予約できません。別の日付を選択してください。", "error");
      return;
    }
    if (stoppedDay.exists()) {
      stoppedDays.add(date); renderCalendar(); renderSlots();
      setMessage(formStatus, "選択した施設は停止日のため予約できません。別の日付または施設を選択してください。", "error");
      return;
    }
    if (existingAvailability.exists()) {
      availability.set(id, existingAvailability.data()); renderCalendar(); renderSlots();
      setMessage(formStatus, "選択した館・施設・利用日・利用区分はすでに受付済みです。別の予約枠を選択してください。", "error");
      return;
    }
    const batch = writeBatch(db);
    batch.set(doc(db, "reservations", id), reservation);
    batch.set(doc(db, "availability", id), availabilityRecord);
    await batch.commit();
    form.reset(); formFacility.value = selectedFacility; fillRooms(formRoom, selectedFacility, selectedRoom); dateInput.value = selectedDate;
    setMessage(formStatus, "予約リクエストを受け付けました。内容を確認のうえご連絡します。", "success");
  }
  catch (error) { console.error("Reservation submission failed", error); setMessage(formStatus, "予約を受け付けられませんでした。ページを再読み込みして、空き状況を確認してから再度お試しください。", "error"); }
  finally { submitButton.disabled = false; }
});

setFacility(selectedFacility);
renderCalendar();
renderSlots();
