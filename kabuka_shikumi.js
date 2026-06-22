import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, set, push, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
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

let currentUser = null, currentUserName = null;
let myCompanyId = null, myCompanyData = null;
let tradeCompanyId = null, tradeType = null;
const VIP_TYPES = ["1month", "3month", "12month"];

function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function $(id){return document.getElementById(id);}
function formatPrice(value){return Math.max(1, Math.trunc(Number(value) || 0));}
function isVip(user) {
  if (!user) return false;
  if (user.premiumExpireAt) return user.premiumExpireAt > Date.now();
  return VIP_TYPES.includes(user.premiumType) || user.isPremium === true || user.vip === true;
}
function updateUserInfo(){
  try{
    if ($('userName')) $('userName').textContent = currentUserName || '-';
    if ($('userBalance')) $('userBalance').textContent = Math.trunc(Number(currentUser?.balance || 0));
  }catch(e){console.warn('updateUserInfo',e)}
}

async function dbGet(path) {
  try {
    return await get(ref(db, path));
  } catch (e) {
    throw new Error(`get ${path} failed: ${e.message}`);
  }
}
async function dbGetOptional(path) {
  try {
    return await get(ref(db, path));
  } catch (e) {
    if (e.message && e.message.includes('Permission denied')) {
      return null;
    }
    throw new Error(`get ${path} failed: ${e.message}`);
  }
}
async function dbUpdate(path, data) {
  try {
    return await update(ref(db, path), data);
  } catch (e) {
    throw new Error(`update ${path} failed: ${e.message}`);
  }
}
async function dbSet(path, value) {
  try {
    return await set(ref(db, path), value);
  } catch (e) {
    throw new Error(`set ${path} failed: ${e.message}`);
  }
}
async function dbSetOptional(path, value) {
  try {
    return await set(ref(db, path), value);
  } catch (e) {
    if (e.message && e.message.includes('Permission denied')) {
      console.warn(`optional set ${path} denied: ${e.message}`);
      return null;
    }
    throw new Error(`set ${path} failed: ${e.message}`);
  }
}

window.setDrawerOpen = function(isOpen) {
  $('drawer').classList.toggle('open', isOpen);
  $('drawerOverlay').classList.toggle('open', isOpen);
};
window.toggleDrawer = function() { setDrawerOpen(!$('drawer').classList.contains('open')); };
window.closeDrawer = function() { setDrawerOpen(false); };

// ===== 初期化 =====
async function init() {
  try {
    await signInAnonymously(auth);
    const saved = localStorage.getItem('shimupay_user');
    if (!saved) { showNotLoggedIn(); return; }
    const snap = await get(ref(db, 'accounts/' + saved));
    if (!snap.exists()) { showNotLoggedIn(); return; }
    currentUser = snap.val();
    currentUserName = saved;
    $('restoreLoading').style.display = 'none';
    $('mainContent').style.display = 'block';
    updateUserInfo();
    loadMarket();
    await loadMyCompany();
    loadHoldings();
  } catch(e) { console.error(e); showNotLoggedIn(); }
}

function showNotLoggedIn() {
  $('restoreLoading').style.display = 'none';
  $('notLoggedIn').style.display = 'block';
}

// ===== タブ =====
window.showTab = function(tab) {
  ['market','mycompany','holdings'].forEach(t => {
    $('tab-' + t).style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    btn.classList.toggle('active', ['market','mycompany','holdings'][i] === tab);
  });
  if (tab === 'holdings') loadHoldings();
};

// ===== ミニチャート描画 =====
function renderMiniChart(container, history, currentPrice) {
  const prices = [...(history || []).slice(-8), currentPrice];
  if (prices.length < 2) { container.innerHTML = ''; return; }
  const max = Math.max(...prices), min = Math.min(...prices);
  const range = max - min || 1;
  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * 100;
    const y = 90 - ((p - min) / range) * 80;
    return `${x},${y}`;
  }).join(' ');
  const trend = prices[prices.length - 1] > prices[0] ? 'up' : prices[prices.length - 1] < prices[0] ? 'down' : 'same';
  container.innerHTML = `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="mini-line-chart ${trend}">
      <polyline points="${points}" />
      ${prices.map((p, i) => {
        const x = (i / (prices.length - 1)) * 100;
        const y = 90 - ((p - min) / range) * 80;
        return `<circle cx="${x}" cy="${y}" r="2.5" />`;
      }).join('')}
    </svg>`;
}

