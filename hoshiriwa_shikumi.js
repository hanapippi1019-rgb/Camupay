import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, set, push, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
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

let currentUser = null;
let currentUserName = null;
let allPosts = [];

const NG_WORDS = [
  "spam",
  "しね","死ね","殺す","ころす","ばか","あほ","くそ","ちくしょう",
  "ファック","ふぁっく","ファッキン","ふぁっきん",
  "まんこ","ちんこ","おまんこ","ちんぽ","うんこ",
  "ポルノ","ぽるの","アダルト","あだると","エロ","えろ","猥褻","わいせつ",
  "児童ポルノ","じどうぽるの","児ポ","じぽ","チャイルドポルノ","ちゃいるどぽるの",
  "未成年ポルノ","みせいねんぽるの","ロリコン","ろりこん","ショタコン","しょたこん",
  "盗撮","とうさつ","無修正","むしゅうせい","リベンジポルノ","りべんじぽるの",
  "レイプ","れいぷ","強姦","ごうかん","獣姦","じゅうかん","近親相姦","きんしんそうかん",
  "porn","porno","pornography","adult","erotic","obscene","childporn","childporno",
  "childpornography","csam","csem","childabusematerial","revengeporn","voyeur","upskirt",
  "rape","bestiality","incest","lolicon","shotacon","uncensored"
];

function $(id) {
  return document.getElementById(id);
}

function normalizeForNG(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s._\-ー~〜・･/\\|]+/g, "");
}

function hasNG(text) {
  const normalizedText = normalizeForNG(text);
  return NG_WORDS.some((word) => normalizedText.includes(normalizeForNG(word)));
}

