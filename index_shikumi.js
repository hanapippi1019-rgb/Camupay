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

const GAS_URL = "https://script.google.com/macros/s/AKfycbys3jtI5KoMIxZb56RX2a8sxHRIwmRi0JNZRb8ixtIa9oMEhZdGf0--KzfmYN8i7ZgC/exec";
const NG_WORDS = ["しね","シネ","死ね","殺す","ころす","コロス","ばか","バカ","あほ","アHO","くそ","クソ","ちくしょう","チクショウ","ファック","ふぁっく","ファッキン","ふぁっきん"];

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentUser = null;
let currentUserName = null;

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

const TEXT = {
  userLabel: "ユーザー",
  noHistory: "履歴はありません",
  noNotices: "お知らせはありません",
  noticesLoadError: "お知らせの取得ができませんでした",
  noRequests: "申請はありません",
  requestsLoadError: "申請の取得ができませんでした",
  enterName: "名前を入力してください",
  invalidName: "その名前は使えません",
  invalidPin: "パスワードは4桁の数字にしてください",
  weakPin: "そのパスワードは使えません",
  pinMismatch: "パスワードが一致しません",
  nameTaken: "その名前はすでに使われています",
  accountLimit: "アカウントの数が上限に達しています",
  accountCreated: "アカウントを作成しました。ログインしてください",
  accountCreateError: "アカウント作成ができませんでした",
  enterCredentials: "名前とパスワードを入力してください",
  loginFailed: "名前またはパスワードが違います",
  loginError: "ログインすることができませんでした",
  enterRecipient: "送る相手の名前を入力してください",
  cannotSendSelf: "自分自身には送れません",
  invalidAmount: "金額を正しく入力してください",
  maxAmount: "1回に送れるのは10かむまでです",
  maxAmountVip: "1回に送れるのは30かむまでです",
  insufficientBalance: "残高が足りません",
  recipientNotFound: "送金先が見つかりません",
  requestSendError: "申請の送信ができませんでした",
  senderNotFound: "送金元が見つかりません",
  senderLowBalance: "送金元の残高が不足しています",
  approveError: "承認できませんでした",
  rejectDone: "申請を拒否しました",
  rejectError: "拒否できませんでした",
  bonusCooldown: "登校ボーナスは1日に1回までです",
  geoUnsupported: "この端末では位置情報が使えません",
  checkingLocation: "位置情報を確認中...",
  locationError: "位置情報の取得に失敗しました",
  locationBonusHistory: "登校ボーナス +2 かむ",
  locationBonusReceived: "ボーナスを受け取りました: +2 かむ"
};

function $(id) { return document.getElementById(id); }
function setMessage(id, text="", color="red") { const el=$(id); if(!el)return; el.textContent=text; el.style.color=color; }
function setLoading(show) { $("loading").style.display=show?"block":"none"; }

function syncAuthFormsHeight() {
  const wrapper=$("authFormsWrapper"), lp=$("loginPanel"), rp=$("registerPanel");
  if(!wrapper||!lp||!rp) return;
  wrapper.style.minHeight=`${Math.max(lp.scrollHeight,rp.scrollHeight)}px`;
}

function showScreen(screen) {
  $("restoreLoading").style.display="none";
  $("loginScreen").style.display=screen==="login"?"block":"none";
  $("bankScreen").style.display=screen==="bank"?"block":"none";
  if(screen==="login"){ syncAuthFormsHeight(); window.switchAuthTab("login"); }
}

function updatePremiumUI() {
  if (!currentUser) return;

  const vip = currentUser.premiumExpireAt && currentUser.premiumExpireAt > Date.now();

  if (vip) {
    $("vipCard").style.display = "block";
    $("premiumCta").style.display = "none";

    const date = new Date(currentUser.premiumExpireAt).toLocaleDateString("ja-JP");
    $("vipSince").textContent = `VIP有効期限: ${date}`;

    $("sendAmount").placeholder = "送る金額（最大30）";
  } else {
    $("vipCard").style.display = "none";
    $("premiumCta").style.display = "block";
    $("sendAmount").placeholder = "送る金額（最大10）";
  }
}

function isVip(user) {
  return user.premiumExpireAt && user.premiumExpireAt > Date.now();
}

function updateBankUI() {
  if(!currentUser) return;
  $("userName").textContent=`${TEXT.userLabel}: ${currentUserName}`;
  $("balance").textContent=currentUser.balance||0;
  const hist=currentUser.history||[];
  $("history").innerHTML=hist.length===0
    ?`<p style="color:#aaa;font-size:0.85em;margin:0;">${TEXT.noHistory}</p>`
    :hist.slice().reverse().map(item=>`<div class="history-item">${item}</div>`).join("");
  updatePremiumUI();
}