function renderBigChart(container, history, currentPrice) {
  const prices = [...(history || []).slice(-16), currentPrice];
  if (prices.length < 2) { container.innerHTML = ''; return; }
  const max = Math.max(...prices), min = Math.min(...prices);
  const range = max - min || 1;
  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * 100;
    const y = 92 - ((p - min) / range) * 84;
    return `${x},${y}`;
  }).join(' ');
  const trend = prices[prices.length - 1] > prices[0] ? 'up' : prices[prices.length - 1] < prices[0] ? 'down' : 'same';
  const first = prices[0], last = prices[prices.length - 1];
  container.innerHTML = `
    <div class="chart-inner">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="big-line-chart ${trend}">
        <polyline points="${points}" />
      </svg>
    </div>
    <div class="chart-labels"><span>${first} かむ</span><span>${last} かむ</span></div>`;
}

// ===== 市場 =====
function loadMarket() {
  onValue(ref(db, 'companies'), snap => {
    const list = $('companyList');
    if (!snap.exists()) { list.innerHTML = '<p class="empty-state">上場企業がありません</p>'; return; }
    const companies = snap.val();
    list.innerHTML = Object.entries(companies).map(([id, c]) => {
      const price = c.stock?.price || 0;
      const inventory = c.stock?.inventory || 0;
      const total = c.stock?.totalShares || 0;
      const sold = total - inventory;
      const isOwner = currentUserName && c.owner === currentUserName;
      const isMember = currentUserName && (c.members || []).includes(currentUserName);
      const canTrade = !isOwner && !isMember;
      return `
        <div class="company-card">
          <div class="company-card-top">
            <div class="company-info">
              <div class="company-card-name">🏢 ${esc(c.name)}</div>
              <div class="company-card-owner">オーナー: ${esc(c.owner)}</div>
            </div>
            <div class="company-card-price">${formatPrice(price)}<span> かむ/株</span></div>
          </div>
          <div class="mini-chart" id="mini-${id}"></div>
          <div class="company-card-stats">
            <div class="cstat"><span class="cstat-label">在庫</span><span class="cstat-val">${inventory}株</span></div>
            <div class="cstat"><span class="cstat-label">発行済</span><span class="cstat-val">${total}株</span></div>
            <div class="cstat"><span class="cstat-label">売却済</span><span class="cstat-val">${sold}株</span></div>
          </div>
          <div class="company-card-actions">
            <button class="btn-sm btn-blue" ${canTrade ? '' : 'disabled'} onclick="openTrade('${id}','buy')">📈 買う</button>
            <button class="btn-sm btn-red-s" ${canTrade ? '' : 'disabled'} onclick="openTrade('${id}','sell')">📉 売る</button>
          </div>
        </div>`;
    }).join('');
    Object.entries(companies).forEach(([id, c]) => {
      const el = $('mini-' + id);
      if (el) renderMiniChart(el, c.stock?.priceHistory || [], c.stock?.price || 0);
    });
  });
}

// ===== 自社 =====
async function loadMyCompany() {
  const snap = await get(ref(db, 'companies'));
  if (!snap.exists()) return;
  const entry = Object.entries(snap.val()).find(([, c]) => c.owner === currentUserName);
  if (!entry) return;
  myCompanyId = entry[0];
  myCompanyData = entry[1];
  showMyCompany();
  onValue(ref(db, 'companies/' + myCompanyId), s => {
    if (!s.exists()) return;
    myCompanyData = s.val();
    showMyCompany();
  });
}

function showMyCompany() {
  $('noCompany').style.display = 'none';
  $('hasCompany').style.display = 'block';
  const c = myCompanyData;
  const price = c.stock?.price || 0;
  const inventory = c.stock?.inventory || 0;
  const total = c.stock?.totalShares || 0;
  const treasury = Math.floor(c.treasury || 0);
  $('myCompanyName').textContent = c.name;
  $('myStockPrice').textContent = formatPrice(price);
  $('myStockInventory').textContent = inventory;
  $('myTreasury').textContent = treasury;
  $('myTreasury2').textContent = treasury;
  $('totalShares') && ($('totalShares').textContent = total);
  const members = c.members || [];
  $('memberCount').textContent = members.length + 1;
  $('memberList').innerHTML = [
    `<div class="member-row"><span class="badge-owner">オーナー</span>${esc(c.owner)}</div>`,
    ...members.map(m => `<div class="member-row"><span class="badge-member">メンバー</span>${esc(m)}</div>`)
  ].join('');
  $('addMemberArea').style.display = members.length >= 4 ? 'none' : 'block';
  $('stockInfoRows').innerHTML = `
    <div class="info-row"><span>初期株価</span><strong>${formatPrice(c.stock?.initialPrice)} かむ</strong></div>
    <div class="info-row"><span>現在株価</span><strong>${formatPrice(price)} かむ</strong></div>
    <div class="info-row"><span>発行済み株数</span><strong>${total} 株</strong></div>
    <div class="info-row"><span>在庫（残り購入可能）</span><strong>${inventory} 株</strong></div>
    <div class="info-row"><span>売却済み</span><strong>${total - inventory} 株</strong></div>`;
}

