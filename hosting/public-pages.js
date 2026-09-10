import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { collection, doc, getDoc, getFirestore, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { facilityLabel, roomLabel, roomsFor, slots, slotLabel } from "./config.js";

const firebaseConfig = { apiKey: "AIzaSyB4RYPAvnwets8LI6Vefnuxc_eC7ftymig", authDomain: "yamazoe-halls-staging.firebaseapp.com", projectId: "yamazoe-halls-staging", appId: "1:715762011677:web:e31b304a036c23f64240f4" };
const db = getFirestore(initializeApp(firebaseConfig));
const page = document.body.dataset.page;
const partialDaySlots = ["morning", "afternoon", "night"];
const params = new URLSearchParams(location.search);
const today = localDate(new Date());

function localDate(value) { const date = new Date(value); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 10); }
function reservationId(facility, room, date, slot) { return `${facility}_${room}_${date}_${slot}`; }
function reservationRecordId(slotId) { return `${slotId}__${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }
function stoppedKey(room, date) { return `${room}_${date}`; }
function conflictingSlots(slot) { return slot === "all_day" ? partialDaySlots : partialDaySlots.includes(slot) ? ["all_day"] : []; }
function statusLabel(status, detailed = false) {
  const labels = detailed
    ? { available: "空き", pending: "受付中", reserved: "確定", stopped: "停止", closed: "休館日" }
    : { available: "空き", pending: "予約あり", reserved: "予約あり", stopped: "停止", closed: "休館日" };
  return labels[status] || status;
}
function monthBounds(month) { const [year, monthNumber] = month.split("-").map(Number); return [`${month}-01`, localDate(new Date(year, monthNumber, 0))]; }
function setStatus(text, type = "") { const node = document.querySelector("#page-status") || document.querySelector("#form-status"); if (node) { node.textContent = text; node.className = type; } }

function listenAvailability(facility, month, callback) {
  const [start, end] = monthBounds(month);
  const records = new Map(); const closed = new Set(); const stoppedByRoom = new Map();
  const availabilityQuery = query(collection(db, "availability"), where("facility", "==", facility), where("date", ">=", start), where("date", "<=", end), orderBy("date"));
  const closedQuery = query(collection(db, "closed_days", facility, "dates"), where("date", ">=", start), where("date", "<=", end), orderBy("date"));
  const legacyQuery = query(collection(db, "closureAvailability"), where("facilityId", "==", facility), where("date", ">=", start), where("date", "<=", end), orderBy("date"));
  const notify = () => callback({ records, closed, stopped: new Set([...stoppedByRoom.values()].flatMap((set) => [...set])) });
  const stops = [
    onSnapshot(availabilityQuery, (snapshot) => { records.clear(); snapshot.docs.forEach((item) => records.set(item.id, item.data())); notify(); }, () => setStatus("予約状況を取得できません。", "error")),
    onSnapshot(closedQuery, (snapshot) => { closed.clear(); snapshot.docs.forEach((item) => closed.add(item.data().date)); notify(); }, () => setStatus("休館日情報を取得できません。", "error")),
    onSnapshot(legacyQuery, (snapshot) => { snapshot.docs.forEach((item) => closed.add(item.data().date)); notify(); }),
    ...roomsFor(facility).map((room) => onSnapshot(query(collection(db, "stopped_days", facility, "rooms", room.id, "dates"), where("date", ">=", start), where("date", "<=", end), orderBy("date")), (snapshot) => { stoppedByRoom.set(room.id, new Set(snapshot.docs.map((item) => stoppedKey(room.id, item.data().date)))); notify(); })),
  ];
  return () => stops.forEach((stop) => stop());
}

function slotStatus(data, facility, room, date, slot) {
  if (data.closed.has(date)) return "closed";
  if (data.stopped.has(stoppedKey(room, date))) return "stopped";
  const relatedBusy = conflictingSlots(slot).some((otherSlot) => (data.records.get(reservationId(facility, room, date, otherSlot))?.status || "available") !== "available");
  if (relatedBusy) return "stopped";
  const status = data.records.get(reservationId(facility, room, date, slot))?.status || "available";
  return status === "confirmed" ? "reserved" : status === "closed" ? "stopped" : status;
}

function startCalendar() {
  const facilitySelect = document.querySelector("#facility"); const roomSelect = document.querySelector("#room");
  const calendar = document.querySelector("#calendar"); const heading = document.querySelector("#calendar-month");
  let facility = params.get("facility") || "higashiyama";
  let room = params.get("room") || roomsFor(facility)[0].id;
  let month = params.get("month") || today.slice(0, 7); let stop = null;
  function fillRooms() { roomSelect.replaceChildren(...roomsFor(facility).map((item) => new Option(item.label, item.id))); roomSelect.value = room; }
  function render(data) {
    calendar.replaceChildren(); const [year, monthNumber] = month.split("-").map(Number); heading.textContent = `${year}年${monthNumber}月`;
    for (const name of ["日", "月", "火", "水", "木", "金", "土"]) { const cell = document.createElement("div"); cell.className = "weekday"; cell.textContent = name; calendar.append(cell); }
    const first = new Date(year, monthNumber - 1, 1); for (let i = 0; i < first.getDay(); i += 1) calendar.append(document.createElement("div"));
    const days = new Date(year, monthNumber, 0).getDate();
    for (let day = 1; day <= days; day += 1) {
      const date = localDate(new Date(year, monthNumber - 1, day)); const states = slots.map((slot) => slotStatus(data, facility, room, date, slot.id));
      const status = data.closed.has(date) ? "closed" : states.some((item) => item === "pending" || item === "reserved") ? "pending" : states.some((item) => item === "stopped") ? "stopped" : "available";
      const button = document.createElement("button"); button.type = "button"; button.className = `calendar-day is-${status}`; button.disabled = date < today;
      button.innerHTML = `<strong>${day}</strong><span class="day-marker">${statusLabel(status)}</span>`;
      button.addEventListener("click", () => { location.href = `/daily?facility=${encodeURIComponent(facility)}&date=${date}`; }); calendar.append(button);
    }
  }
  function subscribe() { stop?.(); stop = listenAvailability(facility, month, render); }
  facilitySelect.value = facility; fillRooms(); subscribe();
  facilitySelect.addEventListener("change", () => { facility = facilitySelect.value; room = roomsFor(facility)[0].id; fillRooms(); subscribe(); });
  roomSelect.addEventListener("change", () => { room = roomSelect.value; subscribe(); });
  document.querySelector("#previous-month").addEventListener("click", () => { const date = new Date(`${month}-01T00:00:00`); date.setMonth(date.getMonth() - 1); if (localDate(date).slice(0, 7) >= today.slice(0, 7)) { month = localDate(date).slice(0, 7); subscribe(); } });
  document.querySelector("#next-month").addEventListener("click", () => { const date = new Date(`${month}-01T00:00:00`); date.setMonth(date.getMonth() + 1); month = localDate(date).slice(0, 7); subscribe(); });
}

function startDaily() {
  const facility = params.get("facility") || "higashiyama"; const date = params.get("date") || today; const month = date.slice(0, 7);
  document.querySelector("#daily-heading").textContent = `${facilityLabel(facility)} · ${date}`;
  listenAvailability(facility, month, (data) => {
    document.querySelector("#daily-notice").hidden = !data.closed.has(date); const list = document.querySelector("#daily-list"); list.replaceChildren();
    for (const room of roomsFor(facility)) {
      const section = document.createElement("section"); section.className = "daily-room"; section.innerHTML = `<h3>${room.label}</h3>`; const items = document.createElement("div"); items.className = "daily-room-slots";
      for (const slot of slots) {
        const status = slotStatus(data, facility, room.id, date, slot.id); const item = document.createElement("article"); item.className = `slot-item is-${status}`; item.innerHTML = `<h4>${slot.label}（${slot.hours}）</h4><p>${statusLabel(status, true)}</p>`;
        if (status === "available") { const button = document.createElement("button"); button.type = "button"; button.textContent = "予約する"; button.addEventListener("click", () => { location.href = `/reserve?facility=${encodeURIComponent(facility)}&room=${encodeURIComponent(room.id)}&date=${date}&slot=${slot.id}`; }); item.append(button); }
        items.append(item);
      }
      section.append(items); list.append(section);
    }
  });
}

function startReserve() {
  const facility = params.get("facility"); const room = params.get("room"); const date = params.get("date"); const slot = params.get("slot");
  if (!facility || !room || !date || !slot || !roomsFor(facility).some((item) => item.id === room) || !slots.some((item) => item.id === slot)) { location.replace("/calendar"); return; }
  document.querySelector("#facility").value = facility; document.querySelector("#room").value = room; document.querySelector("#date").value = date; document.querySelector("#slot").value = slot;
  document.querySelector("#facility-label").value = facilityLabel(facility); document.querySelector("#room-label").value = roomLabel(facility, room); document.querySelector("#slot-label").value = `${slotLabel(slot)}（${slots.find((item) => item.id === slot).hours}）`;
  document.querySelector("#reservation-summary").textContent = `${facilityLabel(facility)} · ${roomLabel(facility, room)} · ${date}`;
  const form = document.querySelector("#reservation-form"); const phone = document.querySelector("#phone"); const warning = document.querySelector("#phone-warning"); const confirmation = document.querySelector("#confirmation");
  const validPhone = () => { phone.value = phone.value.replace(/\D/g, ""); const valid = phone.value.length >= 10; warning.hidden = valid; return valid; };
  phone.addEventListener("input", validPhone);
  form.addEventListener("submit", (event) => { event.preventDefault(); if (!validPhone() || !form.reportValidity()) { setStatus("電話番号は10桁以上で入力してください。", "error"); return; } const data = new FormData(form); const details = [["館", facilityLabel(facility)], ["施設", roomLabel(facility, room)], ["利用日", date], ["利用区分", slotLabel(slot)], ["氏名", data.get("customerName")], ["電話番号", data.get("phone")], ["利用目的", data.get("purpose")], ["備考", data.get("notes") || "—"]]; document.querySelector("#confirmation-details").replaceChildren(...details.map(([key, value]) => { const row = document.createElement("div"); row.innerHTML = `<dt>${key}</dt><dd>${value}</dd>`; return row; })); form.hidden = true; confirmation.hidden = false; });
  document.querySelector("#edit-reservation").addEventListener("click", () => { confirmation.hidden = true; form.hidden = false; });
  document.querySelector("#confirm-reservation").addEventListener("click", async () => {
    const data = new FormData(form); const slotId = reservationId(facility, room, date, slot); const recordId = reservationRecordId(slotId); const button = document.querySelector("#confirm-reservation"); button.disabled = true;
    try {
      const [existing, closure, closed, stopped, ...related] = await Promise.all([getDoc(doc(db, "availability", slotId)), getDoc(doc(db, "closureAvailability", `${facility}_${date}`)), getDoc(doc(db, "closed_days", facility, "dates", date)), getDoc(doc(db, "stopped_days", facility, "rooms", room, "dates", date)), ...conflictingSlots(slot).map((other) => getDoc(doc(db, "availability", reservationId(facility, room, date, other))))]);
      if (closure.exists() || closed.exists() || stopped.exists() || (existing.exists() && existing.data().status !== "available") || related.some((item) => item.exists() && item.data().status !== "available")) throw new Error("この予約枠は現在利用できません。");
      const createdAt = serverTimestamp(); const reservation = { reservationId: recordId, slotId, facility, room, date, slot, customerName: String(data.get("customerName")).trim(), phone: String(data.get("phone")).trim(), purpose: String(data.get("purpose")).trim(), notes: String(data.get("notes")).trim(), status: "pending", createdAt }; const availability = { reservationId: recordId, slotId, facility, room, date, slot, status: "pending", createdAt };
      const batch = writeBatch(db); batch.set(doc(db, "reservations", recordId), reservation); batch.set(doc(db, "availability", slotId), availability); await batch.commit(); confirmation.innerHTML = "<h2>予約を受け付けました</h2><p>内容を確認のうえご連絡します。</p>";
    } catch (error) { setStatus(error.message || "予約を受け付けられませんでした。", "error"); confirmation.hidden = true; form.hidden = false; } finally { button.disabled = false; }
  });
}

if (page === "calendar") startCalendar();
if (page === "daily") startDaily();
if (page === "reserve") startReserve();
