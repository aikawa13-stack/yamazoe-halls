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

const today = new Date();
today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
dateInput.min = today.toISOString().slice(0, 10);

function setStatus(message, type = "") {
  status.textContent = message;
  status.className = type;
}

function slotId(facility, date, slot) {
  return `${facility}_${date}_${slot}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const data = new FormData(form);
  const facility = String(data.get("facility"));
  const date = String(data.get("date"));
  const slot = String(data.get("slot"));
  const id = slotId(facility, date, slot);
  const reservation = {
    slotId: id,
    facility,
    date,
    slot,
    customerName: String(data.get("customerName")).trim(),
    phone: String(data.get("phone")).trim(),
    purpose: String(data.get("purpose")).trim(),
    notes: String(data.get("notes")).trim(),
    status: "pending",
    createdAt: serverTimestamp(),
  };

  submitButton.disabled = true;
  setStatus("予約を送信しています…");

  try {
    await setDoc(doc(db, "reservations", id), reservation);
    form.reset();
    setStatus("予約リクエストを受け付けました。内容を確認のうえご連絡します。", "success");
  } catch (error) {
    console.error("Reservation submission failed", error);
    setStatus("この施設・利用日・利用区分は受付できない可能性があります。別の予約枠を選んで再度お試しください。", "error");
  } finally {
    submitButton.disabled = false;
  }
});
