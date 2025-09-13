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
        // console.log('Getting auth headers, token exists:', !!token);
        // if (token) {
        //     console.log('Token preview:', token.substring(0, 20) + '...');
        // }
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }
};

// 認証付きfetch関数
async function authFetch(url, options = {}) {
    const authHeaders = AuthToken.getHeaders();
    // console.log('authFetch called for:', url);
    // console.log('Auth headers:', authHeaders);
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
            ...(options.headers || {})
        },
        credentials: 'include'
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    // console.log('Final request headers:', mergedOptions.headers);
    
    return fetch(url, mergedOptions);
}

class ScoresManager {
    constructor() {
        this.apiUrl = '/api/scores';
        this.showingDeleted = false;
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
        this.init();
    }

    async init() {
        await this.checkAuthStatus();
        this.bindEvents();
        if (this.currentUser) {
            // セクション展開後にフィルターオプションを読み込み
            setTimeout(async () => {
                await this.loadFilterOptions();
                await this.loadScores();
            }, 100);
        }
    }

    async checkAuthStatus() {
        try {
            // console.log('=== Scores page checkAuthStatus START ===');
            // const token = AuthToken.get();
            // console.log('Token exists in localStorage on scores page:', !!token);
            // if (token) {
            //     console.log('Token preview on scores page:', token.substring(0, 20) + '...');
            // }
            
            const headers = AuthToken.getHeaders();
            // console.log('Auth headers for /api/auth/status on scores page:', headers);

            const response = await fetch('/api/auth/status', {
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            // console.log('Auth status response status on scores page:', response.status);
            const result = await response.json();
            // console.log('Auth status result on scores page:', result);
            
            if (!result.isAuthenticated) {
                console.log('User NOT authenticated on scores page, redirecting to /');
                AuthToken.remove();
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000); // 1秒待機してログを確認
                return;
            }

            // console.log('User authenticated on scores page, proceeding...');
            this.currentUser = result.user;
            this.isAdmin = result.user.role === 'admin';
            
            try {
                this.updateUI();
                // console.log('scores updateUI completed successfully');
            } catch (uiError) {
                console.error('scores updateUI error (but keeping authentication):', uiError);
                // UIエラーでもトークンは保持
            }
        } catch (error) {
            console.error('Auth check error on scores page:', error);
            AuthToken.remove();
            setTimeout(() => {
                window.location.href = '/';
            }, 1000); // 1秒待機してログを確認
        }
    }

    updateUI() {
        if (this.currentUser) {
            // console.log('scores updateUI - currentUser:', this.currentUser);
            document.getElementById('authHeader').style.display = 'flex';
            
            const userName = this.currentUser.name || this.currentUser.email || 'User';
            // console.log('scores updateUI - userName:', userName);

            document.getElementById('userAvatar').textContent = userName.charAt(0).toUpperCase();
            document.getElementById('userName').textContent = userName;
            document.getElementById('userRole').innerHTML = `<span class="role-badge ${this.currentUser.role}">${this.currentUser.role}</span>`;

            if (!this.isAdmin) {
                document.body.classList.add('readonly-mode');
            }
        }
    }

    async loadFilterOptions() {
        try {
            // console.log('Loading filter options...');
            const response = await authFetch(`${this.apiUrl}/filter-options`);
            
            const result = await response.json();
            // console.log('Filter options response:', result);

            if (result.success) {
                // console.log('Contest names:', result.data.contestNames);
                // console.log('Category names:', result.data.categoryNames);
                this.populateFilterOptions(result.data);
            } else {
                console.error('Failed to load filter options:', result.error);
            }
        } catch (error) {
            console.error('Error loading filter options:', error);
        }
    }

    populateFilterOptions(data) {
        // console.log('Populating filter options with data:', data);
        
        // 大会名のオプションを設定
        const contestSelect = document.getElementById('contestFilter');
        if (!contestSelect) {
            console.error('contestFilter element not found');
            return;
        }
        
        contestSelect.innerHTML = '<option value="">大会名を選択</option>';
        if (data.contestNames && data.contestNames.length > 0) {
            data.contestNames.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                contestSelect.appendChild(option);
            });
            // console.log(`Added ${data.contestNames.length} contest options`);
        } else {
            // console.log('No contest names found');
        }

