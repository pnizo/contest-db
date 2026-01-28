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

class ContestsManager {
    constructor() {
        this.apiUrl = '/api/contests';
        this.currentUser = null;
        this.isAdmin = false;
        this.currentPage = 1;
        this.limit = 50;
        this.totalPages = 0;
        this.total = 0;
        this.currentFilters = {};
        this.currentSort = {
            column: 'contest_date',
            direction: 'desc'
        };
        this.editingContest = null;
        this.deletingContest = null;
        this.init();
    }

    async init() {
        await this.checkAuthStatus();
        this.bindEvents();
        if (this.currentUser) {
            setTimeout(async () => {
                await this.loadFilterOptions();
                await this.loadContests();
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
                this.loadContests();
            }
        });

        document.getElementById('nextPageBtn').addEventListener('click', () => {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
                this.loadContests();
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
            console.log('=== Form submit event triggered ===');
            e.preventDefault();
            console.log('Form default action prevented');
            this.saveContest();
        });

        // 削除ダイアログ関連
        document.getElementById('closeDeleteDialog').addEventListener('click', () => {
            this.closeDeleteDialog();
        });
        document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
            this.closeDeleteDialog();
        });
        document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
            this.deleteContest();
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
            const response = await authFetch(`${this.apiUrl}/places`);
            const result = await response.json();

            if (result.success) {
                this.populateFilterSelect('placeFilter', result.data);
            }
        } catch (error) {
            console.error('Filter options loading failed:', error);
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

    async loadContests() {
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
                this.displayContests(result.data);
                this.updatePagination(result);
            } else {
                this.showNotification('データの読み込みに失敗しました', 'error');
            }
        } catch (error) {
            console.error('Contests loading failed:', error);
            this.showNotification('エラーが発生しました', 'error');
        }
    }

    displayContests(contests) {
        const container = document.getElementById('contestsTableContainer');

        if (contests.length === 0) {
            container.innerHTML = '<div class="no-data">大会情報が見つかりません</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'data-table';

        // ヘッダー作成
        const headerRow = document.createElement('tr');
        const headers = [
            { key: 'contest_date', label: '開催日' },
            { key: 'contest_name', label: '大会名' },
            { key: 'contest_place', label: '開催地' },
            { key: 'is_ready', label: '公開' },
            { key: '_actions', label: '操作' }
        ];

        headers.forEach((header, index) => {
            const th = document.createElement('th');
            if (header.key === '_actions' || header.key === 'is_ready') {
                th.textContent = header.label;
                if (header.key === '_actions') {
                    th.className = 'actions-header';
                } else {
                    th.className = 'center-header';
                }
            } else {
                th.className = 'sortable';
                th.setAttribute('data-column', header.key);
                th.innerHTML = `${header.label}${this.getSortIcon(header.key)}`;
                th.addEventListener('click', (e) => {
                    // リサイズハンドルのクリックはソートしない
                    if (!e.target.classList.contains('resize-handle')) {
                        this.sortBy(header.key);
                    }
                });
            }

            // リサイズハンドルを追加（最後の列以外）
            if (index < headers.length - 1) {
                const resizeHandle = document.createElement('div');
                resizeHandle.className = 'resize-handle';
                resizeHandle.addEventListener('mousedown', (e) => this.initResize(e, th, table));
                th.appendChild(resizeHandle);
            }

            headerRow.appendChild(th);
        });

        table.appendChild(headerRow);

        // データ行作成
        contests.forEach(contest => {
            const row = document.createElement('tr');

            // is_readyに基づいて背景色クラスを設定
            const isReady = contest.is_ready;
            if (isReady === 'TRUE' || isReady === true || isReady === '○') {
                row.classList.add('contest-ready');
            } else {
                row.classList.add('contest-not-ready');
            }

            headers.forEach(header => {
                const td = document.createElement('td');

                if (header.key === '_actions') {
                    // 操作ボタン
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'row-actions';

                    const editBtn = document.createElement('button');
                    editBtn.className = 'btn-small btn-edit';
                    editBtn.textContent = '編集';
                    editBtn.addEventListener('click', () => this.openEditDialog(contest));

                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'btn-small btn-delete';
                    deleteBtn.textContent = '削除';
                    deleteBtn.addEventListener('click', () => this.openDeleteDialog(contest));

                    actionsDiv.appendChild(editBtn);
                    actionsDiv.appendChild(deleteBtn);
                    td.appendChild(actionsDiv);
                } else if (header.key === 'contest_date') {
                    // 日付のフォーマット
                    const dateValue = contest[header.key];
                    if (dateValue) {
                        const date = new Date(dateValue);
                        td.textContent = date.toLocaleDateString('ja-JP');
                    } else {
                        td.textContent = '';
                    }
                } else if (header.key === 'is_ready') {
                    // 公開チェックボックス（表示のみ）
                    td.className = 'center-cell';
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = isReady === 'TRUE' || isReady === true || isReady === '○';
                    checkbox.disabled = true;
                    td.appendChild(checkbox);
                } else {
                    td.textContent = contest[header.key] || '';
                }
                row.appendChild(td);
            });

            table.appendChild(row);
        });

        container.innerHTML = '';
        container.appendChild(table);

        // 列幅リサイズ機能を初期化
        if (window.ColumnResize) {
            ColumnResize.init(table, 'contests-column-widths');
        }

        // ソート機能を初期化
        if (window.TableSort) {
            TableSort.init(table);
        }

        // 保存された列幅を復元
        this.restoreColumnWidths(table);
    }

    // 列リサイズの初期化
    initResize(e, th, table) {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.pageX;
        const startWidth = th.offsetWidth;
        const resizeHandle = e.target;
        const columnIndex = Array.from(th.parentNode.children).indexOf(th);

        resizeHandle.classList.add('resizing');
        table.classList.add('resizing');

        const doResize = (e) => {
            const newWidth = startWidth + (e.pageX - startX);
            if (newWidth >= 50) { // 最小幅50px
                th.style.width = newWidth + 'px';
                th.style.minWidth = newWidth + 'px';
            }
        };

        const stopResize = () => {
            resizeHandle.classList.remove('resizing');
            table.classList.remove('resizing');
            document.removeEventListener('mousemove', doResize);
            document.removeEventListener('mouseup', stopResize);

            // 列幅をlocalStorageに保存
            this.saveColumnWidths(table);
        };

        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);
    }

    // 列幅をlocalStorageに保存
    saveColumnWidths(table) {
        const headers = table.querySelectorAll('th');
        const widths = {};
        headers.forEach((th, index) => {
            if (th.style.width) {
                widths[index] = th.style.width;
            }
        });
        localStorage.setItem('contestsColumnWidths', JSON.stringify(widths));
    }

    // 列幅をlocalStorageから復元
    restoreColumnWidths(table) {
        const savedWidths = localStorage.getItem('contestsColumnWidths');
        if (savedWidths) {
            try {
                const widths = JSON.parse(savedWidths);
                const headers = table.querySelectorAll('th');
                Object.keys(widths).forEach(index => {
                    const th = headers[parseInt(index)];
                    if (th) {
                        th.style.width = widths[index];
                        th.style.minWidth = widths[index];
                    }
                });
            } catch (e) {
                console.error('Failed to restore column widths:', e);
            }
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
        this.loadContests();
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
            contest_place: document.getElementById('placeFilter').value,
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value
        };

        // 空の値を削除
        Object.keys(this.currentFilters).forEach(key => {
            if (!this.currentFilters[key]) {
                delete this.currentFilters[key];
            }
        });

        // 日付範囲は両方必要
        if (this.currentFilters.startDate && !this.currentFilters.endDate) {
            delete this.currentFilters.startDate;
        }
        if (!this.currentFilters.startDate && this.currentFilters.endDate) {
            delete this.currentFilters.endDate;
        }

        this.currentPage = 1;
        this.loadContests();
    }

    clearFilters() {
        document.getElementById('placeFilter').value = '';
        document.getElementById('startDate').value = '';
        document.getElementById('endDate').value = '';
        document.getElementById('searchInput').value = '';
        document.getElementById('clearSearchBtn').classList.add('hidden');

        this.currentFilters = {};
        this.currentPage = 1;
        this.loadContests();
    }

    handleSearch(searchTerm) {
        if (searchTerm.trim()) {
            this.currentFilters.search = searchTerm;
        } else {
            delete this.currentFilters.search;
        }
        this.currentPage = 1;
        this.loadContests();
    }

    // 新規追加ダイアログを開く
    openAddDialog() {
        this.editingContest = null;
        document.getElementById('editDialogTitle').textContent = '大会情報を新規追加';
        document.getElementById('editForm').reset();
        document.getElementById('editDialog').classList.remove('hidden');
    }

    // 編集ダイアログを開く
    openEditDialog(contest) {
        this.editingContest = contest;
        document.getElementById('editDialogTitle').textContent = '大会情報を編集';

        // フォームにデータを設定
        document.getElementById('edit_contest_name').value = contest.contest_name || '';
        
        // 日付を正しいフォーマットに変換（タイムゾーンの影響を受けないように）
        if (contest.contest_date) {
            // 既にYYYY-MM-DD形式の場合はそのまま使用
            if (/^\d{4}-\d{2}-\d{2}$/.test(contest.contest_date)) {
                document.getElementById('edit_contest_date').value = contest.contest_date;
            } else {
                // それ以外の場合は、ローカルタイムゾーンで解析
                const date = new Date(contest.contest_date);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                document.getElementById('edit_contest_date').value = `${year}-${month}-${day}`;
            }
        } else {
            document.getElementById('edit_contest_date').value = '';
        }
        
        document.getElementById('edit_contest_place').value = contest.contest_place || '';

        // is_readyの設定（TRUE/true/'○'の場合にチェック）
        const isReady = contest.is_ready;
        document.getElementById('edit_is_ready').checked =
            isReady === 'TRUE' || isReady === true || isReady === '○';

        document.getElementById('editDialog').classList.remove('hidden');
    }

    // 編集ダイアログを閉じる
    closeEditDialog() {
        document.getElementById('editDialog').classList.add('hidden');
        this.editingContest = null;
    }

    // 大会を保存（新規追加または更新）
    async saveContest() {
        console.log('=== saveContest called ===');
        
        const contestData = {
            contest_name: document.getElementById('edit_contest_name').value,
            contest_date: document.getElementById('edit_contest_date').value,
            contest_place: document.getElementById('edit_contest_place').value,
            is_ready: document.getElementById('edit_is_ready').checked ? 'TRUE' : 'FALSE'
        };
        
        console.log('Contest data to save:', contestData);
        console.log('Editing contest:', this.editingContest);

        try {
            let response;
            if (this.editingContest) {
                // 更新
                const url = `${this.apiUrl}/${this.editingContest.id}`;
                console.log('Updating contest - URL:', url);
                console.log('Method: PUT');
                
                response = await authFetch(url, {
                    method: 'PUT',
                    body: JSON.stringify(contestData)
                });
            } else {
                // 新規追加
                console.log('Creating new contest - URL:', this.apiUrl);
                console.log('Method: POST');
                
                response = await authFetch(this.apiUrl, {
                    method: 'POST',
                    body: JSON.stringify(contestData)
                });
            }

            console.log('Response status:', response.status);
            console.log('Response ok:', response.ok);

            const result = await response.json();
            console.log('Response data:', result);

            if (result.success) {
                console.log('Save successful');
                this.showNotification(this.editingContest ? '更新しました' : '追加しました', 'success');
                this.closeEditDialog();
                await this.loadContests();
                await this.loadFilterOptions();
            } else {
                console.error('Save failed:', result.error);
                this.showNotification(result.error || '保存に失敗しました', 'error');
            }
        } catch (error) {
            console.error('=== Save contest error ===');
            console.error('Error type:', error.name);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            console.error('Full error:', error);
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    // 削除確認ダイアログを開く
    openDeleteDialog(contest) {
        this.deletingContest = contest;
        document.getElementById('deleteTargetName').textContent = contest.contest_name || '';

        // 日付のフォーマット
        if (contest.contest_date) {
            const date = new Date(contest.contest_date);
            document.getElementById('deleteTargetDate').textContent = date.toLocaleDateString('ja-JP');
        } else {
            document.getElementById('deleteTargetDate').textContent = '(未設定)';
        }

        document.getElementById('deleteTargetPlace').textContent = contest.contest_place || '(未設定)';
        document.getElementById('deleteDialog').classList.remove('hidden');
    }

    // 削除確認ダイアログを閉じる
    closeDeleteDialog() {
        document.getElementById('deleteDialog').classList.add('hidden');
        this.deletingContest = null;
    }

    // 大会を削除
    async deleteContest() {
        if (!this.deletingContest) return;

        try {
            const response = await authFetch(`${this.apiUrl}/${this.deletingContest.id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('削除しました', 'success');
                this.closeDeleteDialog();
                await this.loadContests();
                await this.loadFilterOptions();
            } else {
                this.showNotification(result.error || '削除に失敗しました', 'error');
            }
        } catch (error) {
            console.error('Delete contest failed:', error);
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
}

// 初期化
const contestsManager = new ContestsManager();
