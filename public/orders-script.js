// JWT管理ユーティリティ
const AuthToken = {
    get() {
        return localStorage.getItem('authToken');
    },
    set(token) {
        localStorage.setItem('authToken', token);
    },
    remove() {
        localStorage.removeItem('authToken');
    },
    getHeaders() {
        const token = this.get();
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }
};

// 認証付きfetch関数
async function authFetch(url, options = {}) {
    const authHeaders = AuthToken.getHeaders();

    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
            ...(options.headers || {})
        },
        credentials: 'include'
    };

    const mergedOptions = { ...defaultOptions, ...options };

    return fetch(url, mergedOptions);
}

class OrdersManager {
    constructor() {
        this.apiUrl = '/api/orders';
        this.currentUser = null;
        this.isAdmin = false;
        this.currentTag = '';
        this.currentOrders = [];
        this.currentHeaders = [];
        this.currentPaidOnly = true;
        this.init();
    }

    async init() {
        await this.checkAuthStatus();
        this.bindEvents();
    }

    async checkAuthStatus() {
        try {
            const response = await authFetch('/api/auth/status');
            const result = await response.json();

            if (!result.isAuthenticated) {
                AuthToken.remove();
                window.location.href = '/';
                return;
            }

            this.currentUser = result.user;
            this.isAdmin = result.user.role === 'admin';

            const displayName = result.user.name || result.user.username || result.user.email || 'Unknown';

            document.getElementById('userName').textContent = displayName;
            document.getElementById('userRole').textContent = result.user.role === 'admin' ? '管理者' : 'ユーザー';
            document.getElementById('userAvatar').textContent = displayName.charAt(0).toUpperCase();
            document.getElementById('authHeader').style.display = 'flex';

            // 管理者の場合、admin-onlyリンクを表示
            if (this.isAdmin) {
                document.querySelectorAll('.admin-only').forEach(el => {
                    el.style.display = 'inline-block';
                });
            }

        } catch (error) {
            console.error('Auth check failed:', error);
            AuthToken.remove();
            window.location.href = '/';
        }
    }

    bindEvents() {
        // 検索機能
        document.getElementById('searchBtn').addEventListener('click', () => {
            const tag = document.getElementById('tagInput').value.trim();
            const paidOnly = document.getElementById('paidOnlyCheckbox').checked;
            this.searchOrders(tag, paidOnly);
        });

        document.getElementById('tagInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const tag = e.target.value.trim();
                const paidOnly = document.getElementById('paidOnlyCheckbox').checked;
                this.searchOrders(tag, paidOnly);
            }
        });

        // エクスポートボタン
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportToSheet();
            });
        }

        // ログアウト
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });
    }

    async searchOrders(tag, paidOnly = true) {
        const searchBtn = document.getElementById('searchBtn');
        const originalText = searchBtn.textContent;
        const container = document.getElementById('ordersTableContainer');

        try {
            searchBtn.disabled = true;
            searchBtn.textContent = '検索中...';
            container.innerHTML = '<div class="loading">検索中...</div>';

            const response = await authFetch(`${this.apiUrl}/search?tag=${encodeURIComponent(tag)}&paidOnly=${paidOnly}`);
            const result = await response.json();

            if (result.success) {
                this.currentTag = tag;
                this.currentPaidOnly = paidOnly;
                this.currentOrders = result.data;
                this.currentHeaders = result.headers;
                this.displayOrders(result.data, result.headers);
                this.updateResultSummary(result.count, result.rowCount);
                document.getElementById('searchResult').classList.remove('hidden');
            } else {
                console.error('Order search failed:', result);
                this.showNotification(result.error || '検索に失敗しました', 'error');
                container.innerHTML = `<div class="no-data">検索に失敗しました: ${result.error || '不明なエラー'}</div>`;
            }
        } catch (error) {
            console.error('Order search exception:', error);
            this.showNotification(`検索中にエラーが発生しました: ${error.message}`, 'error');
            container.innerHTML = `<div class="no-data">エラーが発生しました: ${error.message}</div>`;
        } finally {
            searchBtn.disabled = false;
            searchBtn.textContent = originalText;
        }
    }

    displayOrders(orders, headers) {
        const container = document.getElementById('ordersTableContainer');

        if (orders.length === 0) {
            container.innerHTML = '<div class="no-data">該当する注文が見つかりません</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'data-table';

        // ヘッダー作成（APIから取得した動的ヘッダーを使用）
        const headerRow = document.createElement('tr');
        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            headerRow.appendChild(th);
        });

        table.appendChild(headerRow);

        // データ行作成
        orders.forEach(row => {
            const tr = document.createElement('tr');

            row.forEach((cell, index) => {
                const td = document.createElement('td');
                // 合計金額と単価（インデックス5と11）は円マークを付ける
                if ((index === 5 || index === 11) && cell !== '') {
                    td.textContent = `¥${Number(cell).toLocaleString()}`;
                } else {
                    td.textContent = cell;
                }
                tr.appendChild(td);
            });

            table.appendChild(tr);
        });

        container.innerHTML = '';
        container.appendChild(table);
    }

    updateResultSummary(orderCount, rowCount) {
        document.getElementById('resultCount').textContent =
            `${orderCount}件の注文（${rowCount}行）が見つかりました`;
    }

    async exportToSheet() {
        if (!this.isAdmin) {
            this.showNotification('管理者権限が必要です', 'error');
            return;
        }

        if (!this.currentTag) {
            this.showNotification('先に検索を実行してください', 'error');
            return;
        }

        const exportBtn = document.getElementById('exportBtn');
        const originalText = exportBtn.textContent;

        try {
            exportBtn.disabled = true;
            exportBtn.textContent = '出力中...';

            const response = await authFetch(`${this.apiUrl}/export`, {
                method: 'POST',
                body: JSON.stringify({
                    tag: this.currentTag,
                    paidOnly: this.currentPaidOnly
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification(result.message, 'success');
            } else {
                console.error('Order export failed:', result);
                this.showNotification(result.error || '出力に失敗しました', 'error');
            }
        } catch (error) {
            console.error('Order export exception:', error);
            this.showNotification(`出力中にエラーが発生しました: ${error.message}`, 'error');
        } finally {
            exportBtn.disabled = false;
            exportBtn.textContent = originalText;
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.remove('hidden');

        setTimeout(() => {
            notification.classList.add('hidden');
        }, 5000);
    }

    async logout() {
        try {
            const response = await authFetch('/api/auth/logout', {
                method: 'POST'
            });

            AuthToken.remove();
            window.location.href = '/';
        } catch (error) {
            console.error('Logout failed:', error);
            AuthToken.remove();
            window.location.href = '/';
        }
    }
}

// 初期化
const ordersManager = new OrdersManager();