async function loadNotices() {
  const list=$("noticeList");
  try {
    const res=await fetch(GAS_URL);
    const notices=await res.json();
    if(!Array.isArray(notices)||notices.length===0){ list.innerHTML=`<p class="notice-empty">${TEXT.noNotices}</p>`; return; }
    list.innerHTML=notices.map(n=>{
      let dateStr=n.date||"";
      const d=new Date(n.date);
      if(!Number.isNaN(d.getTime())) dateStr=`${d.getMonth()+1}/${d.getDate()}`;
      return `<div class="notice-item"><div class="notice-date">${dateStr} ${n.title||""}</div>${n.body?`<div class="notice-body">${n.body}</div>`:""}</div>`;
    }).join("");
  } catch { list.innerHTML=`<p class="notice-empty">${TEXT.noticesLoadError}</p>`; }
}

function openBankScreen(userName, userData, persist=true) {
  currentUser=userData; currentUserName=userName;
  if(persist) localStorage.setItem("shimupay_user",userName);
  showScreen("bank"); updateBankUI(); loadPendingRequests(); loadNotices();
}

function setDrawerOpen(isOpen) {
  $("drawer").classList.toggle("open",isOpen);
  $("drawerOverlay").classList.toggle("open",isOpen);
}

async function loadPendingRequests() {
  const list=$("pendingList");
  try {
    const snap=await get(ref(db,`requests/${currentUserName}`));
    if(!snap.exists()){ list.innerHTML=`<p style="color:#aaa;font-size:0.85em;margin:0;">${TEXT.noRequests}</p>`; return; }
    list.innerHTML=Object.entries(snap.val()).map(([id,req])=>`
      <div style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
        <b>${req.from}</b> さんから <b>${req.amount} かむ</b> の申請
        <div style="margin-top:6px;display:flex;gap:6px;">
          <button onclick="approveRequest('${id}','${req.from}',${req.amount})" style="width:auto;padding:5px 12px;font-size:0.85em;display:inline-block;margin:0;flex:1;">承認</button>
          <button onclick="rejectRequest('${id}')" style="width:auto;padding:5px 12px;font-size:0.85em;display:inline-block;margin:0;flex:1;background:linear-gradient(135deg,#e53935,#ef5350);box-shadow:0 3px 8px rgba(229,57,53,0.3);">拒否</button>
        </div>
      </div>`).join("");
  } catch { list.innerHTML=`<p style="color:#aaa;font-size:0.85em;margin:0;">${TEXT.requestsLoadError}</p>`; }
}

async function restore() {
  try {
    await signInAnonymously(auth);
    const saved=localStorage.getItem("shimupay_user");
    if(saved) {
      const snap=await get(ref(db,`accounts/${saved}`));
      if(snap.exists()){ openBankScreen(saved,snap.val(),false); return; }
      localStorage.removeItem("shimupay_user");
    }
  } catch {}
  showScreen("login");
}

window.switchAuthTab=function(tab) {
  const isReg=tab==="register";
  setMessage("message","");
  $("authFormsWrapper").classList.toggle("show-register",isReg);
  $("tabIndicator").classList.toggle("register",isReg);
  $("tabLoginBtn").classList.toggle("active",!isReg);
  $("tabRegisterBtn").classList.toggle("active",isReg);
  $("tabLoginBtn").setAttribute("aria-selected",String(!isReg));
  $("tabRegisterBtn").setAttribute("aria-selected",String(isReg));
  $("loginPanel").classList.toggle("hidden-panel",isReg);
  $("registerPanel").classList.toggle("hidden-panel",!isReg);
  syncAuthFormsHeight();
};

window.createAccount=async function() {
  const name=$("regName").value.trim(), pass=$("regPass").value.trim(), pc=$("regPassConfirm").value.trim();
  setMessage("message","");
  if(!name){setMessage("message",TEXT.enterName);return;}
  if(NG_WORDS.some(w=>name.toLowerCase().includes(w))){setMessage("message",TEXT.invalidName);return;}
  if(!/^\d{4}$/.test(pass)){setMessage("message",TEXT.invalidPin);return;}
  if(["4545","0721"].includes(pass)){setMessage("message",TEXT.weakPin);return;}
  if(pass!==pc){setMessage("message",TEXT.pinMismatch);return;}
  setLoading(true);
  try {
    await signInAnonymously(auth);
    const ex=await get(ref(db,`accounts/${name}`));
    if(ex.exists()){setMessage("message",TEXT.nameTaken);return;}
    const all=await get(ref(db,"accounts"));
    if(all.exists()&&Object.keys(all.val()).length>=100){setMessage("message",TEXT.accountLimit);return;}
    const hashedPass = await hashPassword(pass);

    await set(ref(db,`accounts/${name}`),{
      pass: hashedPass,
      balance:0,
      history:[],
      lastBonus:0,
      createdAt:Date.now()
    });
    setMessage("message",TEXT.accountCreated,"green");
    $("regName").value=""; $("regPass").value=""; $("regPassConfirm").value="";
    setTimeout(()=>window.switchAuthTab("login"),1200);
  } catch {setMessage("message",TEXT.accountCreateError);}
  finally {setLoading(false);}
};

