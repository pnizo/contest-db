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
  
  // 確認パネル要素
  const confirmPanel = document.getElementById('confirmPanel');
  const confirmOrderName = document.getElementById('confirmOrderName');
  const confirmProductName = document.getElementById('confirmProductName');
  const confirmCurrentQuantity = document.getElementById('confirmCurrentQuantity');
  const useQuantityDisplay = document.getElementById('useQuantityDisplay');
  const quantityMaxLabel = document.getElementById('quantityMaxLabel');
  const decreaseBtn = document.getElementById('decreaseBtn');
  const increaseBtn = document.getElementById('increaseBtn');
  const confirmBtn = document.getElementById('confirmBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  
  // 結果パネル要素
  const resultPanel = document.getElementById('resultPanel');
  const resultTitle = document.getElementById('resultTitle');
  const resultDetails = document.getElementById('resultDetails');
  const resetBtn = document.getElementById('resetBtn');

  // 状態管理
  let currentCode = '';
  let useQuantity = 1;
  let maxQuantity = 1;  // min(ticketQuantity, currentQuantity)

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
      const response = await fetch('/api/checkin/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code })
      });

      const data = await response.json();

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
    const productDisplay = data.variantTitle 
      ? `${data.productName} (${data.variantTitle})`
      : data.productName;

    confirmOrderName.textContent = data.orderName;
    confirmProductName.textContent = productDisplay;
    confirmCurrentQuantity.textContent = `${data.currentQuantity}枚`;

    // 最大使用枚数 = min(ticketQuantity, currentQuantity)
    maxQuantity = Math.min(data.ticketQuantity, data.currentQuantity);
    useQuantity = 1;
    
    updateQuantityDisplay();
    
    form.style.display = 'none';
    confirmPanel.classList.add('visible');
    resultPanel.className = 'result-panel';
  }

  // 枚数表示を更新
  function updateQuantityDisplay() {
    useQuantityDisplay.textContent = useQuantity;
    quantityMaxLabel.textContent = `最大: ${maxQuantity}枚`;
    
    decreaseBtn.disabled = useQuantity <= 1;
    increaseBtn.disabled = useQuantity >= maxQuantity;
  }

  // 枚数減少
  decreaseBtn.addEventListener('click', () => {
    if (useQuantity > 1) {
      useQuantity--;
      updateQuantityDisplay();
    }
  });

  // 枚数増加
  increaseBtn.addEventListener('click', () => {
    if (useQuantity < maxQuantity) {
      useQuantity++;
      updateQuantityDisplay();
    }
  });

  // キャンセル
  cancelBtn.addEventListener('click', () => {
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
      const response = await fetch('/api/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          code: currentCode,
          useQuantity: useQuantity
        })
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
        <dt>使用枚数</dt>
        <dd>${data.usedQuantity}枚</dd>
      </dl>
      <div class="quantity-change">
        残り枚数: 
        <span class="quantity-number">${data.previousQuantity}</span>
        <span class="arrow">→</span>
        <span class="quantity-number">${data.newQuantity}</span>
      </div>
    `;
    
    form.style.display = 'none';
  }

  // エラー表示
  function showError(message) {
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
    confirmPanel.classList.remove('visible');
    codeInput.value = '';
    codeInput.classList.remove('error', 'success');
    form.style.display = 'block';
    currentCode = '';
    useQuantity = 1;
    maxQuantity = 1;
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
