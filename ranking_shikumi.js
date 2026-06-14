import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAeZ6-QBxkvWLeHG-N20pjxvIHe05OK6Oc",
  authDomain: "simu-bank.firebaseapp.com",
  databaseURL: "https://simu-bank-default-rtdb.firebaseio.com",
  projectId: "simu-bank",
  storageBucket: "simu-bank.firebasestorage.app",
  messagingSenderId: "88269096434",
  appId: "1:88269096434:web:c030c1e599c9dc92af576b"
};

const app = initializeApp(firebaseConfig);
const adminNames = ["はなぴっぴ", "は"];
const db = getDatabase(app);
const auth = getAuth(app);
await signInAnonymously(auth).catch(()=>{});

const content = document.getElementById("rankingContent");
try {
  const snap = await get(ref(db, "accounts"));

  if (!snap.exists()) {
    content.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">まだユーザーがいません</p>';
  } else {
  const accounts = snap.val();
  const sorted = Object.entries(accounts)
    .sort((a, b) => (b[1].balance || 0) - (a[1].balance || 0));

  const crowns = ["👑", "🥈", "🥉"];
  const rankLabels = ["1位", "2位", "3位"];
  const podiumClass = ["podium-1st", "podium-2nd", "podium-3rd"];

  const top3 = sorted.slice(0, 3);
  const podiumOrder = [
    top3[0],
    top3[1],
    top3[2]
  ].filter(Boolean);

  let podiumHTML = '<div class="podium-wrapper">';
  podiumOrder.forEach((entry) => {
    if (!entry) return;
    const [name, data] = entry;
    const cleanName = String(name).trim();
    alert(name);
    const realRank = sorted.indexOf(entry);
   const vipBadge = data.isPremium ? '<span class="podium-vip">VIP</span>' : "";

console.log("TOP3名:", cleanName);

const isAdmin = adminNames.includes(cleanName);

const adminBadge = isAdmin
  ? '<span style="background:red;color:white;padding:2px 6px;border-radius:6px;margin-left:4px;">運営</span>'
  : "";
    podiumHTML += `
  <div class="podium-item ${podiumClass[realRank]}">
    <div class="podium-crown">${crowns[realRank]}</div>
    <div class="podium-rank">${rankLabels[realRank]}</div>

    <div class="podium-name">
      ${name}
      ${adminBadge}
      ${vipBadge}
    </div>

    <div class="podium-balance">${data.balance || 0} かむ</div>
    <div class="podium-bar"></div>
  </div>`;
  });
  podiumHTML += "</div>";

let listHTML = '<div class="rank-list">';

sorted.slice(3).forEach(([name, data], i) => {
  const vipBadge = data.isPremium
    ? '<span class="rank-vip">VIP</span>'
    : "";

  const cleanName = String(name).trim();

  console.log("ランキング名:", cleanName);

  const adminBadge = adminNames.some(
  admin => cleanName === admin
)
    ? '<span class="admin-badge">運営</span>'
    : "";

  listHTML += `
    <div class="rank-item">
      <span class="rank-num">${i + 4}位</span>
      <span class="rank-name">${name}${adminBadge}${vipBadge}</span>
      <span class="rank-balance">${data.balance || 0} かむ</span>
    </div>`;
});

  listHTML += "</div>";

    content.innerHTML = podiumHTML + listHTML;
  }
} catch (e) {
  console.error(e);
  content.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">ランキングの読み込みに失敗しました</p>';
}
