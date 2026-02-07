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
        await this.loadCurrentOrders();
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

            // 管理者の場合、admin-only要素を表示
            if (this.isAdmin && typeof showAdminOnlyElements === 'function') {
                showAdminOnlyElements();
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
                const tag = document.getElementById('tagInput').value.trim();
                const paidOnly = document.getElementById('paidOnlyCheckbox').checked;
                this.searchOrders(tag, paidOnly);
            }
        });

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

            const params = new URLSearchParams({
                tag: tag || '',
                paidOnly: paidOnly.toString()
            });
            const response = await authFetch(`${this.apiUrl}/search?${params}`);
            const result = await response.json();

            if (result.success) {
                this.currentTag = tag;
                this.currentPaidOnly = paidOnly;
                this.showNotification(`${result.count}件の注文（${result.rowCount}行）を取得しました`, 'success');

                // DBから再読み込みして表示（統一されたフォーマットで表示）
                await this.loadCurrentOrders();
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
                // 合計金額と単価（インデックス5と12）は円マークを付ける
                if ((index === 5 || index === 12) && cell !== '') {
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

        // 列幅リサイズ機能を初期化
        if (window.ColumnResize) {
            ColumnResize.init(table, 'orders-column-widths');
        }

        // ソート機能を初期化
        if (window.TableSort) {
            TableSort.init(table);
        }
    }

    updateResultSummary(orderCount, rowCount) {
        document.getElementById('resultCount').textContent =
            `${orderCount}件の注文（${rowCount}行）が見つかりました`;
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

    async loadCurrentOrders() {
        const container = document.getElementById('ordersTableContainer');
        const dbInfoSection = document.getElementById('currentDbInfo');

        try {
            container.innerHTML = '<div class="loading">読み込み中...</div>';

            const response = await authFetch(`${this.apiUrl}/current`);
            const result = await response.json();

            if (result.success) {
                // DB情報を表示
                this.displayDbInfo(result.totalOrders, result.latestExport);

                // 現在のデータがあれば表示
                if (result.orders && result.orders.data && result.orders.data.length > 0) {
                    this.displayCurrentOrders(result.orders.data);
                    this.updateResultSummary(result.orders.total, result.orders.total);
                    document.getElementById('searchResult').classList.remove('hidden');
                } else {
                    container.innerHTML = '<div class="no-data">DBにデータがありません。タグを入力して検索してください</div>';
                }
            } else {
                console.error('Load current orders failed:', result);
                container.innerHTML = '<div class="no-data">タグを入力して検索してください</div>';
            }
        } catch (error) {
            console.error('Load current orders exception:', error);
            container.innerHTML = '<div class="no-data">タグを入力して検索してください</div>';
        }
    }

    displayDbInfo(totalOrders, latestExport) {
        const dbInfoSection = document.getElementById('currentDbInfo');
        const orderCountEl = document.getElementById('dbOrderCount');
        const exportDateEl = document.getElementById('dbExportDate');
        const exportTagsEl = document.getElementById('dbExportTags');

        orderCountEl.textContent = `${totalOrders}件`;

        if (latestExport) {
            const exportDate = new Date(latestExport.exportedAt);
            exportDateEl.textContent = exportDate.toLocaleString('ja-JP');

            if (latestExport.searchTags && latestExport.searchTags.length > 0) {
                exportTagsEl.innerHTML = latestExport.searchTags
                    .map(tag => `<span class="tag-badge clickable" data-tag="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</span>`)
                    .join(' ');

                // タグバッジにクリックイベントを追加
                exportTagsEl.querySelectorAll('.tag-badge.clickable').forEach(badge => {
                    badge.addEventListener('click', () => {
                        this.addTagToSearch(badge.dataset.tag);
                    });
                });
            } else {
                exportTagsEl.textContent = '（タグ指定なし）';
            }

        } else {
            exportDateEl.textContent = '-';
            exportTagsEl.textContent = '-';
        }

        dbInfoSection.classList.remove('hidden');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    addTagToSearch(tag) {
        const tagInput = document.getElementById('tagInput');
        const currentValue = tagInput.value.trim();
        const quotedTag = `"${tag}"`;

        // すでに同じタグが含まれているかチェック
        const existingTags = currentValue.split(/[,\s]+/).filter(t => t.trim());
        if (existingTags.includes(tag) || existingTags.includes(quotedTag)) {
            this.showNotification(`タグ「${tag}」は既に追加されています`, 'info');
            return;
        }

        // タグを引用符で囲んで追加
        if (currentValue) {
            tagInput.value = `${currentValue}, ${quotedTag}`;
        } else {
            tagInput.value = quotedTag;
        }

        // 入力欄にフォーカス
        tagInput.focus();
        this.showNotification(`タグ「${tag}」を追加しました`, 'success');
    }

    displayCurrentOrders(orders) {
        const container = document.getElementById('ordersTableContainer');

        if (orders.length === 0) {
            container.innerHTML = '<div class="no-data">DBにデータがありません</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'data-table';

        // ヘッダー作成
        const headers = [
            '注文番号', '注文日時', '顧客ID', '顧客名', 'メールアドレス',
            '合計金額', '支払いステータス', '発送ステータス',
            '商品名', 'バリエーション', '数量', '現在数量', '単価', 'BSP', '職業', '自己紹介', 'タグ'
        ];
        const headerRow = document.createElement('tr');
        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            headerRow.appendChild(th);
        });
        table.appendChild(headerRow);

        // データ行作成
        orders.forEach(order => {
            const tr = document.createElement('tr');

            const cells = [
                order.order_no,
                order.order_date,
                order.shopify_id,
                order.full_name,
                order.email,
                order.total_price ? `¥${Number(order.total_price).toLocaleString()}` : '',
                order.financial_status,
                order.fulfillment_status,
                order.product_name,
                order.variant,
                order.quantity,
                order.current_quantity,
                order.price ? `¥${Number(order.price).toLocaleString()}` : '',
                order.back_stage_pass ?? 0,
                order.occupation || '',
                order.biography || '',
                order.tags ? order.tags.join(', ') : ''
            ];

            cells.forEach(cell => {
                const td = document.createElement('td');
                td.textContent = cell;
                tr.appendChild(td);
            });

            table.appendChild(tr);
        });

        container.innerHTML = '';
        container.appendChild(table);

        // 列幅リサイズ機能を初期化
        if (window.ColumnResize) {
            ColumnResize.init(table, 'orders-column-widths');
        }

        // ソート機能を初期化
        if (window.TableSort) {
            TableSort.init(table);
        }
    }
}

// 初期化
const ordersManager = new OrdersManager();
