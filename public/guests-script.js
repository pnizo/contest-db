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

class GuestsManager {
    constructor() {
        this.apiUrl = '/api/guests';
        this.currentUser = null;
        this.isAdmin = false;
        this.currentPage = 1;
        this.limit = 50;
        this.totalPages = 0;
        this.total = 0;
        this.currentFilters = {};
        this.currentSort = {
            column: 'contest_name',
            direction: 'asc'
        };
        this.editingGuest = null;
        this.deletingGuest = null;
        this.contestsMap = new Map(); // 大会名 -> 開催日のマッピング
        this.init();
    }

    async init() {
        await this.checkAuthStatus();
        this.bindEvents();
        if (this.currentUser) {
            setTimeout(async () => {
                await this.loadFilterOptions();
                await this.loadGuests();
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
        // フィルター関連
        document.getElementById('applyFiltersBtn').addEventListener('click', () => {
            this.applyFilters();
        });

        document.getElementById('clearFiltersBtn').addEventListener('click', () => {
            this.clearFilters();
        });

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
                this.loadGuests();
            }
        });

        document.getElementById('nextPageBtn').addEventListener('click', () => {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
                this.loadGuests();
            }
        });

        // ログアウト
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // 新規追加ボタン
        document.getElementById('addNewBtn').addEventListener('click', () => {
            this.openAddDialog();
        });