        // カテゴリー名のオプションを設定
        const categorySelect = document.getElementById('categoryFilter');
        if (!categorySelect) {
            console.error('categoryFilter element not found');
            return;
        }
        
        categorySelect.innerHTML = '<option value="">カテゴリー名を選択</option>';
        if (data.categoryNames && data.categoryNames.length > 0) {
            data.categoryNames.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                categorySelect.appendChild(option);
            });
            // console.log(`Added ${data.categoryNames.length} category options`);
        } else {
            // console.log('No category names found');
        }
    }


    bindEvents() {
        document.getElementById('csvFile').addEventListener('change', (e) => {
            this.handleFileSelect(e);
        });

        document.getElementById('importBtn').addEventListener('click', () => {
            this.handleImport();
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadScores();
        });

        document.getElementById('toggleDeletedBtn').addEventListener('click', () => {
            this.toggleDeletedView();
        });

        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.handleLogout();
        });


        document.getElementById('applyFiltersBtn').addEventListener('click', () => {
            this.applyFilters();
        });

        document.getElementById('clearFiltersBtn').addEventListener('click', () => {
            this.clearFilters();
        });

        document.getElementById('prevPageBtn').addEventListener('click', () => {
            this.prevPage();
        });

        document.getElementById('nextPageBtn').addEventListener('click', () => {
            this.nextPage();
        });

        document.getElementById('editScoreForm').addEventListener('submit', (e) => {
            this.handleEditSubmit(e);
        });

        const clearBtn = document.getElementById('clearSearchBtn');
        
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.clearSearch();
            return false;
        });

        clearBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        clearBtn.addEventListener('mouseup', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        clearBtn.addEventListener('focus', (e) => {
            e.preventDefault();
            e.target.blur(); // フォーカスを即座に外す
        });

        // 検索入力時にクリアボタンの表示/非表示を制御
        document.getElementById('searchInput').addEventListener('input', (e) => {
            const clearBtn = document.getElementById('clearSearchBtn');
            if (e.target.value.length > 0) {
                clearBtn.classList.remove('hidden');
            } else {
                clearBtn.classList.add('hidden');
            }
            this.searchScores();
        });
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        const importBtn = document.getElementById('importBtn');
        
        if (file && file.type === 'text/csv') {
            importBtn.disabled = false;
            this.selectedFile = file;
        } else {
            importBtn.disabled = true;
            this.selectedFile = null;
            if (file) {
                this.showNotification('CSVファイルを選択してください', 'error');
            }
        }
    }

    async handleImport() {
        if (!this.selectedFile) {
            this.showNotification('CSVファイルを選択してください', 'error');
            return;
        }

        try {
            const csvText = await this.readFileAsText(this.selectedFile);
            const csvData = this.parseCSV(csvText);
            
            if (csvData.length === 0) {
                this.showNotification('CSVデータが空です', 'error');
                return;
            }

            document.getElementById('importBtn').disabled = true;
            document.getElementById('importStatus').className = 'import-status';
            document.getElementById('importStatus').textContent = 'インポート中...';

            const response = await authFetch(`${this.apiUrl}/import`, {
                method: 'POST',
                body: JSON.stringify({ csvData })
            });

            const result = await response.json();

            if (result.success) {
                const { total, imported, message } = result.data;
                
                this.showNotification(message || `${imported}件の成績をインポートしました`, 'success');
                document.getElementById('importStatus').textContent = message || `インポート完了: ${imported}件`;
                
                // フィルターオプションを再読込み（新しいデータが追加されたため）
                await this.loadFilterOptions();
                this.loadScores();
                
                // ファイル選択をリセット
                document.getElementById('csvFile').value = '';
                document.getElementById('importBtn').disabled = true;
                this.selectedFile = null;
            } else {
                this.showNotification(result.error, 'error');
                document.getElementById('importStatus').textContent = 'インポートに失敗しました';
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
            document.getElementById('importStatus').textContent = 'エラーが発生しました';
        } finally {
            document.getElementById('importBtn').disabled = false;
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file, 'UTF-8');
        });
    }

    parseCSV(csvText) {
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length < 2) return [];

        const headers = this.parseCSVLine(lines[0]);
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length === headers.length) {
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index];
                });
                data.push(row);
            }
        }

        return data;
    }

    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        values.push(current.trim());
        return values.map(v => v.replace(/^"(.*)"$/, '$1')); // Remove surrounding quotes
    }

    async loadScores(page = this.currentPage) {
        const container = document.getElementById('scoresTableContainer');
        container.innerHTML = '<div class="loading">読み込み中...</div>';

        try {
            let url = this.showingDeleted ? `${this.apiUrl}/deleted/list` : this.apiUrl;
            
            if (!this.showingDeleted) {
                // ページング、フィルター、ソートのパラメータを追加
                const params = new URLSearchParams({
                    page: page,
                    limit: this.limit,
                    sortBy: this.currentSort.column,
                    sortOrder: this.currentSort.direction,
                    ...this.currentFilters
                });
                url += `?${params.toString()}`;
            }

            const response = await authFetch(url);
            
            const result = await response.json();

            if (result.success) {
                if (this.showingDeleted) {
                    this.renderScoresTable(result.data);
                    this.updatePagination(1, 1, result.data.length);
                } else {
                    this.currentPage = result.page;
                    this.totalPages = result.totalPages;
                    this.total = result.total;
                    this.renderScoresTable(result.data);
                    this.updatePagination(result.page, result.totalPages, result.total);
                }
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            container.innerHTML = `<div class="empty-state">エラー: ${error.message}</div>`;
            this.hidePagination();
        }
    }


    renderScoresTable(scores) {
        const container = document.getElementById('scoresTableContainer');
        
        if (scores.length === 0) {
            container.innerHTML = '<div class="empty-state">成績が見つかりません</div>';
            this.hidePagination();
            return;
        }

        const getSortIcon = (column) => {
            if (this.currentSort.column === column) {
                return this.currentSort.direction === 'asc' ? ' ▲' : ' ▼';
            }
            return ' ⇅';
        };

        let tableHtml = `
            <table class="scores-table">
                <thead>
                    <tr>
                        <th class="sortable" data-column="npcj_no">NPCJ番号${getSortIcon('npcj_no')}</th>
                        <th class="sortable" data-column="contest_date">開催日${getSortIcon('contest_date')}</th>
                        <th class="sortable" data-column="contest_name">大会名${getSortIcon('contest_name')}</th>
                        <th class="sortable" data-column="category_name">カテゴリー${getSortIcon('category_name')}</th>
                        <th class="sortable" data-column="placing">順位${getSortIcon('placing')}</th>
                        <th class="sortable" data-column="player_name">選手名${getSortIcon('player_name')}</th>
                        <th class="sortable" data-column="contest_place">開催地${getSortIcon('contest_place')}</th>
                        <th>ステータス</th>
                        ${this.isAdmin ? '<th>操作</th>' : ''}
                    </tr>
                </thead>
                <tbody>
        `;

        scores.forEach(score => {
            const isDeleted = score.isValid === 'FALSE';
            const statusBadge = isDeleted ? 
                '<span class="status-badge deleted">削除済み</span>' :
                '<span class="status-badge active">有効</span>';
            
            let actions = '';
            if (this.isAdmin) {
                if (isDeleted) {
                    actions = `
                        <button class="btn btn-sm restore-btn" onclick="scoresManager.restoreScore('${score.id}')">復元</button>
                        <button class="btn btn-sm delete-btn" onclick="scoresManager.permanentDeleteScore('${score.id}')">完全削除</button>
                    `;
                } else {
                    actions = `
                        <button class="btn btn-sm edit-btn" onclick="scoresManager.editScore('${score.id}')">編集</button>
                        <button class="btn btn-sm delete-btn" onclick="scoresManager.deleteScore('${score.id}')">削除</button>
                    `;
                }
            }

            tableHtml += `
                <tr class="${isDeleted ? 'deleted' : ''}">
                    <td>${this.escapeHtml(score.npcj_no || '')}</td>
                    <td>${score.contest_date || ''}</td>
                    <td>${this.escapeHtml(score.contest_name || '')}</td>
                    <td>${this.escapeHtml(score.category_name || '')}</td>
                    <td>${score.placing || ''}</td>
                    <td>${this.escapeHtml(score.player_name || '')}</td>
                    <td>${this.escapeHtml(score.contest_place || '')}</td>
                    <td>${statusBadge}</td>
                    ${this.isAdmin ? `<td class="actions">${actions}</td>` : ''}
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
        `;

        container.innerHTML = tableHtml;
        
        // ソートイベントリスナーを追加
        this.addSortEventListeners();
    }

    addSortEventListeners() {
        const sortableHeaders = document.querySelectorAll('.sortable');
        sortableHeaders.forEach(header => {
            header.addEventListener('click', (e) => {
                const column = e.target.getAttribute('data-column');
                this.handleSort(column);
            });
        });
    }

    handleSort(column) {
        if (this.currentSort.column === column) {
            // 同じカラムをクリックした場合は昇順・降順を切り替え
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // 別のカラムをクリックした場合は昇順から開始
            this.currentSort.column = column;
            this.currentSort.direction = 'asc';
        }
        
        // ソートを適用してデータを再読み込み
        this.currentPage = 1;
        this.loadScores(1);
    }

    async applyFilters() {
        const npcjNo = document.getElementById('npcjFilter').value;
        const contestName = document.getElementById('contestFilter').value;
        const categoryName = document.getElementById('categoryFilter').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        // 現在のフィルターを保存
        this.currentFilters = {};
        if (npcjNo) this.currentFilters.npcj_no = npcjNo;
        if (contestName) this.currentFilters.contest_name = contestName;
        if (categoryName) this.currentFilters.category_name = categoryName;
        if (startDate) this.currentFilters.startDate = startDate;
        if (endDate) this.currentFilters.endDate = endDate;

        // 最初のページに戻って検索
        this.currentPage = 1;
        await this.loadScores(1);
    }

    clearFilters() {
        document.getElementById('npcjFilter').value = '';
        document.getElementById('contestFilter').selectedIndex = 0; // セレクトボックスを最初の選択肢にリセット
        document.getElementById('categoryFilter').selectedIndex = 0; // セレクトボックスを最初の選択肢にリセット
        document.getElementById('startDate').value = '';
        document.getElementById('endDate').value = '';
        document.getElementById('searchInput').value = '';
        
        // クリアボタンも隠す
        const clearBtn = document.getElementById('clearSearchBtn');
        clearBtn.classList.add('hidden');
        
        // フィルターをクリアして最初のページを読み込み
        this.currentFilters = {};
        this.currentPage = 1;
        this.loadScores(1);
    }

    updatePagination(page, totalPages, total) {
        const pageInfo = document.getElementById('pageInfo');
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');
        const pagination = document.getElementById('pagination');

        pageInfo.textContent = `ページ ${page} / ${totalPages} (全 ${total} 件)`;
        prevBtn.disabled = page <= 1;
        nextBtn.disabled = page >= totalPages;
        
        pagination.classList.remove('hidden');
    }

    hidePagination() {
        document.getElementById('pagination').classList.add('hidden');
    }

    async prevPage() {
        if (this.currentPage > 1) {
            await this.loadScores(this.currentPage - 1);
        }
    }

    async nextPage() {
        if (this.currentPage < this.totalPages) {
            await this.loadScores(this.currentPage + 1);
        }
    }

    toggleDeletedView() {
        this.showingDeleted = !this.showingDeleted;
        const toggleBtn = document.getElementById('toggleDeletedBtn');
        
        if (this.showingDeleted) {
            toggleBtn.textContent = '有効を表示';
            toggleBtn.classList.add('active');
        } else {
            toggleBtn.textContent = '削除済みを表示';
            toggleBtn.classList.remove('active');
        }
        
        this.loadScores();
    }

    async deleteScore(id) {
        if (!confirm('この成績を論理削除してもよろしいですか？')) {
            return;
        }

        try {
            const response = await authFetch(`${this.apiUrl}/${id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('成績が論理削除されました', 'success');
                this.loadScores();
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    async restoreScore(id) {
        try {
            const response = await authFetch(`${this.apiUrl}/${id}/restore`, {
                method: 'PUT'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('成績が復元されました', 'success');
                this.loadScores();
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    async permanentDeleteScore(id) {
        if (!confirm('この成績を完全に削除してもよろしいですか？この操作は元に戻せません。')) {
            return;
        }

        try {
            const response = await authFetch(`${this.apiUrl}/${id}/permanent`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('成績が完全に削除されました', 'success');
                this.loadScores();
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    clearSearch() {
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearSearchBtn');
        
        // 検索ボックスをクリア
        searchInput.value = '';
        
        // クリアボタンを隠す
        clearBtn.classList.add('hidden');
        
        // 次のフレームでフォーカスを設定（レイアウトが安定してから）
        requestAnimationFrame(() => {
            // カーソル位置をリセット
            searchInput.setSelectionRange(0, 0);
            
            // フォーカスを維持
            searchInput.focus();
        });
        
        // 検索結果をリセット
        this.searchScores();
    }

    searchScores() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const tableRows = document.querySelectorAll('.scores-table tbody tr');
        
        tableRows.forEach(row => {
            const text = row.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    async handleLogout() {
        try {
            const response = await authFetch('/api/auth/logout', {
                method: 'POST'
            });

            const result = await response.json();
            if (result.success) {
                AuthToken.remove();
                window.location.href = '/';
            }
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    showNotification(message, type) {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.remove('hidden');
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.classList.add('hidden');
            }, 300);
        }, 3000);
    }

    async editScore(id) {
        try {
            const response = await fetch(`${this.apiUrl}/${id}`, {
                credentials: 'include'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.currentEditId = id;
                this.populateEditForm(result.data);
                this.showEditModal();
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    populateEditForm(score) {
        document.getElementById('editNpcjNo').value = score.npcj_no || '';
        document.getElementById('editContestDate').value = score.contest_date || '';
        document.getElementById('editContestName').value = score.contest_name || '';
        document.getElementById('editCategoryName').value = score.category_name || '';
        document.getElementById('editPlacing').value = score.placing || '';
        document.getElementById('editPlayerName').value = score.player_name || '';
        document.getElementById('editContestPlace').value = score.contest_place || '';
    }

    showEditModal() {
        document.getElementById('editModal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    closeEditModal() {
        document.getElementById('editModal').classList.add('hidden');
        document.body.style.overflow = '';
        this.currentEditId = null;
    }

    async handleEditSubmit(e) {
        e.preventDefault();
        
        if (!this.currentEditId) {
            this.showNotification('編集対象が見つかりません', 'error');
            return;
        }

        const formData = new FormData(e.target);
        const updateData = {};
        
        for (let [key, value] of formData.entries()) {
            updateData[key] = value;
        }

        try {
            const response = await authFetch(`${this.apiUrl}/${this.currentEditId}`, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('成績を更新しました', 'success');
                this.closeEditModal();
                this.loadScores();
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

const scoresManager = new ScoresManager();

// Collapsible section functionality
function toggleSection(sectionId) {
    const content = document.getElementById(sectionId + '-content');
    const header = content.parentElement.querySelector('.section-header');
    
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        header.classList.add('expanded');
    } else {
        content.classList.add('collapsed');
        header.classList.remove('expanded');
    }
}