function esc(text) {
  return String(text || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function showLoading(show) {
  $("loading").style.display = show ? "block" : "none";
}

function showMain() {
  $("loginScreen").style.display = "none";
  $("mainScreen").style.display = "block";
  $("headerBalance").style.display = "block";
  $("headerBalance").textContent = `${currentUser.balance} かむ`;
  updateUI();
  loadPosts();
}

function updateUI() {
  $("userName").textContent = `👤 ${currentUserName}`;
  $("balanceDisp").textContent = currentUser.balance;
  $("headerBalance").textContent = `${currentUser.balance} かむ`;
}

function loadPosts() {
  onValue(ref(db, "hoshiriwa_posts"), (snap) => {
    allPosts = snap.exists()
      ? Object.values(snap.val()).sort((a, b) => b.created_at - a.created_at)
      : [];
    window.filterPosts();
  });
}

function renderPosts(posts) {
  const div = $("postList");
  if (posts.length === 0) {
    div.innerHTML = '<p style="color:#aaa;font-size:0.85em;margin:0;">依頼がありません</p>';
    return;
  }

  div.innerHTML = posts.map((post) => {
    const isDone = post.status === "done";
    const isOwn = post.poster === currentUserName;
    const date = new Date(post.created_at).toLocaleDateString("ja-JP");
    return `
      <div class="post-item">
        <div class="post-item-header">
          <span class="status-badge ${isDone ? "status-done" : "status-open"}">${isDone ? "受注済" : "募集中"}</span>
          <span class="reward-badge">💰 ${post.reward} かむ</span>
        </div>
        <div class="post-title">${esc(post.name)}</div>
        <div class="post-desc">${esc(post.desc)}</div>
        <div class="post-tags">
          ${post.product_tag ? `<span class="tag product">#${esc(post.product_tag)}</span>` : ""}
          ${post.request_tag ? `<span class="tag request">#${esc(post.request_tag)}</span>` : ""}
        </div>
        <div class="post-meta">投稿者: ${esc(post.poster)} ・ ${date}${isDone ? ` ・ 受注者: ${esc(post.acceptor || "")}` : ""}</div>
        <div class="post-actions">
          ${!isOwn && !isDone ? `<button class="btn-accept" onclick="acceptPost('${post.id}')">✅ 受注する（+${post.reward} かむ）</button>` : ""}
          ${isOwn && !isDone ? '<span class="btn-gray-sm" style="text-align:center;">自分の依頼</span>' : ""}
          ${isDone ? '<span class="btn-gray-sm" style="text-align:center;">受注済み</span>' : ""}
        </div>
      </div>`;
  }).join("");
}

function setDrawerOpen(isOpen) {
  $("drawer").classList.toggle("open", isOpen);
  $("drawerOverlay").classList.toggle("open", isOpen);
}

window.switchTab = function(tab) {
  const isLogin = tab === "login";
  const panels = document.querySelectorAll(".auth-form-panel");
  panels[0].classList.toggle("hidden-panel", !isLogin);
  panels[1].classList.toggle("hidden-panel", isLogin);
  $("tabIndicator").classList.toggle("register", !isLogin);
  $("tabLoginBtn").classList.toggle("active", isLogin);
  $("tabRegisterBtn").classList.toggle("active", !isLogin);
  $("message").textContent = "";
};

window.createAccount = async function() {
  const name = $("regName").value.trim();
  const pass = $("regPass").value.trim();
  const passConfirm = $("regPassConfirm").value.trim();
  const msg = $("message");
  msg.style.color = "red";

  if (!name) { msg.textContent = "名前を入力してください"; return; }
  if (hasNG(name)) { msg.textContent = "その名前は使用できません"; return; }
  if (!pass || pass.length !== 4 || !/^\d{4}$/.test(pass)) { msg.textContent = "パスワードは数字4桁にしてください"; return; }
  if (["4545", "0721"].includes(pass)) { msg.textContent = "そのパスワードは使用できません"; return; }
  if (pass !== passConfirm) { msg.textContent = "パスワードが一致しません"; return; }

  showLoading(true);
  try {
    await signInAnonymously(auth);
    const snap = await get(ref(db, `accounts/${name}`));
    if (snap.exists()) { msg.textContent = "その名前はすでに使われています"; return; }
    const allSnap = await get(ref(db, "accounts"));
    if (allSnap.exists() && Object.keys(allSnap.val()).length >= 50) { msg.textContent = "アカウント上限に達しました"; return; }
    await set(ref(db, `accounts/${name}`), { pass, balance: 10, history: ["アカウント作成ボーナス +10 かむ"], lastBonus: 0, createdAt: Date.now() });
    msg.style.color = "green";
    msg.textContent = "アカウント作成成功！ログインしてください";
    $("regName").value = "";
    $("regPass").value = "";
    $("regPassConfirm").value = "";
    setTimeout(() => window.switchTab("login"), 1200);
  } catch {
    msg.textContent = "エラーが発生しました";
  } finally {
    showLoading(false);
  }
};

window.login = async function() {
  const name = $("loginName").value.trim();
  const pass = $("loginPass").value.trim();
  const msg = $("message");
  msg.style.color = "red";
  if (!name || !pass) { msg.textContent = "名前とパスワードを入力してください"; return; }

  showLoading(true);
  try {
    await signInAnonymously(auth);
    const snap = await get(ref(db, `accounts/${name}`));
    if (!snap.exists() || snap.val().pass !== pass) { msg.textContent = "名前またはパスワードが違います"; return; }
    currentUser = snap.val();
    currentUserName = name;
    localStorage.setItem("shimupay_user", name);
    showMain();
  } catch {
    msg.textContent = "接続エラーが発生しました";
  } finally {
    showLoading(false);
  }
};

window.submitPost = async function() {
  const title = $("postTitle").value.trim();
  const desc = $("postDesc").value.trim();
  const productTag = $("postProductTag").value.trim();
  const requestTag = $("postRequestTag").value.trim();
  const reward = Number($("postReward").value);
  const msg = $("postMsg");
  msg.style.color = "red";

  if (!title || !desc) { msg.textContent = "タイトルと説明は必須です"; return; }
  if (desc.length > 500) { msg.textContent = "説明は500文字以内にしてください"; return; }
  if (hasNG(title) || hasNG(desc)) { msg.textContent = "NGワードが含まれています"; return; }
  if (!reward || reward < 1 || reward > 100) { msg.textContent = "報酬は1〜100かむで設定してください"; return; }
  if (currentUser.balance < reward) { msg.textContent = `残高が不足しています（現在: ${currentUser.balance} かむ）`; return; }

  try {
    const newBalance = currentUser.balance - reward;
    const newHistory = [...(currentUser.history || []), `📝 依頼「${title}」報酬 -${reward} かむ`].slice(-10);
    await update(ref(db, `accounts/${currentUserName}`), { balance: newBalance, history: newHistory });
    currentUser.balance = newBalance;
    currentUser.history = newHistory;
    updateUI();

    const postRef = push(ref(db, "hoshiriwa_posts"));
    await set(postRef, {
      id: postRef.key,
      name: title,
      desc,
      product_tag: productTag,
      request_tag: requestTag,
      reward,
      poster: currentUserName,
      status: "open",
      created_at: Date.now()
    });

    msg.style.color = "green";
    msg.textContent = "依頼を投稿しました！";
    $("postTitle").value = "";
    $("postDesc").value = "";
    $("postProductTag").value = "";
    $("postRequestTag").value = "";
    $("postReward").value = "";
  } catch {
    msg.textContent = "投稿に失敗しました";
  }
};

window.filterPosts = function() {
  const q = $("searchInput").value.toLowerCase();
  const filtered = q ? allPosts.filter((post) =>
    (post.name || "").toLowerCase().includes(q) ||
    (post.desc || "").toLowerCase().includes(q) ||
    (post.product_tag || "").toLowerCase().includes(q) ||
    (post.request_tag || "").toLowerCase().includes(q)
  ) : allPosts;
  renderPosts(filtered);
};

window.acceptPost = async function(postId) {
  const post = allPosts.find((item) => item.id === postId);
  if (!post || post.status === "done") return;
  if (!confirm(`「${post.name}」を受注しますか？\n報酬: ${post.reward} かむ が受け取れます`)) return;

  try {
    const newBalance = currentUser.balance + post.reward;
    const newHistory = [...(currentUser.history || []), `✅ 依頼受注「${post.name}」+${post.reward} かむ`].slice(-10);
    const updates = {};
    updates[`accounts/${currentUserName}/balance`] = newBalance;
    updates[`accounts/${currentUserName}/history`] = newHistory;
    updates[`hoshiriwa_posts/${postId}/status`] = "done";
    updates[`hoshiriwa_posts/${postId}/acceptor`] = currentUserName;
    updates[`hoshiriwa_posts/${postId}/accepted_at`] = Date.now();
    await update(ref(db), updates);
    currentUser.balance = newBalance;
    currentUser.history = newHistory;
    updateUI();
    alert(`受注しました！${post.reward} かむ を受け取りました🎉`);
  } catch {
    alert("受注に失敗しました");
  }
};

window.logout = function() {
  currentUser = null;
  currentUserName = null;
  localStorage.removeItem("shimupay_user");
  $("mainScreen").style.display = "none";
  $("loginScreen").style.display = "block";
  $("headerBalance").style.display = "none";
};

window.toggleDrawer = function() {
  setDrawerOpen(!$("drawer").classList.contains("open"));
};

window.closeDrawer = function() {
  setDrawerOpen(false);
};

async function restore() {
  try {
    await signInAnonymously(auth);
    const saved = localStorage.getItem("shimupay_user");
    if (saved) {
      const snap = await get(ref(db, `accounts/${saved}`));
      if (snap.exists()) {
        currentUser = snap.val();
        currentUserName = saved;
        showMain();
        return;
      }
      localStorage.removeItem("shimupay_user");
    }
    $("loginScreen").style.display = "block";
  } catch {
    $("loginScreen").style.display = "block";
  } finally {
    $("restoreLoading").style.display = "none";
  }
}

restore();
