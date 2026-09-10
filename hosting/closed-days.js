import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, getIdTokenResult, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { collection, doc, getFirestore, onSnapshot, query, serverTimestamp, where, writeBatch } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyB4RYPAvnwets8LI6Vefnuxc_eC7ftymig", authDomain: "yamazoe-halls-staging.firebaseapp.com", projectId: "yamazoe-halls-staging", appId: "1:715762011677:web:e31b304a036c23f64240f4" };
const auth = getAuth(initializeApp(firebaseConfig)); const db = getFirestore(); const params = new URLSearchParams(location.search);
const templates = { higashiyama: [1, 5, 6], hatano: [1, 2, 5], toyohara: [1, 5] };
const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
let claims = {}; let email = ""; let preview = new Map(); let stopList = null; let existingDates = new Set();
const $ = (selector) => document.querySelector(selector);
const iso = (date) => { const local = new Date(date); local.setMinutes(local.getMinutes() - local.getTimezoneOffset()); return local.toISOString().slice(0, 10); };
const closureId = (facility, date) => `${facility}_${date.replaceAll("-", "")}`;
const message = (text, type = "") => { $("#page-status").textContent = text; $("#page-status").className = type; };
const isManager = () => claims.role === "manager" && claims.facility === "all";

function nthMonday(year, month, nth) { const first = new Date(year, month - 1, 1); return 1 + ((8 - first.getDay()) % 7) + (nth - 1) * 7; }
function holidayMap(year) {
  const items = new Map(); const add = (month, day, name) => items.set(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, name);
  add(1, 1, "元日"); add(1, nthMonday(year, 1, 2), "成人の日"); add(2, 11, "建国記念の日"); add(2, 23, "天皇誕生日");
  add(3, 20, "春分の日"); add(4, 29, "昭和の日"); add(5, 3, "憲法記念日"); add(5, 4, "みどりの日"); add(5, 5, "こどもの日");
  add(7, nthMonday(year, 7, 3), "海の日"); add(8, 11, "山の日"); add(9, nthMonday(year, 9, 3), "敬老の日"); add(9, 23, "秋分の日");
  add(10, nthMonday(year, 10, 2), "スポーツの日"); add(11, 3, "文化の日"); add(11, 23, "勤労感謝の日");
  for (const [date, name] of [...items]) { const value = new Date(`${date}T00:00:00`); if (value.getDay() === 0) { value.setDate(value.getDate() + 1); const substitute = iso(value); if (!items.has(substitute)) items.set(substitute, `振替休日（${name}）`); } }
  return items;
}
function dateInMonth(date, month) { return date.startsWith(`${month}-`); }
function renderPreview() {
  const target = $("#closed-preview"); target.replaceChildren(); $("#preview-count").textContent = `${preview.size}件`; $("#save-closed-days").disabled = preview.size === 0;
  if (!preview.size) { target.innerHTML = '<p class="hint">テンプレート適用または個別追加で候補を表示します。</p>'; return; }
  [...preview.values()].sort((a, b) => a.date.localeCompare(b.date)).forEach((entry) => { const row = document.createElement("div"); row.className = "closed-day-preview-item"; row.innerHTML = `<span>${entry.date}（${entry.weekday}）${entry.holidayName ? `・${entry.holidayName}` : ""}</span>`; const remove = document.createElement("button"); remove.type = "button"; remove.className = "secondary"; remove.textContent = "除く"; remove.addEventListener("click", () => { preview.delete(entry.date); renderPreview(); }); row.append(remove); target.append(row); });
}
function setDateRange() { const month = $("#month").value; $("#individual-date").min = `${month}-01`; const end = new Date(`${month}-01T00:00:00`); end.setMonth(end.getMonth() + 1); end.setDate(0); $("#individual-date").max = iso(end); }
function updateBackLink() { const link = document.querySelector(".page-back-fixed"); link.href = `/staff/calendar?facility=${encodeURIComponent($("#facility").value)}&month=${encodeURIComponent($("#month").value)}`; }
function listenList() {
  stopList?.(); const facility = $("#facility").value; const month = $("#month").value; $("#closed-list-status").textContent = "読み込み中です。";
  stopList = onSnapshot(query(collection(db, "closedDays"), where("facilityId", "==", facility)), (snapshot) => {
    const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => dateInMonth(item.date, month)).sort((a, b) => a.date.localeCompare(b.date)); existingDates = new Set(rows.map((item) => item.date)); const list = $("#closed-list"); list.replaceChildren(); $("#closed-list-status").textContent = rows.length ? `${rows.length}件の休館日を表示しています。` : "この月の休館日は登録されていません。";
    rows.forEach((entry) => { const row = document.createElement("article"); row.className = "closed-day-item"; const info = document.createElement("div"); info.className = "closed-day-details"; const when = entry.createdAt?.toDate ? entry.createdAt.toDate().toLocaleString("ja-JP") : "—"; info.innerHTML = `<strong>${entry.date}（${entry.weekday}）</strong>${entry.holidayName ? `<br>${entry.holidayName}` : ""}<br>登録者：${entry.createdBy || "—"}<br>登録日時：${when}`; row.append(info); const remove = document.createElement("button"); remove.type = "button"; remove.className = "danger"; remove.textContent = "削除"; remove.disabled = !isManager(); remove.title = isManager() ? "例外開館として休館日を削除します" : "削除は館長のみ可能です"; remove.addEventListener("click", () => deleteClosedDay(entry)); row.append(remove); list.append(row); });
  }, () => { $("#closed-list-status").textContent = "休館日一覧を取得できません。職員権限を確認してください。"; });
}
async function deleteClosedDay(entry) {
  if (!isManager()) { message("削除の権限がありません（館長のみ可能です）。", "error"); return; }
  if (!confirm(`${entry.date} を休館日から削除し、開館扱いにしますか？`)) return;
  try { const batch = writeBatch(db); const facility = entry.facilityId; batch.delete(doc(db, "closedDays", entry.id)); batch.delete(doc(db, "closureAvailability", `${facility}_${entry.date}`)); batch.delete(doc(db, "closed_days", facility, "dates", entry.date)); batch.set(doc(collection(db, "closedDayAuditLogs")), { action: "delete", facilityId: facility, date: entry.date, deletedBy: email, deletedAt: serverTimestamp() }); await batch.commit(); message("休館日を削除し、開館扱いとしました。", "success"); } catch { message("休館日を削除できませんでした。", "error"); }
}
function applyTemplate() {
  const facility = $("#facility").value; const month = $("#month").value; const [year, numericMonth] = month.split("-").map(Number); const holidays = holidayMap(year); preview = new Map(); const last = new Date(year, numericMonth, 0).getDate();
  for (let day = 1; day <= last; day += 1) { const date = `${month}-${String(day).padStart(2, "0")}`; const current = new Date(`${date}T00:00:00`); const holidayName = holidays.get(date) || ""; if (templates[facility].includes(current.getDay()) || holidayName) preview.set(date, { date, weekday: weekdayNames[current.getDay()], isHoliday: Boolean(holidayName), holidayName }); }
  renderPreview(); message("テンプレートを登録予定一覧に追加しました。", "success");
}
async function savePreview() {
  const entries = [...preview.values()].filter((entry) => !existingDates.has(entry.date)); if (!entries.length) { message("選択した日付はすべて登録済みです。", "error"); return; } const facility = $("#facility").value; const batch = writeBatch(db);
  for (const entry of entries) { batch.set(doc(db, "closedDays", closureId(facility, entry.date)), { facilityId: facility, date: entry.date, weekday: entry.weekday, isHoliday: entry.isHoliday, holidayName: entry.holidayName, createdBy: email, createdAt: serverTimestamp() }); batch.set(doc(db, "closureAvailability", `${facility}_${entry.date}`), { facilityId: facility, date: entry.date }); batch.set(doc(db, "closed_days", facility, "dates", entry.date), { facilityId: facility, date: entry.date }); }
  try { await batch.commit(); preview = new Map(); renderPreview(); message("休館日として登録しました。", "success"); } catch { message("休館日を登録できませんでした。既に登録済みの日付がないか確認してください。", "error"); }
}
function activate(user, token) {
  claims = token.claims; email = user.email; if (!claims.admin || !claims.facility) { $("#login-status").textContent = "職員権限を確認できません。再ログインしてください。"; return; }
  const facility = claims.facility === "all" ? (params.get("facility") || "higashiyama") : claims.facility; const month = params.get("month") || iso(new Date()).slice(0, 7); $("#facility").value = facility; $("#facility").disabled = claims.facility !== "all"; $("#month").value = month; $("#staff-user").textContent = `${email} としてログイン中`; $("#login-panel").hidden = true; $("#closed-days-panel").hidden = false;
  document.body.classList.add("has-fixed-back"); const back = document.createElement("a"); back.className = "page-back page-back-fixed"; back.textContent = "← 戻る（カレンダーへ）"; document.body.append(back); setDateRange(); updateBackLink(); listenList(); renderPreview();
  $("#facility").addEventListener("change", () => { preview = new Map(); renderPreview(); updateBackLink(); listenList(); }); $("#month").addEventListener("change", () => { preview = new Map(); renderPreview(); setDateRange(); updateBackLink(); listenList(); }); $("#apply-template").addEventListener("click", applyTemplate); $("#add-individual").addEventListener("click", () => { const date = $("#individual-date").value; if (!date) { message("追加する日付を選択してください。", "error"); return; } const value = new Date(`${date}T00:00:00`); preview.set(date, { date, weekday: weekdayNames[value.getDay()], isHoliday: false, holidayName: "" }); renderPreview(); }); $("#save-closed-days").addEventListener("click", savePreview);
}
$("#login-form").addEventListener("submit", async (event) => { event.preventDefault(); try { await signInWithEmailAndPassword(auth, $("#login-email").value, $("#login-password").value); } catch { $("#login-status").textContent = "メールアドレスまたはパスワードを確認してください。"; } });
$("#sign-out").addEventListener("click", () => signOut(auth));
onAuthStateChanged(auth, async (user) => { if (!user) { $("#login-panel").hidden = false; $("#closed-days-panel").hidden = true; return; } activate(user, await getIdTokenResult(user, true)); });
