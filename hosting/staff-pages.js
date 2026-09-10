import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, getIdTokenResult, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, getFirestore, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { facilityLabel, roomsFor, slots } from "./config.js";

const firebaseConfig = { apiKey: "AIzaSyB4RYPAvnwets8LI6Vefnuxc_eC7ftymig", authDomain: "yamazoe-halls-staging.firebaseapp.com", projectId: "yamazoe-halls-staging", appId: "1:715762011677:web:e31b304a036c23f64240f4" };
const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);
const page = document.body.dataset.staffPage; const params = new URLSearchParams(location.search); const partialSlots = ["morning", "afternoon", "night"];
let accessFacility = null; let staffEmail = null; let unsubscribe = null;
function localDate(value) { const date = new Date(value); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 10); }
function reservationId(facility, room, date, slot) { return `${facility}_${room}_${date}_${slot}`; }
function stoppedKey(room, date) { return `${room}_${date}`; }
function monthBounds(month) { const [year, number] = month.split("-").map(Number); return [`${month}-01`, localDate(new Date(year, number, 0))]; }
function conflicts(slot) { return slot === "all_day" ? partialSlots : partialSlots.includes(slot) ? ["all_day"] : []; }
function label(status, detail = false) { return (detail ? { available: "空き", pending: "受付中", reserved: "確定", stopped: "停止", closed: "休館日" } : { available: "空き", pending: "予約あり", reserved: "予約あり", stopped: "停止", closed: "休館日" })[status] || status; }
function message(text, type = "") { const node = document.querySelector("#page-status"); if (node) { node.textContent = text; node.className = type; } }
function closureId(facility, date) { return `${facility}_${date.replaceAll("-", "")}`; }
function weekday(date) { return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(`${date}T00:00:00`).getDay()]; }
async function findReservationId(facility, room, date, slot) {
  const snapshot = await getDocs(query(collection(db, "reservations"), where("facility", "==", facility)));
  const matches = snapshot.docs.filter((item) => { const data = item.data(); return data.room === room && data.date === date && data.slot === slot; }).sort((left, right) => {
    const leftActive = ["pending", "confirmed"].includes(left.data().status) ? 1 : 0; const rightActive = ["pending", "confirmed"].includes(right.data().status) ? 1 : 0;
    if (leftActive !== rightActive) return rightActive - leftActive; return (right.data().createdAt?.toMillis?.() || 0) - (left.data().createdAt?.toMillis?.() || 0);
  });
  return matches[0]?.id || null;
}

function listen(facility, month, callback) {
  const [start, end] = monthBounds(month); const records = new Map(); const closed = new Set(); const stoppedByRoom = new Map();
  const notify = () => callback({ records, closed, stopped: new Set([...stoppedByRoom.values()].flatMap((set) => [...set])) });
  const stops = [
    onSnapshot(query(collection(db, "availability"), where("facility", "==", facility), where("date", ">=", start), where("date", "<=", end), orderBy("date")), (snapshot) => { records.clear(); snapshot.docs.forEach((item) => records.set(item.id, item.data())); notify(); }),
    onSnapshot(query(collection(db, "closed_days", facility, "dates"), where("date", ">=", start), where("date", "<=", end), orderBy("date")), (snapshot) => { closed.clear(); snapshot.docs.forEach((item) => closed.add(item.data().date)); notify(); }),
    onSnapshot(query(collection(db, "closureAvailability"), where("facilityId", "==", facility), where("date", ">=", start), where("date", "<=", end), orderBy("date")), (snapshot) => { snapshot.docs.forEach((item) => closed.add(item.data().date)); notify(); }),
    ...roomsFor(facility).map((room) => onSnapshot(query(collection(db, "stopped_days", facility, "rooms", room.id, "dates"), where("date", ">=", start), where("date", "<=", end), orderBy("date")), (snapshot) => { stoppedByRoom.set(room.id, new Set(snapshot.docs.map((item) => stoppedKey(room.id, item.data().date)))); notify(); })),
  ];
  return () => stops.forEach((stop) => stop());
}
function slotStatus(data, facility, room, date, slot) {
  if (data.closed.has(date)) return "closed"; if (data.stopped.has(stoppedKey(room, date))) return "stopped";
  if (conflicts(slot).some((other) => (data.records.get(reservationId(facility, room, date, other))?.status || "available") !== "available")) return "stopped";
  const status = data.records.get(reservationId(facility, room, date, slot))?.status || "available"; return status === "confirmed" ? "reserved" : status === "closed" ? "stopped" : status;
}