        // 編集ダイアログ関連
        document.getElementById('closeEditDialog').addEventListener('click', () => {
            this.closeEditDialog();
        });
        document.getElementById('cancelEditBtn').addEventListener('click', () => {
            this.closeEditDialog();
        });
        document.getElementById('editForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveGuest();
        });

        // 削除ダイアログ関連
        document.getElementById('closeDeleteDialog').addEventListener('click', () => {
            this.closeDeleteDialog();
        });
        document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
            this.closeDeleteDialog();
        });
        document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
            this.deleteGuest();
        });

        // 大会名選択時に開催日を自動設定
        document.getElementById('edit_contest_name').addEventListener('change', (e) => {
            this.updateContestDate(e.target.value);
        });

        // モーダル外クリックで閉じる
        document.getElementById('editDialog').addEventListener('click', (e) => {
            if (e.target.id === 'editDialog') {
                this.closeEditDialog();
            }
        });
        document.getElementById('deleteDialog').addEventListener('click', (e) => {
            if (e.target.id === 'deleteDialog') {
                this.closeDeleteDialog();
            }
        });
    }

    async loadFilterOptions() {
        try {
            const response = await authFetch(`${this.apiUrl}/filter-options`);
            const result = await response.json();

            if (result.success) {
                const { contestNames, organizationTypes, passTypes } = result.data;

                // 大会名を保存（編集ダイアログで使用）
                this.contestNames = contestNames;

                // Contestsテーブルから大会情報を取得してマッピングを作成
                await this.loadContests();

                this.populateFilterSelect('contestFilter', contestNames);
                this.populateFilterSelect('organizationTypeFilter', organizationTypes);
                this.populateFilterSelect('passTypeFilter', passTypes);

                // 絞り込み条件は初期値では何もセットしない
            }
        } catch (error) {
            console.error('Filter options loading failed:', error);
        }
    }

    // Contestsテーブルから大会情報を取得
    async loadContests() {
        try {
            const response = await authFetch('/api/contests');
            const result = await response.json();

            if (result.success && result.data) {
                // 大会名 -> 開催日のマッピングを作成
                this.contestsMap.clear();
                result.data.forEach(contest => {
                    if (contest.contest_name && contest.contest_date) {
                        // 同じ大会名で複数の開催日がある場合、最新を保持
                        if (!this.contestsMap.has(contest.contest_name) ||
                            new Date(contest.contest_date) > new Date(this.contestsMap.get(contest.contest_name))) {
                            this.contestsMap.set(contest.contest_name, contest.contest_date);
                        }
                    }
                });
            }
        } catch (error) {
            console.error('Contests loading failed:', error);
        }
    }

    // 大会名選択時に開催日を自動設定
    updateContestDate(contestName) {
        const contestDateInput = document.getElementById('edit_contest_date');
        if (contestName && this.contestsMap.has(contestName)) {
            contestDateInput.value = this.contestsMap.get(contestName);
        } else {
            contestDateInput.value = '';
        }
    }

    populateFilterSelect(selectId, options) {
        const select = document.getElementById(selectId);
        const currentValue = select.value;

        select.innerHTML = select.querySelector('option').outerHTML;

        options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option;
            optionElement.textContent = option;
            select.appendChild(optionElement);
        });

        if (currentValue && options.includes(currentValue)) {
            select.value = currentValue;
        }
    }

    async loadGuests() {
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
                this.displayGuests(result.data);
                this.updatePagination(result);
            } else {
                this.showNotification('データの読み込みに失敗しました', 'error');
            }
        } catch (error) {
            console.error('Guests loading failed:', error);
            this.showNotification('エラーが発生しました', 'error');
        }
    }

    displayGuests(guests) {
        const container = document.getElementById('guestsTableContainer');

        if (guests.length === 0) {
            container.innerHTML = '<div class="no-data">関係者チケットが見つかりません</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'data-table';

        // ヘッダー作成
        const headerRow = document.createElement('tr');
        const headers = [
            { key: 'contest_date', label: '開催日' },
            { key: 'contest_name', label: '大会名' },
            { key: 'ticket_type', label: 'チケット種別' },
            { key: 'group_type', label: '団体/個人' },
            { key: 'name_ja', label: '代表者氏名' },
            { key: 'pass_type', label: '付与パス' },
            { key: 'company_ja', label: '団体名（企業名）' },
            { key: 'request_type', label: '申請種別' },
            { key: 'ticket_count', label: '合計付与枚数' },
            { key: 'is_checked_in', label: 'Check-In' },
            { key: 'note', label: '備考欄' },
            { key: 'email', label: '連絡先メールアドレス' },
            { key: 'phone', label: '緊急電話番号' },
            { key: 'contact_person', label: '社内担当者名' },
            { key: 'is_pre_notified', label: '事前案内メール' },
            { key: 'is_post_mailed', label: '開催後メール' },
            { key: '_actions', label: '操作' }
        ];

        headers.forEach(header => {
            const th = document.createElement('th');
            if (header.key !== '_actions') {
                th.className = 'sortable';
                th.setAttribute('data-column', header.key);
                th.innerHTML = `${header.label}${this.getSortIcon(header.key)}`;
                th.addEventListener('click', () => this.sortBy(header.key));
            } else {
                th.textContent = header.label;
                th.className = 'actions-header';
            }
            headerRow.appendChild(th);
        });

        table.appendChild(headerRow);

        // データ行作成
        guests.forEach(guest => {
            const row = document.createElement('tr');

            headers.forEach(header => {
                const td = document.createElement('td');

                if (header.key === '_actions') {
                    // 操作ボタン
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'row-actions';

                    const editBtn = document.createElement('button');
                    editBtn.className = 'btn-small btn-edit';
                    editBtn.textContent = '編集';
                    editBtn.addEventListener('click', () => this.openEditDialog(guest));

                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'btn-small btn-delete';
                    deleteBtn.textContent = '削除';
                    deleteBtn.addEventListener('click', () => this.openDeleteDialog(guest));

                    actionsDiv.appendChild(editBtn);
                    actionsDiv.appendChild(deleteBtn);
                    td.appendChild(actionsDiv);
                } else {
                    let value = guest[header.key] || '';

                    // Boolean型フィールドはチェックボックスとして表示
                    if (header.key === 'is_pre_notified' || header.key === 'is_checked_in' || header.key === 'is_post_mailed') {
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.checked = value === 'TRUE' || value === true || value === '○';

                        // is_checked_inのみ編集可能
                        if (header.key === 'is_checked_in') {
                            checkbox.style.cursor = 'pointer';
                            checkbox.addEventListener('change', async (e) => {
                                await this.updateBooleanField(guest, header.key, e.target.checked);
                            });
                        } else {
                            // is_pre_notifiedとis_post_mailedは読み取り専用（グレーアウト）
                            checkbox.disabled = true;
                            checkbox.style.cursor = 'default';
                        }

                        td.appendChild(checkbox);
                        td.style.textAlign = 'center';
                    } else {
                        td.textContent = value;
                    }
                }
                row.appendChild(td);
            });

            table.appendChild(row);
        });

        container.innerHTML = '';
        container.appendChild(table);
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
        this.loadGuests();
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

    applyFilters() {
        this.currentFilters = {
            contest_name: document.getElementById('contestFilter').value,
            organization_type: document.getElementById('organizationTypeFilter').value,
            pass_type: document.getElementById('passTypeFilter').value
        };

        // 空の値を削除
        Object.keys(this.currentFilters).forEach(key => {
            if (!this.currentFilters[key]) {
                delete this.currentFilters[key];
            }
        });

        this.currentPage = 1;
        this.loadGuests();
    }

    clearFilters() {
        document.getElementById('contestFilter').value = '';
        document.getElementById('organizationTypeFilter').value = '';
        document.getElementById('passTypeFilter').value = '';
        document.getElementById('searchInput').value = '';
        document.getElementById('clearSearchBtn').classList.add('hidden');

        this.currentFilters = {};
        this.currentPage = 1;
        this.loadGuests();
    }

    handleSearch(searchTerm) {
        if (searchTerm.trim()) {
            this.currentFilters.search = searchTerm;
        } else {
            delete this.currentFilters.search;
        }
        this.currentPage = 1;
        this.loadGuests();
    }

    // 編集ダイアログの大会名セレクトを更新
    populateEditContestSelect(selectedValue = '') {
        const select = document.getElementById('edit_contest_name');

        // 既存のオプションをクリア（最初のデフォルトオプション以外）
        select.innerHTML = '<option value="">大会名を選択</option>';

        // 大会名オプションを追加
        if (this.contestNames && this.contestNames.length > 0) {
            this.contestNames.forEach(contestName => {
                const option = document.createElement('option');
                option.value = contestName;
                option.textContent = contestName;
                select.appendChild(option);
            });
        }

        // 選択値を設定
        if (selectedValue) {
            select.value = selectedValue;
        }
    }

    // 新規追加ダイアログを開く
    openAddDialog() {
        this.editingGuest = null;
        document.getElementById('editDialogTitle').textContent = '関係者チケットを新規追加';
        document.getElementById('editForm').reset();

        // 大会名セレクトを更新
        this.populateEditContestSelect();

        document.getElementById('editDialog').classList.remove('hidden');
    }

    // 編集ダイアログを開く
    openEditDialog(guest) {
        this.editingGuest = guest;
        document.getElementById('editDialogTitle').textContent = '関係者チケットを編集';

        // 大会名セレクトを更新
        this.populateEditContestSelect(guest.contest_name || '');

        // フォームにデータを設定
        document.getElementById('edit_contest_date').value = guest.contest_date || '';
        document.getElementById('edit_ticket_type').value = guest.ticket_type || '';
        document.getElementById('edit_group_type').value = guest.group_type || '';
        document.getElementById('edit_pass_type').value = guest.pass_type || '';
        document.getElementById('edit_name_ja').value = guest.name_ja || '';
        document.getElementById('edit_company_ja').value = guest.company_ja || '';
        document.getElementById('edit_email').value = guest.email || '';
        document.getElementById('edit_phone').value = guest.phone || '';
        document.getElementById('edit_contact_person').value = guest.contact_person || '';
        document.getElementById('edit_request_type').value = guest.request_type || '';
        document.getElementById('edit_ticket_count').value = guest.ticket_count || '';
        document.getElementById('edit_is_pre_notified').checked = guest.is_pre_notified === 'TRUE' || guest.is_pre_notified === true;
        document.getElementById('edit_is_checked_in').checked = guest.is_checked_in === 'TRUE' || guest.is_checked_in === true;
        document.getElementById('edit_is_post_mailed').checked = guest.is_post_mailed === 'TRUE' || guest.is_post_mailed === true;
        document.getElementById('edit_note').value = guest.note || '';

        document.getElementById('editDialog').classList.remove('hidden');
    }

    // 編集ダイアログを閉じる
    closeEditDialog() {
        document.getElementById('editDialog').classList.add('hidden');
        this.editingGuest = null;
    }

    // ゲストを保存（新規追加または更新）
    async saveGuest() {
        const guestData = {
            contest_date: document.getElementById('edit_contest_date').value,
            contest_name: document.getElementById('edit_contest_name').value,
            ticket_type: document.getElementById('edit_ticket_type').value,
            group_type: document.getElementById('edit_group_type').value,
            pass_type: document.getElementById('edit_pass_type').value,
            name_ja: document.getElementById('edit_name_ja').value,
            company_ja: document.getElementById('edit_company_ja').value,
            email: document.getElementById('edit_email').value,
            phone: document.getElementById('edit_phone').value,
            contact_person: document.getElementById('edit_contact_person').value,
            request_type: document.getElementById('edit_request_type').value,
            ticket_count: document.getElementById('edit_ticket_count').value,
            is_pre_notified: document.getElementById('edit_is_pre_notified').checked ? 'TRUE' : 'FALSE',
            is_checked_in: document.getElementById('edit_is_checked_in').checked ? 'TRUE' : 'FALSE',
            is_post_mailed: document.getElementById('edit_is_post_mailed').checked ? 'TRUE' : 'FALSE',
            note: document.getElementById('edit_note').value
        };

        try {
            let response;
            if (this.editingGuest) {
                // 更新
                response = await authFetch(`${this.apiUrl}/${this.editingGuest._rowIndex}`, {
                    method: 'PUT',
                    body: JSON.stringify(guestData)
                });
            } else {
                // 新規追加
                response = await authFetch(this.apiUrl, {
                    method: 'POST',
                    body: JSON.stringify(guestData)
                });
            }

            const result = await response.json();

            if (result.success) {
                this.showNotification(this.editingGuest ? '更新しました' : '追加しました', 'success');
                this.closeEditDialog();
                await this.loadGuests();
                await this.loadFilterOptions();
            } else {
                this.showNotification(result.error || '保存に失敗しました', 'error');
            }
        } catch (error) {
            console.error('Save guest failed:', error);
            this.showNotification('エラーが発生しました', 'error');
        }
    }

    // 削除確認ダイアログを開く
    openDeleteDialog(guest) {
        this.deletingGuest = guest;
        document.getElementById('deleteTargetName').textContent = guest.name_ja || '';
        document.getElementById('deleteTargetCompany').textContent = guest.company_ja || '(なし)';
        document.getElementById('deleteDialog').classList.remove('hidden');
    }

    // 削除確認ダイアログを閉じる
    closeDeleteDialog() {
        document.getElementById('deleteDialog').classList.add('hidden');
        this.deletingGuest = null;
    }

    // ゲストを削除
    async deleteGuest() {
        if (!this.deletingGuest) return;

        try {
            const response = await authFetch(`${this.apiUrl}/${this.deletingGuest._rowIndex}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('削除しました', 'success');
                this.closeDeleteDialog();
                await this.loadGuests();
                await this.loadFilterOptions();
            } else {
                this.showNotification(result.error || '削除に失敗しました', 'error');
            }
        } catch (error) {
            console.error('Delete guest failed:', error);
            this.showNotification('エラーが発生しました', 'error');
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

    // Boolean型フィールドを更新（is_checked_inのみ）
    async updateBooleanField(guest, fieldName, newValue) {
        try {
            // 元の値を保存（エラー時に復元するため）
            const originalValue = guest[fieldName];

            // UIを即座に更新
            guest[fieldName] = newValue ? 'TRUE' : 'FALSE';

            // サーバーに更新リクエストを送信
            const guestData = {
                'contest_name': guest['contest_name'],
                'group_type': guest['group_type'],
                'pass_type': guest['pass_type'],
                'name_ja': guest['name_ja'],
                'company_ja': guest['company_ja'],
                'email': guest['email'],
                'phone': guest['phone'],
                'contact_person': guest['contact_person'],
                'request_type': guest['request_type'],
                'ticket_count': guest['ticket_count'],
                'is_pre_notified': guest['is_pre_notified'],
                'is_checked_in': guest['is_checked_in'],
                'is_post_mailed': guest['is_post_mailed'],
                'note': guest['note']
            };

            const response = await authFetch(`${this.apiUrl}/${guest._rowIndex}`, {
                method: 'PUT',
                body: JSON.stringify(guestData)
            });

            const result = await response.json();

            if (!result.success) {
                // エラーの場合、元の値に戻す
                guest[fieldName] = originalValue;
                this.showNotification(result.error || '更新に失敗しました', 'error');
                // 表示を再読み込み
                await this.loadGuests();
            } else {
                this.showNotification(`Check-Inを更新しました`, 'success');
            }
        } catch (error) {
            console.error('Update boolean field failed:', error);
            this.showNotification('エラーが発生しました', 'error');
            // エラーが発生した場合、表示を再読み込み
            await this.loadGuests();
        }
    }
}

// 初期化
const guestsManager = new GuestsManager();
