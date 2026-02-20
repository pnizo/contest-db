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

class MembersManager {
    constructor() {
        this.apiUrl = '/api/members';
        this.currentUser = null;
        this.isAdmin = false;
        this.currentPage = 1;
        this.limit = 50;
        this.totalPages = 0;
        this.total = 0;
        this.currentFilters = {};
        this.currentSort = {
            column: 'created_at',
            direction: 'desc'
        };
        this.notifyingMember = null;
        this.init();
    }

    async init() {
        await this.checkAuthStatus();
        this.bindEvents();
        if (this.currentUser) {
            setTimeout(async () => {
                await this.loadMembers();
            }, 100);
        }
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
            const searchTerm = document.getElementById('searchInput').value;
            this.handleSearch(searchTerm);
        });

        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSearch(e.target.value);
            }
        });

        document.getElementById('searchInput').addEventListener('input', (e) => {
            const clearBtn = document.getElementById('clearSearchBtn');
            if (e.target.value.length > 0) {
                clearBtn.classList.remove('hidden');
            } else {
                clearBtn.classList.add('hidden');
            }
        });

        document.getElementById('clearSearchBtn').addEventListener('click', () => {
            document.getElementById('searchInput').value = '';
            document.getElementById('clearSearchBtn').classList.add('hidden');
            this.handleSearch('');
        });

        // ページネーション
        document.getElementById('prevPageBtn').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadMembers();
            }
        });

        document.getElementById('nextPageBtn').addEventListener('click', () => {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
                this.loadMembers();
            }
        });

        // CSVエクスポートボタン
        const csvExportBtn = document.getElementById('csvExportBtn');
        if (csvExportBtn) {
            csvExportBtn.addEventListener('click', () => {
                this.exportCsv();
            });
        }

        // 同期ボタン（管理者のみ）
        const syncBtn = document.getElementById('syncBtn');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => {
                this.syncFromShopify();
            });
        }

        // 通知モーダル
        document.getElementById('closeNotifyDialog').addEventListener('click', () => {
            this.closeNotifyDialog();
        });
        document.getElementById('cancelNotifyBtn').addEventListener('click', () => {
            this.closeNotifyDialog();
        });
        document.getElementById('sendNotifyBtn').addEventListener('click', () => {
            this.sendNotification();
        });
        document.getElementById('notifyDialog').addEventListener('click', (e) => {
            if (e.target.id === 'notifyDialog') {
                this.closeNotifyDialog();
            }
        });

        // ログアウト
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });
    }

    async loadMembers() {
        try {
            const params = new URLSearchParams({
                page: this.currentPage,
                limit: this.limit,
                sortBy: this.currentSort.column,
                sortOrder: this.currentSort.direction,
                ...this.currentFilters
            });

            const response = await authFetch(`${this.apiUrl}?${params}`);
            const result = await response.json();

            if (result.success) {
                this.displayMembers(result.data);
                this.updatePagination(result);
            } else {
                this.showNotification('データの読み込みに失敗しました', 'error');
            }
        } catch (error) {
            console.error('Members loading failed:', error);
            this.showNotification('エラーが発生しました', 'error');
        }
    }

    displayMembers(members) {
        const container = document.getElementById('membersTableContainer');

        if (members.length === 0) {
            container.innerHTML = '<div class="no-data">FWJ会員検索が見つかりません</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'data-table';

        // ヘッダー作成
        const headerRow = document.createElement('tr');
        const headers = [
            { key: '_actions', label: '操作' },
            { key: 'shopify_id', label: 'Shopify ID' },
            { key: 'email', label: 'メールアドレス' },
            { key: 'first_name', label: '名' },
            { key: 'last_name', label: '姓' },
            { key: 'phone', label: '電話番号' },
            { key: 'city', label: '都市' },
            { key: 'province', label: '都道府県' },
            { key: 'fwj_card_no', label: 'FWJカード番号' },
            { key: 'fwj_firstname', label: 'FWJ名' },
            { key: 'fwj_lastname', label: 'FWJ姓' },
            { key: 'fwj_kanafirstname', label: 'FWJ名カナ' },
            { key: 'fwj_kanalastname', label: 'FWJ姓カナ' },
            { key: 'fwj_birthday', label: '生年月日' },
            { key: 'fwj_sex', label: '性別' },
            { key: 'fwj_nationality', label: '国籍' },
            { key: 'fwj_height', label: '身長' },
            { key: 'fwj_weight', label: '体重' },
            { key: 'fwj_effectivedate', label: '有効期限' },
            { key: 'created_at', label: '登録日' }
        ];

        headers.forEach(header => {
            const th = document.createElement('th');
            if (header.key !== '_actions') {
                th.className = 'sortable';
                th.setAttribute('data-column', header.key);
                th.innerHTML = `${header.label}${this.getSortIcon(header.key)}`;
                th.addEventListener('click', () => this.sortBy(header.key));
            } else {
                th.className = 'actions-header';
                th.textContent = header.label;
            }
            headerRow.appendChild(th);
        });

        table.appendChild(headerRow);

        // データ行作成
        members.forEach(member => {
            const row = document.createElement('tr');

            headers.forEach(header => {
                const td = document.createElement('td');

                if (header.key === '_actions') {
                    if (this.isAdmin && member.shopify_id && member.has_push_subscription) {
                        const actionsDiv = document.createElement('div');
                        actionsDiv.className = 'row-actions';

                        const notifyBtn = document.createElement('button');
                        notifyBtn.className = 'btn-small btn-notify';
                        notifyBtn.textContent = '通知';
                        notifyBtn.addEventListener('click', () => this.openNotifyDialog(member));

                        actionsDiv.appendChild(notifyBtn);
                        td.appendChild(actionsDiv);
                    }
                } else if (header.key === 'created_at' && member[header.key]) {
                    // 日付のフォーマット
                    const date = new Date(member[header.key]);
                    td.textContent = date.toLocaleDateString('ja-JP');
                } else {
                    td.textContent = member[header.key] || '';
                }

                row.appendChild(td);
            });

            table.appendChild(row);
        });

        container.innerHTML = '';
        container.appendChild(table);

        // 列幅リサイズ機能を初期化
        if (window.ColumnResize) {
            ColumnResize.init(table, 'members-column-widths');
        }

        // ソート機能を初期化
        if (window.TableSort) {
            TableSort.init(table);
        }
    }

    getSortIcon(column) {
        if (this.currentSort.column === column) {
            return this.currentSort.direction === 'asc' ? ' ↑' : ' ↓';
        }
        return '';
    }

    sortBy(column) {
        if (this.currentSort.column === column) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.column = column;
            this.currentSort.direction = 'asc';
        }
        this.currentPage = 1;
        this.loadMembers();
    }

    updatePagination(result) {
        this.currentPage = result.page;
        this.totalPages = result.totalPages;
        this.total = result.total;

        document.getElementById('pageInfo').textContent =
            `ページ ${result.page} / ${result.totalPages} (全 ${result.total} 件)`;

        document.getElementById('prevPageBtn').disabled = result.page <= 1;
        document.getElementById('nextPageBtn').disabled = result.page >= result.totalPages;

        document.getElementById('pagination').classList.remove('hidden');
    }

    handleSearch(searchTerm) {
        if (searchTerm.trim()) {
            this.currentFilters.search = searchTerm;
        } else {
            delete this.currentFilters.search;
        }
        this.currentPage = 1;
        this.loadMembers();
    }

    async exportCsv() {
        const csvExportBtn = document.getElementById('csvExportBtn');
        const originalText = csvExportBtn.textContent;

        try {
            csvExportBtn.disabled = true;
            csvExportBtn.textContent = 'エクスポート中...';

            const params = new URLSearchParams();
            if (this.currentFilters.search) {
                params.set('search', this.currentFilters.search);
            }

            const response = await authFetch(`${this.apiUrl}/export?${params}`);
            const result = await response.json();

            if (result.success) {
                this.downloadCsv(result.data, result.filename);
                this.showNotification(`${result.data.length}件のデータをエクスポートしました`, 'success');
            } else {
                this.showNotification(result.error || 'エクスポートに失敗しました', 'error');
            }
        } catch (error) {
            console.error('CSV export error:', error);
            this.showNotification('エクスポート中にエラーが発生しました', 'error');
        } finally {
            csvExportBtn.disabled = false;
            csvExportBtn.textContent = originalText;
        }
    }

    downloadCsv(data, filename) {
        if (!data || data.length === 0) return;

        const headers = Object.keys(data[0]);

        // CSV生成（BOM付きUTF-8）
        const csvContent = [
            headers.join(','),
            ...data.map(row => {
                return headers.map(header => {
                    let value = row[header];
                    if (Array.isArray(value)) {
                        value = value.join(';');
                    }
                    if (value === null || value === undefined) {
                        value = '';
                    }
                    value = String(value);
                    if (value.includes(',') || value.includes('\n') || value.includes('"')) {
                        value = '"' + value.replace(/"/g, '""') + '"';
                    }
                    return value;
                }).join(',');
            })
        ].join('\n');

        // BOM付きでBlobを作成
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });

        // ダウンロード
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }

    async syncFromShopify() {
        if (!this.isAdmin) {
            this.showNotification('管理者権限が必要です', 'error');
            return;
        }

        const syncBtn = document.getElementById('syncBtn');
        const originalText = syncBtn.textContent;

        try {
            syncBtn.disabled = true;
            syncBtn.textContent = '同期中...';

            const response = await authFetch(`${this.apiUrl}/sync`, {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification(result.message, 'success');
                await this.loadMembers();
            } else {
                this.showNotification(result.error || '同期に失敗しました', 'error');
            }
        } catch (error) {
            console.error('Sync failed:', error);
            this.showNotification('同期中にエラーが発生しました', 'error');
        } finally {
            syncBtn.disabled = false;
            syncBtn.textContent = originalText;
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

    openNotifyDialog(member) {
        this.notifyingMember = member;
        const info = document.getElementById('notifyMemberInfo');
        const name = [member.last_name, member.first_name].filter(Boolean).join(' ') || '名前なし';
        info.innerHTML = `<strong>送信先:</strong> ${name}${member.email ? ` (${member.email})` : ''}`;

        document.getElementById('notifyForm').reset();
        document.getElementById('notifyDialog').classList.remove('hidden');
    }

    closeNotifyDialog() {
        document.getElementById('notifyDialog').classList.add('hidden');
        this.notifyingMember = null;
    }

    async sendNotification() {
        const title = document.getElementById('notifyTitle').value.trim();
        const body = document.getElementById('notifyBody').value.trim();
        const url = document.getElementById('notifyUrl').value.trim();

        if (!title || !body) {
            this.showNotification('タイトルと本文は必須です', 'error');
            return;
        }

        const sendBtn = document.getElementById('sendNotifyBtn');
        const originalText = sendBtn.textContent;

        try {
            sendBtn.disabled = true;
            sendBtn.textContent = '送信中...';

            const payload = { title, body };
            if (url) payload.url = url;

            const response = await authFetch(`${this.apiUrl}/${this.notifyingMember.shopify_id}/notify`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('通知を送信しました', 'success');
                this.closeNotifyDialog();
            } else {
                this.showNotification(result.error || '通知の送信に失敗しました', 'error');
            }
        } catch (error) {
            console.error('Notification send failed:', error);
            this.showNotification('通知の送信中にエラーが発生しました', 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = originalText;
        }
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
const membersManager = new MembersManager();
