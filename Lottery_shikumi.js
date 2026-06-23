import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, set, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
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
const db = getDatabase(app);
const auth = getAuth(app);

const TICKET_PRICE = 2;

// 当選等級テーブル（確率は%。合計が外れ以外の確率）
const PRIZE_TABLE = [
  { rank: '1等', amount: 3000, prob: 0.0005 },
  { rank: '2等', amount: 800,  prob: 0.005 },
  { rank: '3等', amount: 150,  prob: 0.05 },
  { rank: '4等', amount: 70,   prob: 0.5 },
  { rank: '5等', amount: 15,   prob: 2.0 },
  { rank: '6等', amount: 5,    prob: 7.5 },
  { rank: '7等', amount: 2,    prob: 25.0 },
];

let currentUserName = null;
let currentUser = null;

const restoreLoading = document.getElementById('restoreLoading');
const mainContent = document.getElementById('mainContent');
const notLoggedIn = document.getElementById('notLoggedIn');

function updateBalanceDisplay() {
  const amount = currentUser ? currentUser.balance || 0 : 0;
  const formatted = `${amount} かむ`;
  const drawerBalance = document.getElementById('userBalance');
  const mainBalance = document.getElementById('userBalanceMain');
  if (drawerBalance) drawerBalance.textContent = formatted;
  if (mainBalance) mainBalance.textContent = formatted;
}

async function init() {
  try {
    await signInAnonymously(auth);
  } catch {}

  currentUserName = localStorage.getItem('shimupay_user');

  if (!currentUserName) {
    restoreLoading.style.display = 'none';
    notLoggedIn.style.display = 'block';
    return;
  }

  const snap = await get(ref(db, 'accounts/' + currentUserName));
  if (!snap.exists()) {
    localStorage.removeItem('shimupay_user');
    restoreLoading.style.display = 'none';
    notLoggedIn.style.display = 'block';
    return;
  }

  currentUser = snap.val();
  document.getElementById('userName').textContent = currentUserName;
  updateBalanceDisplay();

  restoreLoading.style.display = 'none';
  mainContent.style.display = 'block';

  loadLotteryHistory();
}

// 抽選ロジック：0〜100の乱数で等級判定
function runDraw() {
  const r = Math.random() * 100;
  let acc = 0;
  for (const prize of PRIZE_TABLE) {
    acc += prize.prob;
    if (r < acc) return prize;
  }
  return null; // ハズレ
}

window.drawLottery = async function() {
  const msg = document.getElementById('drawMsg');
  const btn = document.getElementById('drawBtn');

  if (!currentUser || (currentUser.balance || 0) < TICKET_PRICE) {
    msg.textContent = '残高が不足しています';
    return;
  }

  btn.disabled = true;
  msg.style.color = '#888';
  msg.textContent = '抽選中...';

  try {
    const prize = runDraw();
    const winAmount = prize ? prize.amount : 0;
    const netChange = winAmount - TICKET_PRICE;
    let newBalance = (currentUser.balance || 0) + netChange;

    if (newBalance > 10000) {
      msg.textContent = '残高上限（10000かむ）に達するため引けません';
      btn.disabled = false;
      return;
    }

    const historyLabel = prize
      ? `🎟️ 宝くじ${prize.rank} +${prize.amount}かむ（-${TICKET_PRICE}かむ）`
      : `🎟️ 宝くじ ハズレ（-${TICKET_PRICE}かむ）`;

    const newHistory = [...(currentUser.history || []), historyLabel].slice(-10);

    const lotteryEntry = {
      rank: prize ? prize.rank : 'ハズレ',
      amount: winAmount,
      cost: TICKET_PRICE,
      timestamp: Date.now()
    };

    const newUserData = { ...currentUser, balance: newBalance, history: newHistory };

    await set(ref(db, `accounts/${currentUserName}`), newUserData);
    await set(ref(db, `lottery_logs/${currentUserName}/${Date.now()}`), lotteryEntry);
    await trimLotteryLogs();

    currentUser.balance = newBalance;
    currentUser.history = newHistory;
    updateBalanceDisplay();

    showResult(prize);
    loadLotteryHistory();
    msg.textContent = '';
  } catch (e) {
    console.error('宝くじエラー:', e);
    msg.style.color = 'red';
    msg.textContent = '抽選に失敗しました：' + (e.message || e);
  } finally {
    btn.disabled = false;
  }
};

function showResult(prize) {
  const modal = document.getElementById('resultModal');
  const rankEl = document.getElementById('resultRank');
  const amountEl = document.getElementById('resultAmount');
  const subEl = document.getElementById('resultSub');

  if (prize) {
    const rankNum = PRIZE_TABLE.findIndex(p => p.rank === prize.rank) + 1;
    rankEl.textContent = `🎉 ${prize.rank} 当選！`;
    rankEl.className = `result-rank rank-${rankNum}`;
    amountEl.textContent = `+${prize.amount} かむ`;
    subEl.textContent = `（くじ代 -${TICKET_PRICE} かむ）`;
  } else {
    rankEl.textContent = '残念、ハズレ';
    rankEl.className = 'result-rank rank-lose';
    amountEl.textContent = `-${TICKET_PRICE} かむ`;
    subEl.textContent = 'また挑戦してね！';
  }

  modal.classList.add('open');
}

