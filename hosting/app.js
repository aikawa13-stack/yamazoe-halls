import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { collection, doc, getFirestore, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB4RYPAvnwets8LI6Vefnuxc_eC7ftymig",
  authDomain: "yamazoe-halls-staging.firebaseapp.com",
  projectId: "yamazoe-halls-staging",
  appId: "1:715762011677:web:e31b304a036c23f64240f4",
};
const slots = [["午前", "9:00–12:00"], ["午後", "13:00–17:00"], ["夜間", "18:00–21:00"], ["全日", "9:00–21:00"]];
const db = getFirestore(initializeApp(firebaseConfig));
const form = document.querySelector("#reservation-form");
const formStatus = document.querySelector("#form-status");
const submitButton = document.querySelector("#submit-button");
const dateInput = document.querySelector("#date");
const formFacility = document.querySelector("#facility");
const formSlot = document.querySelector("#slot");
const availabilityFacility = document.querySelector("#availability-facility");
const calendar = document.querySelector("#calendar");
const calendarMonth = document.querySelector("#calendar-month");
const availabilityStatus = document.querySelector("#availability-status");
const selectedDateLabel = document.querySelector("#selected-date-label");
const slotList = document.querySelector("#slot-list");
let selectedFacility = availabilityFacility.value;
let selectedDate = localDate(new Date());
let displayedMonth = new Date(`${selectedDate}T00:00:00`);
let availability = new Map();
let stopAvailability = null;
displayedMonth.setDate(1);
dateInput.min = localDate(new Date());
dateInput.value = selectedDate;

function localDate(date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}
function slotId(facility, date, slot) { return `${facility}_${date}_${slot}`; }
function setMessage(target, message, type = "") { target.textContent = message; target.className = type; }
function monthBounds() {
  const start = localDate(displayedMonth);
  const endDate = new Date(displayedMonth);
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(0);
  return [start, localDate(endDate)];
}
function statusFor(date, slot) { return availability.get(slotId(selectedFacility, date, slot))?.status || "available"; }
function dateStatus(date) {
  const states = slots.map(([slot]) => statusFor(date, slot));
  if (states.every((status) => status === "closed")) return "closed";
  if (states.some((status) => status !== "available")) return "pending";
  return "available";
}
function statusLabel(status) { return ({ available: "空き", closed: "停止" })[status] || "受付中"; }

