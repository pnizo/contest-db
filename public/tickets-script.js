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

class TicketsManager {
    constructor() {
        this.apiUrl = '/api/tickets';
        this.currentUser = null;
        this.isAdmin = false;
        this.currentPage = 1;
        this.limit = 50;
        this.totalPages = 0;
        this.total = 0;
        this.currentFilters = {};
        this.currentSort = {
            column: 'order_date',
            direction: 'desc'
        };
        this.init();
    }

    async init() {
        await this.checkAuthStatus();
        this.bindEvents();
        if (this.currentUser) {
            setTimeout(async () => {
                await this.loadFilterOptions();
                // 初期状態は全件表示（有効のみフィルターなし）
                await this.loadTickets();
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
            this.currentFilters.search = document.getElementById('searchInput').value.trim();
            this.currentPage = 1;
            this.loadTickets();
        });

        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.currentFilters.search = e.target.value.trim();
                this.currentPage = 1;
                this.loadTickets();
            }
        });

        // 検索クリアボタン
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        const searchInput = document.getElementById('searchInput');

        searchInput.addEventListener('input', () => {
            clearSearchBtn.classList.toggle('hidden', !searchInput.value);
        });

        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearSearchBtn.classList.add('hidden');
            this.currentFilters.search = '';
            this.currentPage = 1;
            this.loadTickets();
        });

        // フィルター適用
        document.getElementById('applyFiltersBtn').addEventListener('click', () => {
            this.applyFilters();
        });

        // フィルタークリア
        document.getElementById('clearFiltersBtn').addEventListener('click', () => {
            this.clearFilters();
        });

        // ページネーション
        document.getElementById('prevPageBtn').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadTickets();
            }
        });

        document.getElementById('nextPageBtn').addEventListener('click', () => {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
                this.loadTickets();
            }
        });

        // インポートボタン
        const importBtn = document.getElementById('importBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                this.openImportModal();
            });
        }

        // インポート実行ボタン
        document.getElementById('executeImportBtn').addEventListener('click', () => {
            this.executeImport();
        });

        // 編集保存ボタン
        document.getElementById('saveEditBtn').addEventListener('click', () => {
            this.saveEdit();
        });

        // 削除確認ボタン
        document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
            this.confirmDelete();
        });

        // ログアウト
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });
    }

    async loadFilterOptions() {
        try {
            const response = await authFetch(`${this.apiUrl}/filter-options`);
            const result = await response.json();

            if (result.success && result.data) {
                // 商品名フィルター
                const productFilter = document.getElementById('productFilter');
                productFilter.innerHTML = '<option value="">商品名を選択</option>';
                result.data.productNames.forEach(name => {
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = name;
                    productFilter.appendChild(option);
                });

                // 支払いステータスフィルター
                const financialStatusFilter = document.getElementById('financialStatusFilter');
                financialStatusFilter.innerHTML = '<option value="">支払いステータス</option>';
                result.data.financialStatuses.forEach(status => {
                    const option = document.createElement('option');
                    option.value = status;
                    option.textContent = status;
                    financialStatusFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Filter options loading failed:', error);
        }
    }

    async loadTickets() {
        const container = document.getElementById('ticketsTableContainer');
        container.innerHTML = '<div class="loading">読み込み中...</div>';

        try {
            const params = new URLSearchParams({
                page: this.currentPage,
                limit: this.limit,
                sortBy: this.currentSort.column,
                sortOrder: this.currentSort.direction
            });

            // フィルターを追加
            Object.keys(this.currentFilters).forEach(key => {
                if (this.currentFilters[key]) {
                    params.append(key, this.currentFilters[key]);
                }
            });

            const response = await authFetch(`${this.apiUrl}?${params.toString()}`);
            const result = await response.json();

            if (result.success) {
                this.totalPages = result.totalPages;
                this.total = result.total;
                this.displayTickets(result.data);
                this.updatePagination();
            } else {
                container.innerHTML = `<div class="no-data">エラー: ${result.error}</div>`;
            }
        } catch (error) {
            console.error('Tickets loading failed:', error);
            container.innerHTML = `<div class="no-data">読み込みに失敗しました: ${error.message}</div>`;
        }
    }

    displayTickets(tickets) {
        const container = document.getElementById('ticketsTableContainer');

        if (!tickets || tickets.length === 0) {
            container.innerHTML = '<div class="no-data">データがありません</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'data-table';

        // ヘッダー行を作成
        const headerRow = document.createElement('tr');
        const columns = [
            { key: 'is_usable', label: '有効', sortable: true },
            { key: 'order_no', label: '注文番号', sortable: true },
            { key: 'order_date', label: '注文日時', sortable: true },
            { key: 'full_name', label: '購入者名', sortable: true },
            { key: 'shopify_id', label: '購入者ID', sortable: true },
            { key: 'email', label: 'メール', sortable: true },
            { key: 'product_name', label: '商品名', sortable: true },
            { key: 'variant', label: 'バリエーション', sortable: false },
            { key: 'color', label: 'カラー', sortable: false },
            { key: 'item_sub_no', label: '枝番', sortable: true },
            { key: 'price', label: '単価', sortable: true },
            { key: 'financial_status', label: '支払い', sortable: true },
            { key: 'owner_shopify_id', label: '所有者ID', sortable: true },
            { key: 'reserved_seat', label: '座席番号', sortable: true },
            { key: 'used_at', label: '使用日時', sortable: true }
        ];

        // 管理者の場合は操作列を追加
        if (this.isAdmin) {
            columns.push({ key: 'actions', label: '操作', sortable: false });
        }

        columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col.label;
            if (col.sortable) {
                th.classList.add('sortable');
                th.dataset.column = col.key;
                if (this.currentSort.column === col.key) {
                    th.classList.add('sorted');
                    th.classList.add(this.currentSort.direction);
                }
                th.addEventListener('click', () => this.handleSort(col.key));
            }
            headerRow.appendChild(th);
        });
        table.appendChild(headerRow);

        // データ行を作成
        tickets.forEach(ticket => {
            const tr = document.createElement('tr');
            
            // 有効/無効に応じて背景色を設定
            if (ticket.is_usable === 'TRUE') {
                tr.style.backgroundColor = '#e8f5e9'; // 薄い緑
            } else {
                tr.style.backgroundColor = '#ffebee'; // 薄い赤
            }

            columns.forEach(col => {
                const td = document.createElement('td');

                if (col.key === 'actions') {
                    // 操作ボタン
                    const editBtn = document.createElement('button');
                    editBtn.className = 'action-btn small';
                    editBtn.textContent = '編集';
                    editBtn.addEventListener('click', () => this.openEditModal(ticket));

                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'action-btn small danger';
                    deleteBtn.textContent = '削除';
                    deleteBtn.addEventListener('click', () => this.openDeleteModal(ticket));

                    td.appendChild(editBtn);
                    td.appendChild(document.createTextNode(' '));
                    td.appendChild(deleteBtn);
                } else if (col.key === 'is_usable') {
                    // 有効/無効の表示（グレーアウトのチェックボックス）
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = ticket[col.key] === 'TRUE';
                    checkbox.disabled = true;
                    checkbox.style.cursor = 'not-allowed';
                    td.style.textAlign = 'center';
                    td.appendChild(checkbox);
                } else if (col.key === 'price') {
                    // 価格フォーマット
                    const value = ticket[col.key];
                    td.textContent = value ? `¥${Number(value).toLocaleString()}` : '';
                } else {
                    td.textContent = ticket[col.key] || '';
                }

                tr.appendChild(td);
            });

            table.appendChild(tr);
        });

        container.innerHTML = '';
        container.appendChild(table);

        // 列幅リサイズ機能を初期化
        if (window.ColumnResize) {
            ColumnResize.init(table, 'tickets-column-widths');
        }

        // ソート機能を初期化
        if (window.TableSort) {
            TableSort.init(table);
        }
    }

    handleSort(column) {
        if (this.currentSort.column === column) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.column = column;
            this.currentSort.direction = 'desc';
        }
        this.currentPage = 1;
        this.loadTickets();
    }

    updatePagination() {
        const pagination = document.getElementById('pagination');
        const pageInfo = document.getElementById('pageInfo');
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');

        if (this.total > 0) {
            pagination.classList.remove('hidden');
            pageInfo.textContent = `ページ ${this.currentPage} / ${this.totalPages} (全 ${this.total} 件)`;
            prevBtn.disabled = this.currentPage <= 1;
            nextBtn.disabled = this.currentPage >= this.totalPages;
        } else {
            pagination.classList.add('hidden');
        }
    }

    applyFilters() {
        this.currentFilters.product_name = document.getElementById('productFilter').value;
        this.currentFilters.financial_status = document.getElementById('financialStatusFilter').value;
        this.currentFilters.shopify_id_filter = document.getElementById('shopifyIdFilter').value.trim();
        this.currentFilters.valid_only = document.getElementById('validOnlyFilter').checked ? 'true' : '';
        this.currentPage = 1;
        this.loadTickets();
    }

    clearFilters() {
        document.getElementById('productFilter').value = '';
        document.getElementById('financialStatusFilter').value = '';
        document.getElementById('shopifyIdFilter').value = '';
        document.getElementById('validOnlyFilter').checked = false;
        document.getElementById('searchInput').value = '';
        document.getElementById('clearSearchBtn').classList.add('hidden');
        this.currentFilters = {};
        this.currentPage = 1;
        this.loadTickets();
    }

    // ====== モーダル操作 ======

    openEditModal(ticket) {
        document.getElementById('editOrderNo').textContent = ticket.order_no || '';
        document.getElementById('editOrderDate').textContent = ticket.order_date || '';
        document.getElementById('editFullName').textContent = ticket.full_name || '';
        document.getElementById('editProductName').textContent = ticket.product_name || '';
        document.getElementById('editVariant').textContent = ticket.variant || '';
        document.getElementById('editIsUsable').checked = ticket.is_usable === 'TRUE';
        document.getElementById('editOwnerShopifyId').value = ticket.owner_shopify_id || '';
        document.getElementById('editReservedSeat').value = ticket.reserved_seat || '';
        document.getElementById('editRowIndex').value = ticket.id;
        document.getElementById('editModal').classList.remove('hidden');
    }

    closeEditModal() {
        document.getElementById('editModal').classList.add('hidden');
    }

    async saveEdit() {
        const rowIndex = document.getElementById('editRowIndex').value;
        const isUsable = document.getElementById('editIsUsable').checked ? 'TRUE' : 'FALSE';
        const ownerShopifyId = document.getElementById('editOwnerShopifyId').value.trim();
        const reservedSeat = document.getElementById('editReservedSeat').value.trim();

        const saveBtn = document.getElementById('saveEditBtn');
        const originalText = saveBtn.textContent;

        try {
            saveBtn.disabled = true;
            saveBtn.textContent = '保存中...';

            const response = await authFetch(`${this.apiUrl}/${rowIndex}`, {
                method: 'PUT',
                body: JSON.stringify({
                    is_usable: isUsable,
                    owner_shopify_id: ownerShopifyId,
                    reserved_seat: reservedSeat
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('チケットを更新しました', 'success');
                this.closeEditModal();
                this.loadTickets();
            } else {
                this.showNotification(result.error || '更新に失敗しました', 'error');
            }
        } catch (error) {
            console.error('Save edit error:', error);
            this.showNotification(`エラー: ${error.message}`, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    }

    openDeleteModal(ticket) {
        document.getElementById('deleteOrderNo').textContent = ticket.order_no || '';
        document.getElementById('deleteProductName').textContent = ticket.product_name || '';
        document.getElementById('deleteRowIndex').value = ticket.id;
        document.getElementById('deleteModal').classList.remove('hidden');
    }

    closeDeleteModal() {
        document.getElementById('deleteModal').classList.add('hidden');
    }

    async confirmDelete() {
        const rowIndex = document.getElementById('deleteRowIndex').value;
        const deleteBtn = document.getElementById('confirmDeleteBtn');
        const originalText = deleteBtn.textContent;

        try {
            deleteBtn.disabled = true;
            deleteBtn.textContent = '削除中...';

            const response = await authFetch(`${this.apiUrl}/${rowIndex}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('チケットを削除しました', 'success');
                this.closeDeleteModal();
                this.loadTickets();
            } else {
                this.showNotification(result.error || '削除に失敗しました', 'error');
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showNotification(`エラー: ${error.message}`, 'error');
        } finally {
            deleteBtn.disabled = false;
            deleteBtn.textContent = originalText;
        }
    }

    openImportModal() {
        document.getElementById('importProductType').value = '観戦チケット';
        document.getElementById('importMonthsAgo').value = '3';
        document.getElementById('importStatus').classList.add('hidden');
        document.getElementById('importModal').classList.remove('hidden');
    }

    closeImportModal() {
        document.getElementById('importModal').classList.add('hidden');
    }

    async executeImport() {
        const productType = document.getElementById('importProductType').value.trim();
        const monthsAgo = parseInt(document.getElementById('importMonthsAgo').value) || 3;

        if (!productType) {
            this.showNotification('商品タイプを入力してください', 'error');
            return;
        }

        const executeBtn = document.getElementById('executeImportBtn');
        const statusDiv = document.getElementById('importStatus');
        const originalText = executeBtn.textContent;

        try {
            executeBtn.disabled = true;
            executeBtn.textContent = 'インポート中...';
            statusDiv.classList.remove('hidden');
            statusDiv.className = 'import-status';
            statusDiv.textContent = 'Shopifyからデータを取得しています...';

            const response = await authFetch(`${this.apiUrl}/import`, {
                method: 'POST',
                body: JSON.stringify({ productType, monthsAgo })
            });

            const result = await response.json();

            if (result.success) {
                statusDiv.className = 'import-status success';
                statusDiv.textContent = result.message;
                this.showNotification(result.message, 'success');
                
                // 少し待ってからモーダルを閉じてデータをリロード
                setTimeout(() => {
                    this.closeImportModal();
                    this.loadFilterOptions();
                    this.loadTickets();
                }, 2000);
            } else {
                statusDiv.className = 'import-status error';
                statusDiv.textContent = `エラー: ${result.error}`;
                this.showNotification(result.error || 'インポートに失敗しました', 'error');
            }
        } catch (error) {
            console.error('Import error:', error);
            statusDiv.className = 'import-status error';
            statusDiv.textContent = `エラー: ${error.message}`;
            this.showNotification(`エラー: ${error.message}`, 'error');
        } finally {
            executeBtn.disabled = false;
            executeBtn.textContent = originalText;
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
const ticketsManager = new TicketsManager();
