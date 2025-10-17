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
            column: '大会名',
            direction: 'asc'
        };
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
    }

    async loadFilterOptions() {
        try {
            const response = await authFetch(`${this.apiUrl}/filter-options`);
            const result = await response.json();

            if (result.success) {
                const { contestNames, organizationTypes, passTypes } = result.data;

                this.populateFilterSelect('contestFilter', contestNames);
                this.populateFilterSelect('organizationTypeFilter', organizationTypes);
                this.populateFilterSelect('passTypeFilter', passTypes);

                // 大会名フィルタの初期値を一番下の要素に設定
                if (contestNames.length > 0) {
                    const contestFilter = document.getElementById('contestFilter');
                    const lastContest = contestNames[contestNames.length - 1];
                    contestFilter.value = lastContest;
                    this.currentFilters.contest_name = lastContest;
                }
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
            { key: '大会名', label: '大会名' },
            { key: '団体/個人', label: '団体/個人' },
            { key: '付与パス', label: '付与パス' },
            { key: '代表者氏名', label: '代表者氏名' },
            { key: '団体名（企業名）', label: '団体名（企業名）' },
            { key: '連絡先メールアドレス', label: '連絡先メールアドレス' },
            { key: '緊急電話番号', label: '緊急電話番号' },
            { key: '社内担当者名', label: '社内担当者名' },
            { key: '申請種別', label: '申請種別' },
            { key: '合計付与枚数', label: '合計付与枚数' },
            { key: '事前案内メール', label: '事前案内メール' },
            { key: 'Check-In', label: 'Check-In' },
            { key: '開催後メール', label: '開催後メール' },
            { key: '備考欄（同伴者氏名など）', label: '備考欄' }
        ];

        headers.forEach(header => {
            const th = document.createElement('th');
            th.className = 'sortable';
            th.setAttribute('data-column', header.key);
            th.innerHTML = `${header.label}${this.getSortIcon(header.key)}`;
            th.addEventListener('click', () => this.sortBy(header.key));
            headerRow.appendChild(th);
        });

        table.appendChild(headerRow);

        // データ行作成
        guests.forEach(guest => {
            const row = document.createElement('tr');

            headers.forEach(header => {
                const td = document.createElement('td');
                let value = guest[header.key] || '';

                // Boolean型フィールドはチェックボックスとして表示
                if (header.key === '事前案内メール' || header.key === 'Check-In' || header.key === '開催後メール') {
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = value === 'TRUE' || value === true || value === '○';

                    // Check-Inのみ編集可能
                    if (header.key === 'Check-In') {
                        checkbox.style.cursor = 'pointer';
                        checkbox.addEventListener('change', async (e) => {
                            await this.updateBooleanField(guest, header.key, e.target.checked);
                        });
                    } else {
                        // 事前案内メールと開催後メールは読み取り専用（グレーアウト）
                        checkbox.disabled = true;
                        checkbox.style.cursor = 'default';
                    }

                    td.appendChild(checkbox);
                    td.style.textAlign = 'center';
                } else {
                    td.textContent = value;
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

    // Boolean型フィールドを更新（Check-Inのみ）
    async updateBooleanField(guest, fieldName, newValue) {
        try {
            // 元の値を保存（エラー時に復元するため）
            const originalValue = guest[fieldName];

            // UIを即座に更新
            guest[fieldName] = newValue ? 'TRUE' : 'FALSE';

            // サーバーに更新リクエストを送信
            const guestData = {
                '大会名': guest['大会名'],
                '団体/個人': guest['団体/個人'],
                '付与パス': guest['付与パス'],
                '代表者氏名': guest['代表者氏名'],
                '団体名（企業名）': guest['団体名（企業名）'],
                '連絡先メールアドレス': guest['連絡先メールアドレス'],
                '緊急電話番号': guest['緊急電話番号'],
                '社内担当者名': guest['社内担当者名'],
                '申請種別': guest['申請種別'],
                '合計付与枚数': guest['合計付与枚数'],
                '事前案内メール': guest['事前案内メール'],
                'Check-In': guest['Check-In'],
                '開催後メール': guest['開催後メール'],
                '備考欄（同伴者氏名など）': guest['備考欄（同伴者氏名など）']
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
                this.showNotification(`${fieldName}を更新しました`, 'success');
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
