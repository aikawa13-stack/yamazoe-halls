import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { doc, getFirestore, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB4RYPAvnwets8LI6Vefnuxc_eC7ftymig",
  authDomain: "yamazoe-halls-staging.firebaseapp.com",
  projectId: "yamazoe-halls-staging",
  appId: "1:715762011677:web:e31b304a036c23f64240f4",
};

const db = getFirestore(initializeApp(firebaseConfig));
const form = document.querySelector("#reservation-form");
const status = document.querySelector("#form-status");
const submitButton = document.querySelector("#submit-button");
const dateInput = document.querySelector("#date");
const guestCount = document.querySelector("#guest-count");

const today = new Date();
today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
dateInput.min = today.toISOString().slice(0, 10);

for (let count = 1; count <= 12; count += 1) {
  guestCount.add(new Option(`${count}名`, String(count)));
}

function setStatus(message, type = "") {
  status.textContent = message;
  status.className = type;
}

function slotId(date, time) {
  return `${date}_${time.replace(":", "-")}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const data = new FormData(form);
  const date = String(data.get("date"));
  const time = String(data.get("time"));
  const id = slotId(date, time);
  const reservation = {
    slotId: id,
    date,
    time,
    guestCount: Number(data.get("guestCount")),
    customerName: String(data.get("customerName")).trim(),
    email: String(data.get("email")).trim(),
    phone: String(data.get("phone")).trim(),
    notes: String(data.get("notes")).trim(),
    status: "pending",
    createdAt: serverTimestamp(),
  };

  submitButton.disabled = true;
  setStatus("予約を送信しています…");

  try {
    await setDoc(doc(db, "reservationSlots", id), reservation);
    form.reset();
    setStatus("予約リクエストを受け付けました。内容を確認のうえご連絡します。", "success");
  } catch (error) {
    console.error("Reservation submission failed", error);
    setStatus("この日時は受付できない可能性があります。別の日時を選んで再度お試しください。", "error");
  } finally {
    submitButton.disabled = false;
  }
});