// ===== 企業作成 =====
window.createCompany = async function() {
  const msg = $('companyMsg'); msg.style.color = 'red';
  if (!isVip(currentUser)) { msg.textContent = 'VIP会員のみ企業を作成できます'; return; }
  const name = $('companyName').value.trim();
  const price = Number($('initialPrice').value);
  const shares = Number($('initialShares').value);
  if (!name) { msg.textContent = '企業名を入力してください'; return; }
  if (!price || price < 1 || price > 10) { msg.textContent = '初期株価は1〜10 かむで設定してください'; return; }
  if (!shares || shares < 1 || shares > 1000) { msg.textContent = '発行株数は1〜1000株で設定してください'; return; }
  const snap = await get(ref(db, 'companies'));
  if (snap.exists() && Object.values(snap.val()).some(c => c.owner === currentUserName)) {
    msg.textContent = '既に企業を持っています'; return;
  }
  const companyRef = push(ref(db, 'companies'));
  await set(companyRef, {
    name, owner: currentUserName, members: [],
    stock: { price, initialPrice: price, totalShares: shares, inventory: shares, priceHistory: [] },
    treasury: 0, createdAt: Date.now()
  });
  msg.style.color = 'green'; msg.textContent = '企業を作成しました！';
  myCompanyId = companyRef.key;
  myCompanyData = { name, owner: currentUserName, members: [],
    stock: { price, initialPrice: price, totalShares: shares, inventory: shares, priceHistory: [] },
    treasury: 0 };
  showMyCompany();
  onValue(ref(db, 'companies/' + myCompanyId), s => { if (s.exists()) { myCompanyData = s.val(); showMyCompany(); } });
};

// ===== メンバー追加 =====
window.addMember = async function() {
  const msg = $('memberMsg'); msg.style.color = 'red';
  const name = $('newMemberName').value.trim();
  if (!name) { msg.textContent = 'アカウント名を入力してください'; return; }
  if (name === currentUserName) { msg.textContent = '自分自身は追加できません'; return; }
  const members = myCompanyData.members || [];
  if (members.length >= 4) { msg.textContent = 'メンバー上限（4人）に達しています'; return; }
  if (name === myCompanyData.owner) { msg.textContent = 'オーナーは追加できません'; return; }
  if (members.includes(name)) { msg.textContent = 'すでにメンバーです'; return; }
  const userSnap = await get(ref(db, 'accounts/' + name));
  if (!userSnap.exists()) { msg.textContent = 'そのアカウントは存在しません'; return; }
  await set(ref(db, 'companies/' + myCompanyId + '/members'), [...members, name]);
  $('newMemberName').value = '';
  msg.style.color = 'green'; msg.textContent = `${name} を追加しました`;
};

// ===== 追加発行 =====
window.issueShares = async function() {
  const msg = $('sharesMsg'); msg.style.color = 'red';
  const add = Number($('newShares').value);
  if (!add || add < 1) { msg.textContent = '発行株数を入力してください'; return; }
  const current = myCompanyData.stock?.totalShares || 0;
  if (current + add > 1000) { msg.textContent = `発行上限は1000株です（現在${current}株）`; return; }
  const currentInv = myCompanyData.stock?.inventory || 0;
  await set(ref(db, 'companies/' + myCompanyId + '/stock/totalShares'), current + add);
  await set(ref(db, 'companies/' + myCompanyId + '/stock/inventory'), currentInv + add);
  $('newShares').value = '';
  msg.style.color = 'green'; msg.textContent = `${add}株を追加発行しました`;
};

// ===== 企業解散 =====
window.dissolveCompany = async function() {
  if (!confirm('本当に企業を解散しますか？この操作は取り消せません。')) return;
  await set(ref(db, 'companies/' + myCompanyId), null);
  myCompanyId = null; myCompanyData = null;
  $('noCompany').style.display = 'block';
  $('hasCompany').style.display = 'none';
};

