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
  const VIP_TYPES = ['1month','3month','12month'];

  const NG_WORDS = [
   "しね","死ね","殺す","ころす","ばか","あほ","くそ","ちくしょう","死ねカス","ゴミ","クズ","自殺","死にたい","しねかす","シネカス","4ねカス","🍌💦","ふぁっく","ファッキン","ふぁっきん","まんこ","ちんこ","おまんこ","ちんぽ","うんこ","ポルノ","ぽるの","アダルト","あだると","エロ","えろ","猥褻","わいせつ","児童ポルノ","じどうぽるの","児ポ","じぽ","チャイルドポルノ","ちゃいるどぽるの","未成年ポルノ","みせいねんぽるの","ロリコン","ろりこん","ショタコン","しょたこん","盗撮","とうさつ","無修正","むしゅうせい","リベンジポルノ","りべんじぽるの","レイプ","れいぷ","強姦","ごうかん","獣姦","じゅうかん","近親相姦","きんしんそうかん","porn","porno","pornography","adult","erotic","obscene","childporn","childporno","childpornography","csam","csem","childabusematerial","revengeporn","voyeur","upskirt","rape","bestiality","incest","lolicon","shotacon","uncensored"
  ];
  function normalizeForNG(t) {
    return String(t||'')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
      .replace(/[\s._\-ー~〜・･/\\|]+/g, '');
  }
  function hasNG(t) {
    const normalizedText = normalizeForNG(t);
    return NG_WORDS.some(w => normalizedText.includes(normalizeForNG(w)));
  }
  function isVip(user) {
    if (!user) return false;
    if (user.premiumExpireAt) return user.premiumExpireAt > Date.now();
    return VIP_TYPES.includes(user.premiumType) || user.isPremium === true || user.vip === true;
  }
  const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function isValidImageUrl(url) {
    if (!url) return true;
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  function isExpiredPost(post) {
    return post && typeof post.created_at === 'number' && (Date.now() - post.created_at) > REQUEST_TTL_MS;
  }

  function resizeImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) { resolve(''); return; }
      if (!file.type.startsWith('image/')) { reject(new Error('画像ファイルを選んでください')); return; }
      if (file.size > 5 * 1024 * 1024) { reject(new Error('画像は5MB以内にしてください')); return; }

      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxSize = 1000;
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.78));
        };
        img.onerror = () => reject(new Error('画像を読み込めませんでした'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('画像を読み込めませんでした'));
      reader.readAsDataURL(file);
    });
  }
  function readDeliveryFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('納品ファイルを選んでください')); return; }
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        reject(new Error('画像または動画ファイルを選んでください'));
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        reject(new Error('納品ファイルは5MB以内にしてください'));
        return;
      }
      if (file.type.startsWith('image/')) {
        resizeImageFile(file).then(data => resolve({ data, type: file.type, name: file.name })).catch(reject);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve({ data: reader.result, type: file.type, name: file.name });
      reader.onerror = () => reject(new Error('ファイルを読み込めませんでした'));
      reader.readAsDataURL(file);
    });
  }
  function getApplicants(post) {
    return Object.entries(post.applicants || {});
  }
  function statusLabel(status) {
    return {
      open: '募集中',
      assigned: '作業中',
      submitted: '承認待ち',
      done: '完了'
    }[status || 'open'] || '募集中';
  }
  function statusClass(status) {
    return `status-${status || 'open'}`;
  }
  function ratingStars(value) {
    const rating = Math.max(0, Math.min(5, Number(value) || 0));
    return '★★★★★'.slice(0, rating) + '☆☆☆☆☆'.slice(rating);
  }
  function esc(s) {
    return String(s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function showLoading(show) { document.getElementById('loading').style.display = show ? 'block' : 'none'; }

  // ===== タブ切り替え =====
  window.switchTab = function(tab) {
    const isLogin = tab === 'login';
    const panels = document.querySelectorAll('.auth-form-panel');
    panels[0].classList.toggle('hidden-panel', !isLogin);
    panels[1].classList.toggle('hidden-panel', isLogin);
    document.getElementById('tabIndicator').classList.toggle('register', !isLogin);
    document.getElementById('tabLoginBtn').classList.toggle('active', isLogin);
    document.getElementById('tabRegisterBtn').classList.toggle('active', !isLogin);
    document.getElementById('message').textContent = '';
  };

  // ===== アカウント作成 =====
  window.createAccount = async function() {
    const name = document.getElementById('regName').value.trim();
    const pass = document.getElementById('regPass').value.trim();
    const passConfirm = document.getElementById('regPassConfirm').value.trim();
    const msg = document.getElementById('message');
    msg.style.color = 'red';

    if (!name) { msg.textContent = '名前を入力してください'; return; }
    if (hasNG(name)) { msg.textContent = 'その名前は使用できません'; return; }
    if (!pass || pass.length !== 4 || !/^\d{4}$/.test(pass)) { msg.textContent = 'パスワードは数字4桁にしてください'; return; }
    if (['4545','0721'].includes(pass)) { msg.textContent = 'そのパスワードは使用できません'; return; }
    if (pass !== passConfirm) { msg.textContent = 'パスワードが一致しません'; return; }

    showLoading(true);
    try {
      await signInAnonymously(auth);
      const snap = await get(ref(db, 'accounts/' + name));
      if (snap.exists()) { msg.textContent = 'その名前はすでに使われています'; return; }
      const allSnap = await get(ref(db, 'accounts'));
      if (allSnap.exists() && Object.keys(allSnap.val()).length >= 50) { msg.textContent = 'アカウント上限に達しました'; return; }
      const hashedPass = await hashPassword(pass);
      await set(ref(db, 'accounts/' + name), { pass: hashedPass, balance: 10, history: ['アカウント作成ボーナス +10 かむ'], lastBonus: 0, createdAt: Date.now() });
      msg.style.color = 'green';
      msg.textContent = 'アカウント作成成功！ログインしてください';
      document.getElementById('regName').value = '';
      document.getElementById('regPass').value = '';
      document.getElementById('regPassConfirm').value = '';
      setTimeout(() => switchTab('login'), 1200);
    } catch(e) { msg.textContent = 'エラーが発生しました'; }
    finally { showLoading(false); }
  };

  // ===== ログイン =====
  window.login = async function() {
    const name = document.getElementById('loginName').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    const msg = document.getElementById('message');
    msg.style.color = 'red';
    if (!name || !pass) { msg.textContent = '名前とパスワードを入力してください'; return; }
    showLoading(true);
    try {
      await signInAnonymously(auth);
      const snap = await get(ref(db, 'accounts/' + name));
      if (!snap.exists()) { msg.textContent = '名前またはパスワードが違います'; return; }
      const userData = snap.val();
      const hashedPass = await hashPassword(pass);
      const isHashedMatch = userData.pass === hashedPass;
      const isLegacyMatch = userData.pass === pass;
      if (!isHashedMatch && !isLegacyMatch) { msg.textContent = '名前またはパスワードが違います'; return; }
      if (isLegacyMatch) {
        await update(ref(db, 'accounts/' + name), { pass: hashedPass });
        userData.pass = hashedPass;
      }
      currentUser = userData; currentUserName = name;
      localStorage.setItem('shimupay_user', name);
      showMain();
    } catch(e) { msg.textContent = '接続エラーが発生しました'; }
    finally { showLoading(false); }
  };

  function showMain() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = 'block';
    document.getElementById('headerBalance').style.display = 'block';
    document.getElementById('headerBalance').textContent = currentUser.balance + ' かむ';
    updateUI();
    loadPosts();
  }

  function updateUI() {
    document.getElementById('userName').textContent = '👤 ' + currentUserName;
    const ratingCount = Number(currentUser.ratingCount || 0);
    document.getElementById('userRating').textContent = ratingCount
      ? `信頼 ${ratingStars(Math.round(currentUser.ratingAverage || 0))} ${currentUser.ratingAverage}/5 (${ratingCount}件)`
      : '信頼 評価なし';
    document.getElementById('balanceDisp').textContent = currentUser.balance;
    document.getElementById('headerBalance').textContent = currentUser.balance + ' かむ';
    const imageInput = document.getElementById('postImageFile');
    if (imageInput) {
      imageInput.style.display = isVip(currentUser) ? 'block' : 'none';
      if (!isVip(currentUser)) imageInput.value = '';
    }
  }

  // ===== 投稿 =====
  window.submitPost = async function() {
    const title = document.getElementById('postTitle').value.trim();
    const desc = document.getElementById('postDesc').value.trim();
    const productTag = document.getElementById('postProductTag')?.value.trim() || '';
    const requestTag = document.getElementById('postRequestTag').value.trim();
    const imageFile = document.getElementById('postImageFile')?.files[0] || null;
    const reward = Number(document.getElementById('postReward').value);
    const msg = document.getElementById('postMsg');
    msg.style.color = 'red';

    if (!title || !desc) { msg.textContent = 'タイトルと説明は必須です'; return; }
    if (desc.length > 500) { msg.textContent = '説明は500文字以内にしてください'; return; }
    if (hasNG(title) || hasNG(desc)) { msg.textContent = 'NGワードが含まれています'; return; }
    if (imageFile && !isVip(currentUser)) { msg.textContent = '画像付き投稿はVIP限定です'; return; }
    if (!reward || reward < 1 || reward > 100) { msg.textContent = '報酬は1〜100かむで設定してください'; return; }
    if (currentUser.balance < reward) { msg.textContent = `残高が不足しています（現在: ${currentUser.balance} かむ）`; return; }

    try {
      const imageData = await resizeImageFile(imageFile);
      // 報酬をエスクロー
      const newBalance = currentUser.balance - reward;
      const newHistory = [...(currentUser.history||[]), `📝 依頼「${title}」報酬 -${reward} かむ`].slice(-10);
      await update(ref(db, 'accounts/' + currentUserName), { balance: newBalance, history: newHistory });
      currentUser.balance = newBalance; currentUser.history = newHistory;
      updateUI();

      const postRef = push(ref(db, 'hoshiriwa_posts'));
      await set(postRef, {
        id: postRef.key, name: title, desc,
        product_tag: productTag, request_tag: requestTag,
        image_data: imageData,
        reward, poster: currentUserName,
        status: 'open', created_at: Date.now(),
        expires_at: Date.now() + REQUEST_TTL_MS
      });

      msg.style.color = 'green'; msg.textContent = '依頼を募集しました！';
      document.getElementById('postTitle').value = '';
      document.getElementById('postDesc').value = '';
      if (document.getElementById('postProductTag')) document.getElementById('postProductTag').value = '';
      document.getElementById('postRequestTag').value = '';
      if (document.getElementById('postImageFile')) document.getElementById('postImageFile').value = '';
      document.getElementById('postReward').value = '';
    } catch(e) { msg.textContent = e.message || '投稿に失敗しました'; }
  };

  // ===== 一覧 =====
  function loadPosts() {
    onValue(ref(db, 'hoshiriwa_posts'), async snap => {
      const now = Date.now();
      const expiredKeys = [];
      allPosts = snap.exists()
        ? Object.entries(snap.val())
            .filter(([key, post]) => {
              const expired = isExpiredPost(post);
              if (expired) expiredKeys.push(key);
              return !expired;
            })
            .map(([, post]) => post)
            .sort((a, b) => b.created_at - a.created_at)
        : [];
      if (expiredKeys.length) {
        const updates = {};
        expiredKeys.forEach(key => { updates[`hoshiriwa_posts/${key}`] = null; });
        try { await update(ref(db), updates); } catch (e) { }
      }
      filterPosts();
    });
  }

  window.filterPosts = function() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const filtered = q ? allPosts.filter(p =>
      (p.name||'').toLowerCase().includes(q) ||
      (p.desc||'').toLowerCase().includes(q) ||
      (p.product_tag||'').toLowerCase().includes(q) ||
      (p.request_tag||'').toLowerCase().includes(q)
    ) : allPosts;
    renderPosts(filtered);
  };

  function renderPosts(posts) {
    const div = document.getElementById('postList');
    if (posts.length === 0) { div.innerHTML = '<p style="color:#aaa;font-size:0.85em;margin:0;">依頼がありません</p>'; return; }
    div.innerHTML = posts.map(p => {
      const status = p.status || 'open';
      const isDone = status === 'done';
      const isOwn = p.poster === currentUserName;
      const isAssignee = p.assignee === currentUserName;
      const date = new Date(p.created_at).toLocaleDateString('ja-JP');
      const imageSrc = p.image_data || p.image_url || '';
      const applicants = getApplicants(p);
      const hasApplied = applicants.some(([, app]) => app.user === currentUserName);
      const submission = p.submission || {};
      const deliveryName = submission.file_name || (submission.file_type?.startsWith('video/') ? 'hoshiriwa-delivery.mp4' : 'hoshiriwa-delivery.jpg');
      const deliveryFile = submission.file_data
        ? submission.file_type?.startsWith('video/')
          ? `<video class="post-image" src="${esc(submission.file_data)}" controls></video>`
          : `<img class="post-image" src="${esc(submission.file_data)}" alt="" loading="lazy">`
        : '';
      const deliveryDownload = submission.file_data && isOwn
        ? `<a class="btn-accept" href="${esc(submission.file_data)}" download="${esc(deliveryName)}" style="text-align:center;text-decoration:none;box-sizing:border-box;">納品ファイルをダウンロード</a>`
        : '';
      const applicantList = isOwn && status === 'open' && applicants.length
        ? `<div class="applicant-list">
            ${applicants.map(([id, app]) => `
              <div class="applicant-row">
                <span>
                  ${esc(app.user)}
                  ${app.ratingCount ? `<span class="rating-stars">${ratingStars(Math.round(app.ratingAverage || 0))}</span> ${app.ratingAverage}/5 (${app.ratingCount}件)` : '評価なし'}
                  ${app.message ? `<br>${esc(app.message)}` : ''}
                </span>
                <button onclick="chooseApplicant('${p.id}','${id}')">この人に決める</button>
              </div>`).join('')}
          </div>`
        : '';
      const submissionBox = status === 'submitted' || status === 'done'
        ? `<div class="submission-box">
            <div class="post-desc">${esc(submission.message || '納品メッセージなし')}</div>
            ${deliveryFile}
            ${deliveryDownload}
            ${p.rating ? `<div class="rating-stars">${ratingStars(p.rating)} (${p.rating}/5)</div>` : ''}
          </div>`
        : '';
      const actions = (() => {
        if (status === 'open' && !isOwn) {
          return hasApplied
            ? '<span class="btn-gray-sm" style="text-align:center;">応募済み</span>'
            : `<button class="btn-accept" onclick="applyPost('${p.id}')">応募する</button>`;
        }
        if (status === 'open' && isOwn) {
          return applicants.length
            ? '<span class="btn-gray-sm" style="text-align:center;">応募者から1人選んでください</span>'
            : '<span class="btn-gray-sm" style="text-align:center;">応募待ち</span>';
        }
        if (status === 'assigned' && isAssignee) {
          return `
            <input type="file" id="deliveryFile-${p.id}" accept="image/*,video/*" style="width:100%;margin:0 0 10px;">
            <button class="btn-accept" onclick="submitDelivery('${p.id}')">納品する</button>`;
        }
        if (status === 'assigned' && isOwn) {
          return `<span class="btn-gray-sm" style="text-align:center;">${esc(p.assignee)} が作業中</span>`;
        }
        if (status === 'submitted' && isOwn) {
          return `<button class="btn-accept" onclick="approveDelivery('${p.id}')">承認して評価する</button>`;
        }
        if (status === 'submitted' && isAssignee) {
          return '<span class="btn-gray-sm" style="text-align:center;">承認待ち</span>';
        }
        if (isDone) {
          return '<span class="btn-gray-sm" style="text-align:center;">完了</span>';
        }
        return '<span class="btn-gray-sm" style="text-align:center;">進行中</span>';
      })();
      return `
        <div class="post-item">
          <div class="post-item-header">
            <span class="status-badge ${statusClass(status)}">${statusLabel(status)}</span>
            <span class="reward-badge">💰 ${p.reward} かむ</span>
          </div>
          <div class="post-title">${esc(p.name)}</div>
          <div class="post-desc">${esc(p.desc)}</div>
          ${imageSrc ? `<img class="post-image" src="${esc(imageSrc)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
          <div class="post-tags">
            ${p.product_tag ? `<span class="tag product">#${esc(p.product_tag)}</span>` : ''}
            ${p.request_tag ? `<span class="tag request">#${esc(p.request_tag)}</span>` : ''}
          </div>
          <div class="post-meta">投稿者: ${esc(p.poster)} ・ ${date}${p.assignee ? ` ・ 担当: ${esc(p.assignee)}` : ''}</div>
          ${applicantList}
          ${submissionBox}
          <div class="post-actions">
            ${actions}
          </div>
        </div>`;
    }).join('');
  }

  // ===== 応募・納品・承認 =====
  window.applyPost = async function(postId) {
    const post = allPosts.find(p => p.id === postId);
    if (!post || (post.status || 'open') !== 'open' || post.poster === currentUserName) return;
    const message = prompt('応募メッセージ（任意）', '') || '';
    if (message.length > 120) { alert('応募メッセージは120文字以内にしてください'); return; }
    if (hasNG(message)) { alert('NGワードが含まれています'); return; }
    try {
      const appRef = push(ref(db, `hoshiriwa_posts/${postId}/applicants`));
      await set(appRef, {
        user: currentUserName,
        message,
        ratingAverage: currentUser.ratingAverage || 0,
        ratingCount: currentUser.ratingCount || 0,
        applied_at: Date.now()
      });
      alert('応募しました');
    } catch(e) { alert('応募に失敗しました'); }
  };

  window.chooseApplicant = async function(postId, applicantId) {
    const post = allPosts.find(p => p.id === postId);
    const applicant = post?.applicants?.[applicantId];
    if (!post || post.poster !== currentUserName || !applicant || (post.status || 'open') !== 'open') return;
    if (!confirm(`${applicant.user} さんに依頼しますか？`)) return;
    try {
      await update(ref(db, `hoshiriwa_posts/${postId}`), {
        status: 'assigned',
        assignee: applicant.user,
        assigned_at: Date.now()
      });
    } catch(e) { alert('選択に失敗しました'); }
  };

  window.submitDelivery = async function(postId) {
    const post = allPosts.find(p => p.id === postId);
    if (!post || post.assignee !== currentUserName || post.status !== 'assigned') return;
    const file = document.getElementById(`deliveryFile-${postId}`)?.files[0] || null;
    const message = prompt('納品メッセージ（任意）', '') || '';
    if (message.length > 300) { alert('納品メッセージは300文字以内にしてください'); return; }
    if (hasNG(message)) { alert('NGワードが含まれています'); return; }
    try {
      const fileData = await readDeliveryFile(file);
      await update(ref(db, `hoshiriwa_posts/${postId}`), {
        status: 'submitted',
        submission: {
          message,
          file_data: fileData.data,
          file_type: fileData.type,
          file_name: fileData.name,
          submitted_at: Date.now()
        }
      });
      alert('納品しました。依頼者の承認を待ってください');
    } catch(e) { alert(e.message || '納品に失敗しました'); }
  };

  window.approveDelivery = async function(postId) {
    const post = allPosts.find(p => p.id === postId);
    if (!post || post.poster !== currentUserName || post.status !== 'submitted' || !post.assignee) return;
    const rating = Number(prompt('評価を1〜5で入力してください', '5'));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) { alert('評価は1〜5で入力してください'); return; }
    if (!confirm(`${post.assignee} さんに ${post.reward} かむ を支払い、評価${rating}で完了しますか？`)) return;
    try {
      const userSnap = await get(ref(db, `accounts/${post.assignee}`));
      if (!userSnap.exists()) { alert('受注者アカウントが見つかりません'); return; }
      const assignee = userSnap.val();
      const newBalance = Number(assignee.balance || 0) + Number(post.reward || 0);
      const newHistory = [...(assignee.history || []), `✅ 依頼完了「${post.name}」+${post.reward} かむ / 評価${rating}`].slice(-10);
      const ratingCount = Number(assignee.ratingCount || 0) + 1;
      const ratingTotal = Number(assignee.ratingTotal || 0) + rating;
      const updates = {};
      updates[`accounts/${post.assignee}/balance`] = newBalance;
      updates[`accounts/${post.assignee}/history`] = newHistory;
      updates[`accounts/${post.assignee}/ratingCount`] = ratingCount;
      updates[`accounts/${post.assignee}/ratingTotal`] = ratingTotal;
      updates[`accounts/${post.assignee}/ratingAverage`] = Math.round((ratingTotal / ratingCount) * 10) / 10;
      updates[`hoshiriwa_posts/${postId}/status`] = 'done';
      updates[`hoshiriwa_posts/${postId}/rating`] = rating;
      updates[`hoshiriwa_posts/${postId}/accepted_at`] = Date.now();
      await update(ref(db), updates);
      alert('承認して支払いと評価を完了しました');
    } catch(e) { alert('承認に失敗しました'); }
  };

  // ===== セッション復元 =====
  async function restore() {
    try {
      await signInAnonymously(auth);
      const saved = localStorage.getItem('shimupay_user');
      if (saved) {
        const snap = await get(ref(db, 'accounts/' + saved));
        if (snap.exists()) {
          currentUser = snap.val(); currentUserName = saved;
          showMain(); return;
        } else { localStorage.removeItem('shimupay_user'); }
      }
      document.getElementById('loginScreen').style.display = 'block';
    } catch(e) {
      document.getElementById('loginScreen').style.display = 'block';
    } finally {
      document.getElementById('restoreLoading').style.display = 'none';
    }
  }
  restore();

  function toggleDrawer() {
    document.getElementById('drawer').classList.toggle('open');
    document.getElementById('drawerOverlay').classList.toggle('open');
  }
  function closeDrawer() {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerOverlay').classList.remove('open');
  }