function renderCalendar() {
  calendar.replaceChildren();
  calendarMonth.textContent = `${displayedMonth.getFullYear()}年${displayedMonth.getMonth() + 1}月`;
  const currentMonth = new Date(); currentMonth.setDate(1); currentMonth.setHours(0, 0, 0, 0);
  document.querySelector("#previous-month").disabled = displayedMonth <= currentMonth;
  for (const day of ["日", "月", "火", "水", "木", "金", "土"]) {
    const label = document.createElement("div"); label.className = "weekday"; label.textContent = day; calendar.append(label);
  }
  for (let index = 0; index < displayedMonth.getDay(); index += 1) calendar.append(document.createElement("div"));
  const days = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 0).getDate();
  const today = localDate(new Date());
  for (let day = 1; day <= days; day += 1) {
    const date = localDate(new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), day));
    const status = dateStatus(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `calendar-day is-${status}${date === selectedDate ? " selected" : ""}`;
    button.disabled = date < today;
    button.setAttribute("aria-label", `${date}、${statusLabel(status)}`);
    const dayNumber = document.createElement("strong"); dayNumber.textContent = String(day);
    const marker = document.createElement("span"); marker.className = "day-marker"; marker.textContent = statusLabel(status);
    button.append(dayNumber, marker);
    button.addEventListener("click", () => selectDate(date));
    calendar.append(button);
  }
}
function selectDate(date) { selectedDate = date; dateInput.value = date; renderCalendar(); renderSlots(); }
function selectMonth(offset) {
  const nextMonth = new Date(displayedMonth);
  nextMonth.setMonth(nextMonth.getMonth() + offset);
  const currentMonth = new Date(); currentMonth.setDate(1); currentMonth.setHours(0, 0, 0, 0);
  if (nextMonth < currentMonth) return;
  displayedMonth = nextMonth;
  selectedDate = localDate(displayedMonth);
  dateInput.value = selectedDate;
  listenAvailability();
}
function renderSlots() {
  selectedDateLabel.textContent = `${selectedFacility} · ${selectedDate}`;
  slotList.replaceChildren();
  for (const [slot, hours] of slots) {
    const status = statusFor(selectedDate, slot);
    const item = document.createElement("article"); item.className = `slot-item is-${status}`;
    const title = document.createElement("h3"); title.textContent = `${slot}（${hours}）`;
    const state = document.createElement("p"); state.textContent = statusLabel(status);
    item.append(title, state);
    if (status === "available") {
      const button = document.createElement("button"); button.type = "button"; button.textContent = "この区分を予約する";
      button.addEventListener("click", () => {
        formFacility.value = selectedFacility; dateInput.value = selectedDate; formSlot.value = slot;
        document.querySelector("#booking").scrollIntoView({ behavior: "smooth", block: "start" }); formSlot.focus();
      });
      item.append(button);
    }
    slotList.append(item);
  }
}
function listenAvailability() {
  stopAvailability?.();
  const [start, end] = monthBounds();
  setMessage(availabilityStatus, "空き状況を読み込んでいます…");
  const availabilityQuery = query(collection(db, "availability"), where("facility", "==", selectedFacility), where("date", ">=", start), where("date", "<=", end), orderBy("date"));
  stopAvailability = onSnapshot(availabilityQuery, (snapshot) => {
    availability = new Map(snapshot.docs.map((item) => [item.id, item.data()]));
    renderCalendar(); renderSlots(); setMessage(availabilityStatus, "青は空き、灰色は受付中、赤は停止です。", "success");
  }, () => setMessage(availabilityStatus, "予約状況を取得できません。しばらくしてからお試しください。", "error"));
}

availabilityFacility.addEventListener("change", () => { selectedFacility = availabilityFacility.value; formFacility.value = selectedFacility; listenAvailability(); });
formFacility.addEventListener("change", () => { selectedFacility = formFacility.value; availabilityFacility.value = selectedFacility; listenAvailability(); });
dateInput.addEventListener("change", () => {
  selectedDate = dateInput.value;
  displayedMonth = new Date(`${selectedDate}T00:00:00`);
  displayedMonth.setDate(1);
  listenAvailability();
});
document.querySelector("#previous-month").addEventListener("click", () => selectMonth(-1));
document.querySelector("#next-month").addEventListener("click", () => selectMonth(1));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const facility = String(data.get("facility"));
  const date = String(data.get("date"));
  const slot = String(data.get("slot"));
  const id = slotId(facility, date, slot);
  const createdAt = serverTimestamp();
  const reservation = { slotId: id, facility, date, slot, customerName: String(data.get("customerName")).trim(), phone: String(data.get("phone")).trim(), purpose: String(data.get("purpose")).trim(), notes: String(data.get("notes")).trim(), status: "pending", createdAt };
  const availabilityRecord = { slotId: id, facility, date, slot, status: "pending", createdAt };
  submitButton.disabled = true;
  setMessage(formStatus, "予約を送信しています…");
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "reservations", id), reservation);
    batch.set(doc(db, "availability", id), availabilityRecord);
    await batch.commit();
    form.reset(); formFacility.value = selectedFacility; dateInput.value = selectedDate;
    setMessage(formStatus, "予約リクエストを受け付けました。内容を確認のうえご連絡します。", "success");
  } catch (error) {
    console.error("Reservation submission failed", error);
    setMessage(formStatus, "この施設・利用日・利用区分は受付できない可能性があります。別の予約枠を選んで再度お試しください。", "error");
  } finally { submitButton.disabled = false; }
});

listenAvailability();
renderCalendar();
renderSlots();