// ===== 売買モーダル =====
window.openTrade = async function(companyId, type) {
  const snap = await get(ref(db, 'companies/' + companyId));
  if (!snap.exists()) return;
  const c = snap.val();
  const isOwner = currentUserName && c.owner === currentUserName;
  const isMember = currentUserName && (c.members || []).includes(currentUserName);
  if ((type === 'buy' || type === 'sell') && (isOwner || isMember)) {
    $('tradeMsg').textContent = '自分が所属している企業の株は取引できません';
    return;
  }
  tradeCompanyId = companyId; tradeType = type;
  const price = c.stock?.price || 0;
  const inventory = c.stock?.inventory || 0;
  const displayPrice = type === 'buy' ? Math.max(1, formatPrice(price)) : formatPrice(price);
  $('tradeTitle').textContent = type === 'buy' ? `📈 ${c.name} の株を買う` : `📉 ${c.name} の株を売る`;
  $('tradeInfo').innerHTML = `
    現在の株価: <strong>${displayPrice} かむ/株</strong><br>
    ${type === 'buy' ? `在庫: ${inventory}株 ／ 1人最大100株まで購入可` : `保有株を売却します（手数料10%）`}`;
  $('tradeAmount').value = '';
  $('tradeCost').textContent = '';
  $('tradeMsg').textContent = '';
  $('tradeConfirmBtn').textContent = type === 'buy' ? '購入する' : '売却する';
  $('tradeConfirmBtn').onclick = async function() {
    this.disabled = true;
    try {
      await executeTrade(c);
    } catch (e) {
      console.error(e);
      $('tradeMsg').textContent = 'エラーが発生しました';
    } finally {
      this.disabled = false;
    }
  };
  $('tradeModal').classList.add('open');
};

window.closeModal = function() { $('tradeModal').classList.remove('open'); };

$('tradeAmount').addEventListener('input', async function() {
  const amount = Number(this.value);
  if (!amount || amount < 1 || !tradeCompanyId) { $('tradeCost').textContent = ''; return; }
  const snap = await dbGet('companies/' + tradeCompanyId + '/stock/price');
  const price = Math.max(1, formatPrice(snap.val() || 0));
  const total = price * amount;
  $('tradeCost').textContent = tradeType === 'buy'
    ? `合計: ${total} かむ が必要`
    : `売却額: ${total} かむ（手数料 ${Math.floor(total * 0.1)} かむ 引き後: ${total - Math.floor(total * 0.1)} かむ）`;
});