window.login=async function() {
  const name=$("loginName").value.trim(), pass=$("loginPass").value.trim();
  setMessage("message","");
  if(!name||!pass){setMessage("message",TEXT.enterCredentials);return;}
  setLoading(true);
  try {
    await signInAnonymously(auth);
    const snap=await get(ref(db,`accounts/${name}`));

    const hashedPass = await hashPassword(pass);

    if(!snap.exists()||snap.val().pass!==hashedPass){
      setMessage("message",TEXT.loginFailed);
      return;
    }
    openBankScreen(name,snap.val(),true);
    $("loginName").value=""; $("loginPass").value="";
  } catch {setMessage("message",TEXT.loginError);}
  finally {setLoading(false);}
};

window.sendMoney=async function() {
  const toName=$("sendTo").value.trim(), amount=Number($("sendAmount").value);
  const maxAmt = isVip(currentUser) ? 30 : 10;
  setMessage("bankMessage","");
  if(!toName){setMessage("bankMessage",TEXT.enterRecipient);return;}
  if(toName===currentUserName){setMessage("bankMessage",TEXT.cannotSendSelf);return;}
  if(!Number.isFinite(amount)||amount<=0){setMessage("bankMessage",TEXT.invalidAmount);return;}
  if(amount>maxAmt){
    setMessage("bankMessage", isVip(currentUser) ? TEXT.maxAmountVip : TEXT.maxAmount);
    return;
  }
  if((currentUser.balance||0)<amount){setMessage("bankMessage",TEXT.insufficientBalance);return;}
  setLoading(true);
  try {
    const snap=await get(ref(db,`accounts/${toName}`));
    if(!snap.exists()){setMessage("bankMessage",TEXT.recipientNotFound);return;}
    const rid=Date.now().toString();
    await set(ref(db,`requests/${toName}/${rid}`),{from:currentUserName,amount,timestamp:rid});
    $("sendTo").value=""; $("sendAmount").value="";
    setMessage("bankMessage",`${toName} さんに申請を送りました`,"green");
  } catch {setMessage("bankMessage",TEXT.requestSendError);}
  finally {setLoading(false);}
};

window.approveRequest=async function(requestId,fromName,amount) {
  try {
    const amt = Number(amount);
    const ss=await get(ref(db,`accounts/${fromName}`));
    if(!ss.exists()){setMessage("bankMessage",TEXT.senderNotFound);return;}
    const sender=ss.val();
    if((sender.balance||0)<amt){setMessage("bankMessage",TEXT.senderLowBalance);return;}

    const senderNewBalance = Number(sender.balance) - amt;
    const receiverNewBalance = Number(currentUser.balance||0) + amt;
    if(receiverNewBalance > 10000){setMessage("bankMessage","残高上限（10000かむ）を超えるため受け取れません");return;}
    const senderNewHistory=[...(sender.history||[]),`${currentUserName} さんへ ${amt} かむ送金`].slice(-10);
    const receiverNewHistory=[...(currentUser.history||[]),`${fromName} さんから ${amt} かむ受け取り`].slice(-10);

    // アカウント全体を上書きする形で書き込む
    const senderData = {...sender, balance: senderNewBalance, history: senderNewHistory};
    const receiverData = {...currentUser, balance: receiverNewBalance, history: receiverNewHistory};

    await set(ref(db,`accounts/${fromName}`), senderData);
    await set(ref(db,`accounts/${currentUserName}`), receiverData);
    await set(ref(db,`requests/${currentUserName}/${requestId}`), null);

    currentUser.balance=receiverNewBalance;
    currentUser.history=receiverNewHistory;
    updateBankUI(); loadPendingRequests();
    setMessage("bankMessage",`${fromName} さんから ${amt} かむ受け取りました`,"green");
  } catch(e) {setMessage("bankMessage",TEXT.approveError); console.error(e);}
};