function startCalendar() {
  const facilitySelect = document.querySelector("#facility"); const roomSelect = document.querySelector("#room"); const calendar = document.querySelector("#calendar"); const heading = document.querySelector("#calendar-month");
  let facility = accessFacility === "all" ? (params.get("facility") || "higashiyama") : accessFacility; let room = params.get("room") || roomsFor(facility)[0].id; let month = params.get("month") || localDate(new Date()).slice(0, 7);
  facilitySelect.value = facility; facilitySelect.disabled = accessFacility !== "all";
  const fillRooms = () => { roomSelect.replaceChildren(...roomsFor(facility).map((item) => new Option(item.label, item.id))); roomSelect.value = room; };
  const render = (data) => { calendar.replaceChildren(); const [year, number] = month.split("-").map(Number); heading.textContent = `${year}年${number}月`; for (const day of ["日", "月", "火", "水", "木", "金", "土"]) { const cell = document.createElement("div"); cell.className = "weekday"; cell.textContent = day; calendar.append(cell); } const first = new Date(year, number - 1, 1); for (let i = 0; i < first.getDay(); i += 1) calendar.append(document.createElement("div")); for (let day = 1; day <= new Date(year, number, 0).getDate(); day += 1) { const date = localDate(new Date(year, number - 1, day)); const states = slots.map((slot) => slotStatus(data, facility, room, date, slot.id)); const status = data.closed.has(date) ? "closed" : states.some((item) => item === "pending" || item === "reserved") ? "pending" : states.some((item) => item === "stopped") ? "stopped" : "available"; const button = document.createElement("button"); button.type = "button"; button.className = `calendar-day is-${status}`; button.innerHTML = `<strong>${day}</strong><span class="day-marker">${label(status)}</span>`; button.addEventListener("click", () => { location.href = `/staff/daily?facility=${facility}&date=${date}`; }); calendar.append(button); } };
  const subscribe = () => { unsubscribe?.(); unsubscribe = listen(facility, month, render); };
  fillRooms(); subscribe(); facilitySelect.addEventListener("change", () => { facility = facilitySelect.value; room = roomsFor(facility)[0].id; fillRooms(); subscribe(); }); roomSelect.addEventListener("change", () => { room = roomSelect.value; subscribe(); });
  document.querySelector("#previous-month").addEventListener("click", () => { const date = new Date(`${month}-01T00:00:00`); date.setMonth(date.getMonth() - 1); month = localDate(date).slice(0, 7); subscribe(); }); document.querySelector("#next-month").addEventListener("click", () => { const date = new Date(`${month}-01T00:00:00`); date.setMonth(date.getMonth() + 1); month = localDate(date).slice(0, 7); subscribe(); });
}
function startDaily() {
  const facility = accessFacility === "all" ? (params.get("facility") || "higashiyama") : accessFacility; const date = params.get("date") || localDate(new Date()); document.querySelector("#daily-heading").textContent = `${facilityLabel(facility)} · ${date}`; document.querySelector("#calendar-link").href = `/staff/calendar?facility=${facility}&month=${date.slice(0, 7)}`;
  unsubscribe = listen(facility, date.slice(0, 7), (data) => { const closed = data.closed.has(date); document.querySelector("#daily-notice").hidden = !closed; document.querySelector("#set-closed-day").hidden = closed; document.querySelector("#clear-closed-day").hidden = !closed; const list = document.querySelector("#daily-list"); list.replaceChildren(); for (const room of roomsFor(facility)) { const section = document.createElement("section"); section.className = "daily-room"; section.innerHTML = `<h3>${room.label}</h3>`; const items = document.createElement("div"); items.className = "daily-room-slots"; for (const slot of slots) { const status = slotStatus(data, facility, room.id, date, slot.id); const item = document.createElement("article"); item.className = `slot-item is-${status}`; item.dataset.room = room.id; item.dataset.slot = slot.id; item.dataset.status = status === "reserved" ? "confirmed" : status; item.innerHTML = `<h4>${slot.label}（${slot.hours}）</h4><p>${label(status, true)}</p>`; items.append(item); } section.append(items); list.append(section); } });
  document.querySelector("#set-closed-day").addEventListener("click", async () => { if (!window.confirm(`${date} を休館日に設定しますか？`)) return; try { const batch = writeBatch(db); batch.set(doc(db, "closedDays", closureId(facility, date)), { facilityId: facility, date, weekday: weekday(date), isHoliday: false, holidayName: "", createdBy: staffEmail, createdAt: serverTimestamp() }); batch.set(doc(db, "closureAvailability", `${facility}_${date}`), { facilityId: facility, date }); batch.set(doc(db, "closed_days", facility, "dates", date), { facilityId: facility, date }); await batch.commit(); message("休館日として登録しました。", "success"); } catch { message("休館日を登録できません。職員権限を確認してください。", "error"); } });
  document.querySelector("#clear-closed-day").addEventListener("click", async () => { if (!window.confirm(`${date} を休館日から削除し、開館扱いにしますか？`)) return; try { const batch = writeBatch(db); batch.delete(doc(db, "closedDays", closureId(facility, date))); batch.delete(doc(db, "closureAvailability", `${facility}_${date}`)); batch.delete(doc(db, "closed_days", facility, "dates", date)); batch.set(doc(collection(db, "closedDayAuditLogs")), { action: "delete", facilityId: facility, date, deletedBy: staffEmail, deletedAt: serverTimestamp() }); await batch.commit(); message("休館日を削除し、開館扱いとしました。", "success"); } catch { message("休館日を削除できません。職員権限を確認してください。", "error"); } });
}
function showLogin(user, claims) { const login = document.querySelector("#login-panel"); const panel = document.querySelector("#staff-panel"); if (!user) { login.hidden = false; panel.hidden = true; return; } if (!claims.admin || !claims.facility) { document.querySelector("#login-status").textContent = "職員権限を確認できません。再ログインしてください。"; return; } accessFacility = claims.facility; staffEmail = user.email; login.hidden = true; panel.hidden = false; const userText = document.querySelector("#staff-user"); if (userText) userText.textContent = `${user.email} としてログイン中`; if (page === "calendar") startCalendar(); else startDaily(); }
document.querySelector("#login-form").addEventListener("submit", async (event) => { event.preventDefault(); try { await signInWithEmailAndPassword(auth, document.querySelector("#login-email").value, document.querySelector("#login-password").value); } catch { document.querySelector("#login-status").textContent = "メールアドレスまたはパスワードを確認してください。"; } });
document.querySelector("#sign-out")?.addEventListener("click", () => signOut(auth));
document.querySelectorAll('a[href="/admin.html"]').forEach((link) => { link.href = "/staff/calendar"; });
document.addEventListener("click", async (event) => {
  if (page !== "daily") return;
  const item = event.target.closest(".slot-item"); if (!item) return;
  const facility = accessFacility === "all" ? (params.get("facility") || "higashiyama") : accessFacility;
  const date = params.get("date") || localDate(new Date()); const roomLabel = item.closest(".daily-room")?.querySelector("h3")?.textContent;
  const room = item.dataset.room || roomsFor(facility).find((entry) => entry.label === roomLabel)?.id; const slot = item.dataset.slot || slots.find((entry) => item.querySelector("h4")?.textContent.startsWith(entry.label))?.id;
  if (!room || !slot) return;
  if (item.classList.contains("is-available")) { location.href = `/staff/reserve?facility=${facility}&room=${room}&date=${date}&slot=${slot}`; return; }
  const direct = await getDoc(doc(db, "availability", reservationId(facility, room, date, slot)));
  let reservationIdForDetail = direct.data()?.reservationId || direct.data()?.reservationID || direct.data()?.slotId || await findReservationId(facility, room, date, slot);
  if (!reservationIdForDetail) {
    for (const otherSlot of conflicts(slot)) { const related = await getDoc(doc(db, "availability", reservationId(facility, room, date, otherSlot))); reservationIdForDetail = related.data()?.reservationId || related.data()?.reservationID || related.data()?.slotId || await findReservationId(facility, room, date, otherSlot); if (reservationIdForDetail) break; }
  }
  const detail = new URLSearchParams({ facility, room, date, slot, selectedSlot: slot, status: item.dataset.status || (item.classList.contains("is-reserved") ? "confirmed" : item.classList.contains("is-closed") ? "closed" : item.classList.contains("is-stopped") ? "stopped" : "canceled") });
  if (reservationIdForDetail) detail.set("reservationId", reservationIdForDetail);
  location.href = `/staff/detail?${detail}`;
});
if (page === "daily") {
  const facility = params.get("facility") || "higashiyama"; const date = params.get("date") || localDate(new Date());
  document.body.classList.add("has-fixed-back");
  const back = document.createElement("a"); back.className = "page-back page-back-fixed"; back.href = `/staff/calendar?facility=${encodeURIComponent(facility)}&month=${date.slice(0, 7)}`; back.textContent = "← 戻る（カレンダーへ）"; document.body.append(back);
}
if (page === "calendar") {
  const calendar = document.querySelector("#calendar"); const facilitySelect = document.querySelector("#facility"); const monthHeading = document.querySelector("#calendar-month");
  const actions = document.createElement("div"); actions.className = "calendar-page-actions"; const closedDays = document.createElement("a"); closedDays.className = "page-back"; closedDays.textContent = "休館日設定"; actions.append(closedDays); calendar.parentElement.insertBefore(actions, calendar);
  const syncClosedDaysLink = () => { const facility = facilitySelect.value || "higashiyama"; const month = monthHeading.textContent.match(/(\d{4})年(\d+)月/); const value = month ? `${month[1]}-${String(month[2]).padStart(2, "0")}` : localDate(new Date()).slice(0, 7); closedDays.href = `/staff/closed-days?facility=${encodeURIComponent(facility)}&month=${value}`; };
  facilitySelect.addEventListener("change", () => setTimeout(syncClosedDaysLink)); document.querySelector("#previous-month").addEventListener("click", () => setTimeout(syncClosedDaysLink)); document.querySelector("#next-month").addEventListener("click", () => setTimeout(syncClosedDaysLink)); setTimeout(syncClosedDaysLink);
  document.body.classList.add("has-fixed-back"); const back = document.createElement("a"); back.className = "page-back page-back-fixed"; back.href = "/"; back.textContent = "← 戻る（予約トップへ）"; document.body.append(back);
}
onAuthStateChanged(auth, async (user) => showLogin(user, user ? (await getIdTokenResult(user, true)).claims : {}));
