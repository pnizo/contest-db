/**
 * チェックイン受付スクリプト
 */

// 認証チェック（ページ読み込み時）
(async function checkAuth() {
  const token = localStorage.getItem('authToken');
  if (!token) {
    window.location.href = '/';
    return;
  }

  // サーバー側で認証状態を確認
  try {
    const response = await fetch('/api/auth/status', {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    });
    const result = await response.json();
    if (!result.isAuthenticated) {
      localStorage.removeItem('authToken');
      window.location.href = '/';
      return;
    }
  } catch (error) {
    console.error('Auth check error:', error);
    window.location.href = '/';
    return;
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('checkinForm');
  const codeInput = document.getElementById('codeInput');
  const submitBtn = document.getElementById('submitBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  // オーバーレイ要素
  const overlay = document.getElementById('overlay');

  // 確認パネル要素
  const confirmPanel = document.getElementById('confirmPanel');
  const confirmOrderName = document.getElementById('confirmOrderName');
  const confirmProductName = document.getElementById('confirmProductName');
  const confirmCurrentQuantity = document.getElementById('confirmCurrentQuantity');
  const confirmBtn = document.getElementById('confirmBtn');
  const cancelBtn = document.getElementById('cancelBtn');

  // 結果パネル要素
  const resultPanel = document.getElementById('resultPanel');
  const resultTitle = document.getElementById('resultTitle');
  const resultDetails = document.getElementById('resultDetails');
  const resetBtn = document.getElementById('resetBtn');

  // 状態管理
  let currentCode = '';

  // URLパラメータからコードを取得して初期値に設定
  const urlParams = new URLSearchParams(window.location.search);
  const initialCode = urlParams.get('code');
  if (initialCode) {
    // ハイフンを除去してから再フォーマット
    let cleanCode = initialCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    let formatted = '';
    for (let i = 0; i < cleanCode.length; i++) {
      if (i > 0 && i % 4 === 0) {
        formatted += '-';
      }
      formatted += cleanCode[i];
    }
    codeInput.value = formatted;
  }

  // ログアウト処理
  logoutBtn.addEventListener('click', async () => {
    try {
      const token = localStorage.getItem('authToken');
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
    localStorage.removeItem('authToken');
    window.location.href = '/';
  });

  // コード入力のフォーマット処理
  codeInput.addEventListener('input', (e) => {
    let value = e.target.value.toUpperCase();

    // 英数字以外を除去（ハイフンは許可）
    value = value.replace(/[^A-Z0-9-]/g, '');

    // ハイフンを一旦除去
    const cleanValue = value.replace(/-/g, '');

    // 4文字ごとにハイフンを挿入
    let formatted = '';
    for (let i = 0; i < cleanValue.length; i++) {
      if (i > 0 && i % 4 === 0) {
        formatted += '-';
      }
      formatted += cleanValue[i];
    }

    e.target.value = formatted;

    // エラー状態をクリア
    codeInput.classList.remove('error', 'success');
  });

  // Step 1: コード検証
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const code = codeInput.value.trim();

    if (!code) {
      showError('コードを入力してください');
      codeInput.classList.add('error');
      return;
    }

    // ボタンをローディング状態に
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading"></span>確認中...';

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/checkin/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ code })
      });

      const data = await response.json();
      console.log('Verify response:', data);

      if (data.success) {
        currentCode = code;
        showConfirmPanel(data);
        codeInput.classList.add('success');
      } else {
        showError(data.error || 'エラーが発生しました');
        codeInput.classList.add('error');
      }
    } catch (error) {
      console.error('Verify error:', error);
      showError('通信エラーが発生しました');
      codeInput.classList.add('error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'コード確認';
    }
  });

  // 確認パネルを表示
  function showConfirmPanel(data) {
    confirmOrderName.textContent = data.orderName;

    // 商品名とバリエーション名を別行で表示
    if (data.variantTitle) {
      confirmProductName.innerHTML = `<strong>${escapeHtml(data.productName)}</strong><br><span style="color: #444;">${escapeHtml(data.variantTitle)}</span>`;
    } else {
      confirmProductName.innerHTML = `<strong>${escapeHtml(data.productName)}</strong>`;
    }

    // 使用可否を表示
    if (data.isUsable) {
      confirmCurrentQuantity.textContent = '使用可能';
      confirmCurrentQuantity.style.color = '#27ae60';
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'チェックイン実行';
      confirmBtn.style.background = '';
    } else {
      confirmCurrentQuantity.textContent = '使用済み';
      confirmCurrentQuantity.style.color = '#e74c3c';
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'このチケットは使用済みです';
      confirmBtn.style.background = '#bdc3c7';
    }

    form.style.display = 'none';
    overlay.classList.add('visible');
    confirmPanel.classList.add('visible');
    resultPanel.className = 'result-panel';
  }

  // キャンセル
  cancelBtn.addEventListener('click', () => {
    overlay.classList.remove('visible');
    confirmPanel.classList.remove('visible');
    form.style.display = 'block';
    codeInput.classList.remove('success');
    currentCode = '';
  });

  // Step 2: チェックイン実行
  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="loading"></span>処理中...';

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ code: currentCode })
      });

      const data = await response.json();

      if (data.success) {
        showSuccess(data);
      } else {
        showError(data.error || 'エラーが発生しました');
      }
    } catch (error) {
      console.error('Checkin error:', error);
      showError('通信エラーが発生しました');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = 'チェックイン実行';
    }
  });

  // 成功表示
  function showSuccess(data) {
    overlay.classList.remove('visible');
    confirmPanel.classList.remove('visible');
    resultPanel.className = 'result-panel success';

    const productDisplay = data.variantTitle
      ? `${data.productName} (${data.variantTitle})`
      : data.productName;

    resultTitle.innerHTML = '&#10004; 受付完了';
    resultDetails.innerHTML = `
      <dl>
        <dt>注文番号</dt>
        <dd>${escapeHtml(data.orderName)}</dd>
        <dt>商品</dt>
        <dd>${escapeHtml(productDisplay)}</dd>
      </dl>
    `;

    form.style.display = 'none';
  }

  // エラー表示
  function showError(message) {
    overlay.classList.remove('visible');
    confirmPanel.classList.remove('visible');
    resultPanel.className = 'result-panel error';
    resultTitle.innerHTML = '&#10008; エラー';
    resultDetails.innerHTML = `<p>${escapeHtml(message)}</p>`;

    // フォームは表示したまま
    form.style.display = 'block';
  }

  // リセット
  resetBtn.addEventListener('click', () => {
    resultPanel.className = 'result-panel';
    overlay.classList.remove('visible');
    confirmPanel.classList.remove('visible');
    codeInput.value = '';
    codeInput.classList.remove('error', 'success');
    form.style.display = 'block';
    currentCode = '';
    codeInput.focus();
  });

  // HTMLエスケープ
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // 初期フォーカス
  codeInput.focus();
});
