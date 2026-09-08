import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const password = process.env.STAFF_INITIAL_PASSWORD;
if (!password || password.length < 6) {
  throw new Error("STAFF_INITIAL_PASSWORD must contain at least 6 characters.");
}

const accounts = [
  { email: "kouminkanchou@yamazoe.local", displayName: "館長", role: "manager", facility: "all" },
  { email: "higashiyama1@yamazoe.local", displayName: "東山公民館職員", role: "staff", facility: "higashiyama" },
  { email: "hatano1@yamazoe.local", displayName: "波多野公民館職員", role: "staff", facility: "hatano" },
  { email: "toyohara1@yamazoe.local", displayName: "豊原公民館職員", role: "staff", facility: "toyohara" },
];

initializeApp({ credential: applicationDefault() });
const auth = getAuth();

for (const account of accounts) {
  let user;
  try {
    user = await auth.getUserByEmail(account.email);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    user = await auth.createUser({ email: account.email, password, displayName: account.displayName });
  }
  await auth.setCustomUserClaims(user.uid, { admin: true, role: account.role, facility: account.facility });
  console.log(`${account.email}: ${user.uid}`);
}