async function executeTrade(company) {
  const msg = $('tradeMsg'); msg.style.color = 'red';
  try {
    const amount = Number($('tradeAmount').value);
    if (!amount || amount < 1) { msg.textContent = '株数を入力してください'; return; }

    const priceSnap = await dbGet('companies/' + tradeCompanyId + '/stock/price');
    const rawPrice = Number(priceSnap.val() || 0);
    const price = Math.max(1, formatPrice(rawPrice));
    const total = price * amount;

    if (tradeType === 'buy') {
    const invSnap = await dbGet('companies/' + tradeCompanyId + '/stock/inventory');
    const inventory = Number(invSnap.val() || 0);
    if (inventory < amount) { msg.textContent = `在庫が不足しています（残り${inventory}株）`; return; }

    const holdSnap = await dbGet('holdings/' + currentUserName + '/' + tradeCompanyId);
    const held = Number(holdSnap.exists() ? holdSnap.val() : 0);
    if (held + amount > 100) { msg.textContent = `1企業につき最大100株まで購入できます（現在${held}株保有）`; return; }

    const userSnap = await dbGet('accounts/' + currentUserName);
    const user = userSnap.val();
    if (Number(user.balance || 0) < total) { msg.textContent = '残高が不足しています'; return; }

    const newBal = Number(user.balance || 0) - total;
    const newHist = [...(user.history||[]), `📈 ${company.name} 株 ${amount}株 購入 -${total} かむ`].slice(-10);
    await dbSet('accounts/' + currentUserName + '/balance', newBal);
    await dbSetOptional('accounts/' + currentUserName + '/history', newHist);
    currentUser.balance = newBal;
    updateUserInfo();

    await dbSet('holdings/' + currentUserName + '/' + tradeCompanyId, held + amount);
    await dbSetOptional('holdingTime/' + currentUserName + '/' + tradeCompanyId, Date.now());

    const newInv = inventory - amount;
    const newPrice = Math.max(1, rawPrice - amount * 0.01);
    const hist = company.stock?.priceHistory || [];
    hist.push(price); if (hist.length > 20) hist.shift();
    await dbSet('companies/' + tradeCompanyId + '/stock/inventory', newInv);
    await dbSet('companies/' + tradeCompanyId + '/stock/price', newPrice);
    await dbSetOptional('companies/' + tradeCompanyId + '/stock/priceHistory', hist);

    msg.style.color = 'green'; msg.textContent = `${amount}株を購入しました！`;

  } else {
    const holdSnap = await dbGet('holdings/' + currentUserName + '/' + tradeCompanyId);
    const held = Number(holdSnap.exists() ? holdSnap.val() : 0);
    if (held < amount) { msg.textContent = `保有株が不足しています（保有: ${held}株）`; return; }

    const timeSnap = await dbGetOptional('holdingTime/' + currentUserName + '/' + tradeCompanyId);
    if (timeSnap && timeSnap.exists()) {
      const buyTime = timeSnap.val();
      const elapsed = Date.now() - buyTime;
      const cooldown = 60 * 60 * 1000;
      if (elapsed < cooldown) {
        const remaining = Math.ceil((cooldown - elapsed) / 60000);
        msg.textContent = `購入から1時間経過後に売却できます（あと約${remaining}分）`;
        return;
      }
    }

    const fee = Math.floor(total * 0.3);
    const received = total - fee;

    const userSnap = await dbGet('accounts/' + currentUserName);
    const user = userSnap.val();
    const newBal = Number(user.balance || 0) + received;
    const newHist = [...(user.history||[]), `📉 ${company.name} 株 ${amount}株 売却 +${received} かむ`].slice(-10);
    await dbSet('accounts/' + currentUserName + '/balance', newBal);
    await dbSetOptional('accounts/' + currentUserName + '/history', newHist);
    currentUser.balance = newBal;
    updateUserInfo();

    const newHeld = held - amount;
    await dbSet('holdings/' + currentUserName + '/' + tradeCompanyId, newHeld > 0 ? newHeld : 0);

    const invSnap = await dbGet('companies/' + tradeCompanyId + '/stock/inventory');
    const inventory = Number(invSnap.val() || 0);
    const newInv = Math.min(inventory + amount, Number(company.stock?.totalShares || 1000));
    const newPrice = Math.max(rawPrice + amount * 0.05, 1);
    const hist = company.stock?.priceHistory || [];
    hist.push(price); if (hist.length > 20) hist.shift();
    await dbSet('companies/' + tradeCompanyId + '/stock/inventory', newInv);
    await dbSet('companies/' + tradeCompanyId + '/stock/price', newPrice);
    await dbSetOptional('companies/' + tradeCompanyId + '/stock/priceHistory', hist);

    const treasSnap = await dbGet('companies/' + tradeCompanyId + '/treasury');
    await dbSetOptional('companies/' + tradeCompanyId + '/treasury', (treasSnap.val() || 0) + fee);

    msg.style.color = 'green'; msg.textContent = `${amount}株を売却しました！+${received} かむ`;
    }

    setTimeout(() => { closeModal(); loadHoldings(); loadMarket(); }, 1500);
  } catch (e) {
    console.error('executeTrade error', e);
    msg.textContent = 'エラーが発生しました: ' + (e && e.message ? e.message : e);
  }
}

// ===== 保有株 =====
async function loadHoldings() {
  const list = $('holdingsList');
  const snap = await get(ref(db, 'holdings/' + currentUserName));
  if (!snap.exists()) { list.innerHTML = '<p class="empty-state">保有している株はありません</p>'; return; }
  const holdings = snap.val();
  const cSnap = await get(ref(db, 'companies'));
  const companies = cSnap.exists() ? cSnap.val() : {};
  const rows = Object.entries(holdings).map(([id, shares]) => {
    const c = companies[id]; if (!c) return '';
    const price = Number(c.stock?.price || 0);
    const sharesNum = Number(shares || 0);
    const val = Math.trunc(price * sharesNum);
    return `<div class="holding-row">
      <div class="holding-info">
        <div class="holding-name">🏢 ${esc(c.name)}</div>
        <div class="holding-detail">${shares}株 × ${formatPrice(price)} かむ/株</div>
      </div>
      <div class="holding-val">${val} かむ</div>
    </div>`;
  }).join('');
  list.innerHTML = rows || '<p class="empty-state">保有している株はありません</p>';
}

init();