window.rejectRequest=async function(requestId) {
  try {
    await set(ref(db,`requests/${currentUserName}/${requestId}`),null);
    loadPendingRequests(); setMessage("bankMessage",TEXT.rejectDone,"#888");
  } catch {setMessage("bankMessage",TEXT.rejectError);}
};

window.getLocationBonus = async function() {
  const btn = document.querySelector(".bonus-btn");
  const now = new Date();

  // 今日の9:00
  const start = new Date();
  start.setHours(9, 0, 0, 0);

  // 今日の17:00
  const end = new Date();
  end.setHours(17, 0, 0, 0);

  // 受付時間チェック
  if (now < start || now >= end) {
    setMessage("bankMessage", "登校ボーナスは 9:00〜17:00 の間のみ受け取れます");
    return;
  }

  // 今日すでに受け取っているか
  const lastBonus = currentUser.lastLocationBonus || 0;

  if (lastBonus >= start.getTime()) {
    setMessage("bankMessage", "今日の登校ボーナスはすでに受け取っています");
    return;
  }

  if (!navigator.geolocation) {
    setMessage("bankMessage", TEXT.geoUnsupported);
    return;
  }

  btn.disabled = true;
  setMessage("bankMessage", TEXT.checkingLocation, "#888");

  navigator.geolocation.getCurrentPosition(async(pos) => {

    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    const tLat = 35.5627;
    const tLon = 139.7163;

    const lim = 500;
    const R = 6371000;

    const dLat = (lat - tLat) * Math.PI / 180;
    const dLon = (lon - tLon) * Math.PI / 180;

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(tLat * Math.PI / 180) *
      Math.cos(lat * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;

    const dist =
      R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (dist <= lim) {

      if ((currentUser.balance || 0) + 2 > 10000) {
        setMessage("bankMessage", "残高上限（10000かむ）に達しています");
        btn.disabled = false;
        return;
      }

      currentUser.balance = (currentUser.balance || 0) + 2;

      currentUser.history = currentUser.history || [];
      currentUser.history.push(TEXT.locationBonusHistory);

      currentUser.lastLocationBonus = Date.now();

      await set(
        ref(db, `accounts/${currentUserName}`),
        currentUser
      );

      updateBankUI();

      setMessage(
        "bankMessage",
        TEXT.locationBonusReceived,
        "green"
      );

    } else {

      setMessage(
        "bankMessage",
        `対象地点から離れています（約${Math.round(dist)}m）`
      );

    }

    btn.disabled = false;

  }, () => {

    setMessage("bankMessage", TEXT.locationError);
    btn.disabled = false;

  }, {
    timeout: 10000
  });
};

window.buyVip = async function(days, price, type) {
  const msg = $("premiumMsg");
  msg.style.color = "red";

  if ((currentUser.balance || 0) < price) {
    msg.textContent = `残高が足りません（${price}かむ必要）`;
    return;
  }

  if (!confirm(`${price}かむを支払ってVIPになりますか？`)) return;

  try {
    const now = Date.now();
    const duration = days * 24 * 60 * 60 * 1000;

    const currentExpire = currentUser.premiumExpireAt || 0;

    const newExpire = currentExpire > now
      ? currentExpire + duration
      : now + duration;

    const nb = (currentUser.balance || 0) - price;
    let label = type;

    if (type === "1month") label = "1ヶ月分";
    else if (type === "3month") label = "3ヶ月分";
    else if (type === "12month") label = "12ヶ月分";

    const nh = [...(currentUser.history || []), `💎 VIP加入(${label}) -${price} かむ`].slice(-10);

    await update(ref(db, `accounts/${currentUserName}`), {
      balance: nb,
      history: nh,
      premiumExpireAt: newExpire,
      premiumType: type
    });

    currentUser.balance = nb;
    currentUser.history = nh;
    currentUser.premiumExpireAt = newExpire;
    currentUser.premiumType = type;

    updateBankUI();
    alert("💎VIPを購入しました");

  } catch {
    msg.textContent = "購入することができません";
  }
};

window.subscribePremium = function() {
  return window.buyVip(30, 15, "1month");
};

window.subscribePremium3Month = function() {
  return window.buyVip(90, 50, "3month");
};

window.subscribePremium12Month = function() {
  return window.buyVip(365, 135, "12month");
};

window.logout=function() {
  currentUser=null; currentUserName=null;
  localStorage.removeItem("shimupay_user");
  setMessage("message",""); setDrawerOpen(false); showScreen("login");
};
window.toggleDrawer=function(){setDrawerOpen(!$("drawer").classList.contains("open"));};
window.closeDrawer=function(){setDrawerOpen(false);};

if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
window.addEventListener("resize",syncAuthFormsHeight);
window.addEventListener("load",syncAuthFormsHeight);

restore();