window.drawLotteryBulk = async function() {
  const msg = document.getElementById('drawMsg');
  const bulkBtn = document.querySelector('button[onclick="drawLotteryBulk()"]');
  const drawBtn = document.getElementById('drawBtn');
  const countInput = document.getElementById('bulkCount');
  const count = parseInt(countInput.value, 10);

  if (!count || count < 1) {
    msg.textContent = '枚数を正しく入力してください';
    return;
  }

  const totalCost = count * TICKET_PRICE;
  if (!currentUser || (currentUser.balance || 0) < totalCost) {
    msg.textContent = `残高が不足しています（必要: ${totalCost}かむ）`;
    return;
  }

  bulkBtn.disabled = true;
  drawBtn.disabled = true;
  msg.style.color = '#888';
  msg.textContent = `${count}枚抽選中...`;

  try {
    const results = [];
    let totalWin = 0;

    for (let i = 0; i < count; i++) {
      const prize = runDraw();
      const winAmount = prize ? prize.amount : 0;
      totalWin += winAmount;
      results.push({ rank: prize ? prize.rank : 'ハズレ', amount: winAmount });
    }

    const netChange = totalWin - totalCost;
    let newBalance = (currentUser.balance || 0) + netChange;

    if (newBalance > 10000) {
      msg.style.color = 'red';
      msg.textContent = '残高上限（10000かむ）に達するため引けません';
      bulkBtn.disabled = false;
      drawBtn.disabled = false;
      return;
    }
    if (newBalance < 0) newBalance = 0;

    const historyLabel = `🎟️ 宝くじ${count}連 計+${totalWin}かむ（-${totalCost}かむ）`;
    const newHistory = [...(currentUser.history || []), historyLabel].slice(-10);
    const newUserData = { ...currentUser, balance: newBalance, history: newHistory };

    await set(ref(db, `accounts/${currentUserName}`), newUserData);

    const now = Date.now();
    const logUpdates = {};
    results.forEach((r, i) => {
      logUpdates[`lottery_logs/${currentUserName}/${now}_${i}`] = {
        rank: r.rank, amount: r.amount, cost: TICKET_PRICE, timestamp: now
      };
    });
    await update(ref(db), logUpdates);
    await trimLotteryLogs();

    currentUser.balance = newBalance;
    currentUser.history = newHistory;
    updateBalanceDisplay();

    showBulkResult(results, totalCost, totalWin);
    loadLotteryHistory();
    msg.textContent = '';
  } catch (e) {
    console.error('まとめ買いエラー:', e);
    msg.style.color = 'red';
    msg.textContent = '抽選に失敗しました：' + (e.message || e);
  } finally {
    bulkBtn.disabled = false;
    drawBtn.disabled = false;
  }
};

function showBulkResult(results, totalCost, totalWin) {
  const modal = document.getElementById('resultModal');
  const rankEl = document.getElementById('resultRank');
  const amountEl = document.getElementById('resultAmount');
  const subEl = document.getElementById('resultSub');

  const net = totalWin - totalCost;
  rankEl.textContent = `🎟️ ${results.length}連抽選結果`;
  rankEl.className = 'result-rank';
  amountEl.innerHTML = `<div class="bulk-total" style="color:${net>=0?'#2e7d32':'#c62828'}">${net>=0?'+':''}${net} かむ</div>`;

  // 等級ごとに集計
  const order = ['1等','2等','3等','4等','5等','6等','7等','ハズレ'];
  const counts = {};
  results.forEach(r => { counts[r.rank] = (counts[r.rank] || 0) + 1; });

  const listHTML = order
    .filter(rank => counts[rank])
    .map(rank => {
      const c = counts[rank];
      const win = rank !== 'ハズレ';
      const amountPer = results.find(r => r.rank === rank).amount;
      const total = amountPer * c;
      return `<div class="bulk-result-row ${win?'win':''}">
        <span>${rank} × ${c}枚</span>
        <span>${win ? '+'+total : '0'} かむ</span>
      </div>`;
    }).join('');

  subEl.innerHTML = `<div class="bulk-result-list">${listHTML}</div>くじ代合計: -${totalCost}かむ`;

  modal.classList.add('open');
}

window.closeResultModal = function() {
  const modal = document.getElementById('resultModal');
  const layer = document.getElementById('celebrationLayer');
  modal.classList.remove('open', 'celebrate');
  if (layer) layer.innerHTML = '';
};

async function trimLotteryLogs() {
  const snap = await get(ref(db, 'lottery_logs/' + currentUserName));
  if (!snap.exists()) return;

  const entries = Object.entries(snap.val())
    .sort(([, a], [, b]) => b.timestamp - a.timestamp);

  if (entries.length <= 5) return;

  const updates = {};
  for (const [key] of entries.slice(9)) {
    updates[`lottery_logs/${currentUserName}/${key}`] = null;
  }
  await update(ref(db), updates);
}

async function loadLotteryHistory() {
  const historyDiv = document.getElementById('lotteryHistory');
  const snap = await get(ref(db, 'lottery_logs/' + currentUserName));

  if (!snap.exists()) {
    historyDiv.innerHTML = '<p class="empty-state">まだくじを引いていません</p>';
    return;
  }

  const logs = Object.values(snap.val())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 9);

  historyDiv.innerHTML = logs.map(log => {
    const date = new Date(log.timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const resultText = log.rank === 'ハズレ' ? 'ハズレ' : `${log.rank} +${log.amount}かむ`;
    return `<div class="lottery-history-item"><span>${date}</span><span>${resultText}</span></div>`;
  }).join('');
}

// ドロワー開閉（共通）
function setDrawerOpen(isOpen) {
  document.getElementById('drawer').classList.toggle('open', isOpen);
  document.getElementById('drawerOverlay').classList.toggle('open', isOpen);
}
window.toggleDrawer = function() {
  setDrawerOpen(!document.getElementById('drawer').classList.contains('open'));
};
window.closeDrawer = function() {
  setDrawerOpen(false);
};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

init();