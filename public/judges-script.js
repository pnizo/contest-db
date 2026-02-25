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

    const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...(options.headers || {})
        }
    };
    return fetch(url, mergedOptions);
}

class JudgesManager {
    constructor() {
        this.apiUrl = '/api/judges';
        this.currentUser = null;
        this.isAdmin = false;
        this.currentPage = 1;
        this.limit = 50;
        this.totalPages = 0;
        this.total = 0;
        this.currentFilters = {};
        this.currentSort = {
            column: 'placing',
            direction: 'asc'
        };
        this.editingId = null;
        this.contestsMap = new Map();
        this.selectedImportFile = null;
        this.init();
    }

    async init() {
        await this.checkAuthStatus();
        this.bindEvents();
        if (this.currentUser) {
            setTimeout(async () => {
                await this.loadContests();
                await this.loadFilterOptions();
                await this.loadJudges();
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
            this.updateUI();
        } catch (error) {
            console.error('Auth check error:', error);
            AuthToken.remove();
            window.location.href = '/';
        }
    }

    updateUI() {
        if (this.currentUser) {
            document.getElementById('authHeader').style.display = 'flex';

            const userName = this.currentUser.name || this.currentUser.email || 'User';
            document.getElementById('userAvatar').textContent = userName.charAt(0).toUpperCase();
            document.getElementById('userName').textContent = userName;
            document.getElementById('userRole').innerHTML = `<span class="role-badge ${this.currentUser.role}">${this.currentUser.role}</span>`;

            if (this.isAdmin && typeof showAdminOnlyElements === 'function') {
                showAdminOnlyElements();
            }

            if (!this.isAdmin) {
                document.body.classList.add('readonly-mode');
            }
        }
    }

    async loadContests() {
        try {
            const response = await authFetch('/api/contests');
            const result = await response.json();

            if (result.success && result.data) {
                result.data.forEach(contest => {
                    if (contest.contest_name && contest.contest_date) {
                        this.contestsMap.set(contest.contest_name, {
                            date: contest.contest_date,
                            place: contest.contest_place || ''
                        });
                    }
                });
            }
        } catch (error) {
            console.error('Contests loading failed:', error);
        }
    }

    async loadFilterOptions() {
        try {
            const response = await authFetch(`${this.apiUrl}/filter-options`);
            const result = await response.json();

            if (result.success) {
                this.populateFilterOptions(result.data);
                this.selectDefaultContest(result.data.contestDates || {});
            }
        } catch (error) {
            console.error('Error loading filter options:', error);
        }
    }

    populateFilterOptions(data) {
        const contestSelect = document.getElementById('contestFilter');
        contestSelect.innerHTML = '<option value="">大会名を選択</option>';
        if (data.contestNames) {
            data.contestNames.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                contestSelect.appendChild(option);
            });
        }

        const classSelect = document.getElementById('classFilter');
        classSelect.innerHTML = '<option value="">クラス名を選択</option>';
        if (data.classNames) {
            data.classNames.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                classSelect.appendChild(option);
            });
        }
    }

    selectDefaultContest(contestDates) {
        // フィルターが既に手動設定されている場合はスキップ
        const contestSelect = document.getElementById('contestFilter');
        if (contestSelect.value) return;

        const today = new Date().toISOString().split('T')[0];
        let bestName = null;
        let bestDate = null;

        for (const [name, date] of Object.entries(contestDates)) {
            if (date <= today) {
                if (!bestDate || date > bestDate) {
                    bestDate = date;
                    bestName = name;
                }
            }
        }

        if (bestName) {
            contestSelect.value = bestName;
            this.currentFilters.contest_name = bestName;
        }
    }

    bindEvents() {
        // インポートドロップダウン
        document.getElementById('importDropdownToggle').addEventListener('click', () => {
            const menu = document.getElementById('importDropdownMenu');
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        });

        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('importDropdown');
            if (dropdown && !dropdown.contains(e.target)) {
                document.getElementById('importDropdownMenu').style.display = 'none';
            }
        });

        // インポート関連
        document.getElementById('importModalBtn').addEventListener('click', () => {
            document.getElementById('importDropdownMenu').style.display = 'none';
            this.openImportModal();
        });

        document.getElementById('importContestName').addEventListener('change', () => {
            this.updateImportButtonState();
        });

        // モーダルの大会選択で開催日を自動セット
        document.getElementById('modalContestName').addEventListener('change', (e) => {
            const contestData = this.contestsMap.get(e.target.value);
            document.getElementById('modalContestDate').value = contestData ? contestData.date : '';
        });

        document.getElementById('importClassName').addEventListener('input', () => {
            this.updateImportButtonState();
        });

        document.getElementById('importCsvFile').addEventListener('change', (e) => {
            this.handleImportFileSelect(e);
        });

        document.getElementById('importBtn').addEventListener('click', () => {
            this.importCsv();
        });

        // 出場登録からインポート関連
        document.getElementById('regImportModalBtn').addEventListener('click', () => {
            document.getElementById('importDropdownMenu').style.display = 'none';
            this.openRegistrationImportModal();
        });

        document.getElementById('regImportContestName').addEventListener('change', () => {
            document.getElementById('regImportBtn').disabled = !document.getElementById('regImportContestName').value;
        });

        document.getElementById('regImportBtn').addEventListener('click', () => {
            this.importFromRegistrations();
        });

        // エクスポート
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportCsv();
        });

        // 採点モーダル
        document.getElementById('scoringBtn').addEventListener('click', () => {
            this.openScoringModal();
        });

        document.getElementById('scoringContestName').addEventListener('change', () => {
            this.updateScoringClassOptions();
        });

        document.getElementById('recalculateBtn').addEventListener('click', () => {
            this.recalculateScores();
        });

        // フィルター（リストボックス変更で自動絞り込み）
        document.getElementById('contestFilter').addEventListener('change', () => {
            this.applyFilters();
        });

        document.getElementById('classFilter').addEventListener('change', () => {
            this.applyFilters();
        });

        document.getElementById('clearFiltersBtn').addEventListener('click', () => {
            this.clearFilters();
        });

        // 無効データ表示トグル
        document.getElementById('showInvalidToggle').addEventListener('change', () => {
            this.applyFilters();
        });

        // ページネーション
        document.getElementById('prevPageBtn').addEventListener('click', () => {
            this.prevPage();
        });

        document.getElementById('nextPageBtn').addEventListener('click', () => {
            this.nextPage();
        });

        // 検索
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
            this.clearSearch();
        });

        // フォーム送信
        document.getElementById('judgeForm').addEventListener('submit', (e) => {
            this.handleFormSubmit(e);
        });

        // ログアウト
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.handleLogout();
        });
    }

    // --- データ読み込み ---

    async loadJudges(page = this.currentPage) {
        const container = document.getElementById('judgesTableContainer');
        container.innerHTML = '<div class="loading">読み込み中...</div>';

        try {
            const params = new URLSearchParams({
                page: page,
                limit: this.limit,
                sortBy: this.currentSort.column,
                sortOrder: this.currentSort.direction,
                ...this.currentFilters
            });

            const response = await authFetch(`${this.apiUrl}?${params.toString()}`);
            const result = await response.json();

            if (result.success) {
                this.currentPage = result.page;
                this.totalPages = result.totalPages;
                this.total = result.total;
                this.displayJudges(result.data);
                this.updatePagination(result.page, result.totalPages, result.total);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            container.innerHTML = `<div class="empty-state">エラー: ${error.message}</div>`;
            this.hidePagination();
        }
    }

    displayJudges(judges) {
        const container = document.getElementById('judgesTableContainer');

        if (judges.length === 0) {
            container.innerHTML = '<div class="empty-state">審判採点データが見つかりません</div>';
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
            <table class="data-table">
                <thead>
                    <tr>
                        <th class="sortable" data-column="contest_name">大会名${getSortIcon('contest_name')}</th>
                        <th class="sortable" data-column="contest_date">開催日${getSortIcon('contest_date')}</th>
                        <th class="sortable" data-column="class_name">クラス名${getSortIcon('class_name')}</th>
                        <th class="sortable" data-column="player_no">ゼッケン${getSortIcon('player_no')}</th>
                        <th class="sortable" data-column="player_name">選手名${getSortIcon('player_name')}</th>
                        <th class="sortable" data-column="placing">順位${getSortIcon('placing')}</th>
                        <th class="sortable" data-column="score_j1">J1${getSortIcon('score_j1')}</th>
                        <th class="sortable" data-column="score_j2">J2${getSortIcon('score_j2')}</th>
                        <th class="sortable" data-column="score_j3">J3${getSortIcon('score_j3')}</th>
                        <th class="sortable" data-column="score_j4">J4${getSortIcon('score_j4')}</th>
                        <th class="sortable" data-column="score_j5">J5${getSortIcon('score_j5')}</th>
                        <th class="sortable" data-column="score_j6">J6${getSortIcon('score_j6')}</th>
                        <th class="sortable" data-column="score_j7">J7${getSortIcon('score_j7')}</th>
                        <th class="sortable" data-column="score_t">合計${getSortIcon('score_t')}</th>
                        <th>ステータス</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
        `;

        judges.forEach(judge => {
            const isDeleted = judge.isValid === 'FALSE';
            const statusBadge = isDeleted ?
                '<span class="status-badge deleted">削除済み</span>' :
                '<span class="status-badge active">有効</span>';

            let actions = '';
            if (this.isAdmin) {
                if (isDeleted) {
                    actions = `
                        <button class="btn btn-sm btn-success" onclick="judgesManager.restoreJudge(${judge.id})">復元</button>
                        <button class="btn btn-sm btn-danger" onclick="judgesManager.permanentDeleteJudge(${judge.id})">完全削除</button>
                    `;
                } else {
                    actions = `
                        <button class="btn btn-sm btn-primary" onclick="judgesManager.editJudge(${judge.id})">編集</button>
                        <button class="btn btn-sm btn-warning" onclick="judgesManager.deleteJudge(${judge.id})">削除</button>
                    `;
                }
            }

            tableHtml += `
                <tr class="${isDeleted ? 'deleted-row' : ''}" data-id="${judge.id}" data-contest="${this.escapeHtml(judge.contest_name)}" data-class="${this.escapeHtml(judge.class_name)}">
                    <td>${this.escapeHtml(judge.contest_name)}</td>
                    <td>${judge.contest_date || ''}</td>
                    <td>${this.escapeHtml(judge.class_name)}</td>
                    <td>${judge.player_no}</td>
                    <td>${this.escapeHtml(judge.player_name)}</td>
                    <td class="placing-cell">${judge.placing}</td>
                    <td${this.isAdmin && !isDeleted ? ` class="editable-score" data-id="${judge.id}" data-field="score_j1"` : ''}>${judge.score_j1 != null ? judge.score_j1 : ''}</td>
                    <td${this.isAdmin && !isDeleted ? ` class="editable-score" data-id="${judge.id}" data-field="score_j2"` : ''}>${judge.score_j2 != null ? judge.score_j2 : ''}</td>
                    <td${this.isAdmin && !isDeleted ? ` class="editable-score" data-id="${judge.id}" data-field="score_j3"` : ''}>${judge.score_j3 != null ? judge.score_j3 : ''}</td>
                    <td${this.isAdmin && !isDeleted ? ` class="editable-score" data-id="${judge.id}" data-field="score_j4"` : ''}>${judge.score_j4 != null ? judge.score_j4 : ''}</td>
                    <td${this.isAdmin && !isDeleted ? ` class="editable-score" data-id="${judge.id}" data-field="score_j5"` : ''}>${judge.score_j5 != null ? judge.score_j5 : ''}</td>
                    <td${this.isAdmin && !isDeleted ? ` class="editable-score" data-id="${judge.id}" data-field="score_j6"` : ''}>${judge.score_j6 != null ? judge.score_j6 : ''}</td>
                    <td${this.isAdmin && !isDeleted ? ` class="editable-score" data-id="${judge.id}" data-field="score_j7"` : ''}>${judge.score_j7 != null ? judge.score_j7 : ''}</td>
                    <td class="score-total">${judge.score_t != null ? judge.score_t : ''}</td>
                    <td>${statusBadge}</td>
                    <td>${actions}</td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
        `;

        container.innerHTML = tableHtml;

        // 列幅リサイズ機能を初期化
        const table = container.querySelector('table');
        if (window.ColumnResize && table) {
            ColumnResize.init(table, 'judges-column-widths');
        }

        // ソート機能を初期化
        if (window.TableSort && table) {
            TableSort.init(table);
        }

        // ソートイベントリスナーを追加
        this.addSortEventListeners();

        // インライン編集リスナーを追加
        this.addInlineEditListeners();
    }

    addSortEventListeners() {
        const sortableHeaders = document.querySelectorAll('.sortable');
        sortableHeaders.forEach(header => {
            header.addEventListener('click', (e) => {
                const column = e.target.closest('.sortable').getAttribute('data-column');
                this.sortBy(column);
            });
        });
    }

    addInlineEditListeners() {
        document.querySelectorAll('.editable-score').forEach(td => {
            td.addEventListener('click', () => {
                // 既に編集中なら何もしない
                if (td.querySelector('input')) return;

                const originalValue = td.textContent.trim();
                const input = document.createElement('input');
                input.type = 'number';
                input.step = 'any';
                input.value = originalValue;
                input.className = 'inline-score-input';

                td.textContent = '';
                td.appendChild(input);
                input.focus();
                input.select();

                const finish = () => {
                    const id = td.dataset.id;
                    const field = td.dataset.field;
                    this.saveInlineScore(td, id, field, input.value.trim(), originalValue);
                };

                input.addEventListener('blur', finish);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        input.blur();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        input.removeEventListener('blur', finish);
                        td.textContent = originalValue;
                    }
                });
            });
        });
    }

    async saveInlineScore(td, id, field, value, originalValue) {
        // 値が変わっていなければスキップ
        if (value === originalValue) {
            td.textContent = originalValue;
            return;
        }

        try {
            const response = await authFetch(`/api/judges/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value !== '' ? parseFloat(value) : null })
            });

            if (!response.ok) {
                throw new Error('保存に失敗しました');
            }

            const result = await response.json();

            // セルのテキストを更新
            td.textContent = result.data[field] != null ? result.data[field] : '';
        } catch (error) {
            td.textContent = originalValue;
            this.showNotification(error.message || '保存に失敗しました', 'error');
        }
    }

    async updatePlacingsInBackground(contestName, className) {
        try {
            const params = new URLSearchParams({
                page: 1,
                limit: 100,
                contest_name: contestName,
                class_name: className,
                sortBy: 'placing',
                sortOrder: 'asc'
            });
            const response = await authFetch(`${this.apiUrl}?${params.toString()}`);
            const result = await response.json();
            if (!result.success) return;

            // テーブル内の同一大会・クラスの行の placing を更新
            const rows = document.querySelectorAll(`tr[data-contest="${contestName}"][data-class="${className}"]`);
            const placingMap = {};
            result.data.forEach(j => { placingMap[j.id] = j.placing; });

            rows.forEach(row => {
                const rowId = row.dataset.id;
                if (placingMap[rowId] !== undefined) {
                    const placingCell = row.querySelector('.placing-cell');
                    if (placingCell) {
                        placingCell.textContent = placingMap[rowId];
                    }
                }
            });
        } catch (e) {
            // placing更新失敗は致命的でないので無視
        }
    }

    // --- 採点モーダル ---

    async openScoringModal() {
        // Judgesテーブルに存在する大会名のみ選択肢に表示
        const contestSelect = document.getElementById('scoringContestName');
        contestSelect.innerHTML = '<option value="">大会を選択してください</option>';
        try {
            const response = await authFetch(`${this.apiUrl}/filter-options`);
            const result = await response.json();
            if (result.success && result.data.contestNames) {
                const contestDates = result.data.contestDates || {};
                // 日付の降順でソート
                const sorted = result.data.contestNames.sort((a, b) => {
                    const dateA = contestDates[a] || '';
                    const dateB = contestDates[b] || '';
                    return dateB.localeCompare(dateA);
                });
                sorted.forEach(name => {
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = contestDates[name] ? `${name} (${contestDates[name]})` : name;
                    contestSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Failed to load contest names for scoring modal:', error);
        }

        // 現在のフィルター値をプリセット
        const contestFilter = document.getElementById('contestFilter').value;
        if (contestFilter) {
            document.getElementById('scoringContestName').value = contestFilter;
            this.updateScoringClassOptions().then(() => {
                const classFilter = document.getElementById('classFilter').value;
                if (classFilter) {
                    document.getElementById('scoringClassName').value = classFilter;
                }
            });
        } else {
            document.getElementById('scoringClassName').innerHTML = '<option value="">全クラス</option>';
        }

        document.getElementById('scoringExcludeMinMax').checked = false;
        document.getElementById('scoringStatus').className = 'import-status hidden';
        document.getElementById('scoringModal').classList.remove('hidden');
    }

    closeScoringModal() {
        document.getElementById('scoringModal').classList.add('hidden');
    }

    async updateScoringClassOptions() {
        const contestName = document.getElementById('scoringContestName').value;
        const classSelect = document.getElementById('scoringClassName');
        classSelect.innerHTML = '<option value="">全クラス</option>';

        if (!contestName) return;

        try {
            const params = new URLSearchParams({
                page: 1,
                limit: 1,
                contest_name: contestName
            });
            // filter-options からクラス名を取得するために全データのクラス名を検索
            const response = await authFetch(`${this.apiUrl}?${params.toString()}`);
            const result = await response.json();

            if (!result.success) return;

            // 全レコードからクラス名を取得するために別のアプローチ：filter-optionsを利用
            const filterResponse = await authFetch(`${this.apiUrl}/filter-options`);
            const filterResult = await filterResponse.json();

            if (filterResult.success && filterResult.data.classNames) {
                // 大会でフィルターした場合のクラス名を取得するために、
                // 全クラスではなく大会に紐づくクラスのみ表示
                const allParams = new URLSearchParams({
                    page: 1,
                    limit: 500,
                    contest_name: contestName,
                    sortBy: 'class_name',
                    sortOrder: 'asc'
                });
                const allResponse = await authFetch(`${this.apiUrl}?${allParams.toString()}`);
                const allResult = await allResponse.json();

                if (allResult.success) {
                    const classNames = [...new Set(allResult.data.map(j => j.class_name).filter(c => c))].sort();
                    classNames.forEach(name => {
                        const option = document.createElement('option');
                        option.value = name;
                        option.textContent = name;
                        classSelect.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading class options:', error);
        }
    }

    async recalculateScores() {
        const contestName = document.getElementById('scoringContestName').value;
        if (!contestName) {
            this.showNotification('大会を選択してください', 'error');
            return;
        }

        const className = document.getElementById('scoringClassName').value;
        const excludeMinMax = document.getElementById('scoringExcludeMinMax').checked;

        const targetDesc = className ? `${contestName} / ${className}` : `${contestName}（全クラス）`;
        if (!confirm(`「${targetDesc}」の採点を再計算します。よろしいですか？`)) {
            return;
        }

        try {
            document.getElementById('recalculateBtn').disabled = true;
            document.getElementById('scoringStatus').className = 'import-status';
            document.getElementById('scoringStatus').textContent = '再計算中...';

            const response = await authFetch(`${this.apiUrl}/recalculate`, {
                method: 'POST',
                body: JSON.stringify({ contestName, className, excludeMinMax })
            });

            const result = await response.json();

            if (result.success) {
                const { message } = result.data;
                this.showNotification(message, 'success');
                document.getElementById('scoringStatus').textContent = message;

                this.loadJudges();

                setTimeout(() => {
                    this.closeScoringModal();
                }, 2000);
            } else {
                this.showNotification(result.error, 'error');
                document.getElementById('scoringStatus').textContent = '再計算に失敗しました';
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
            document.getElementById('scoringStatus').textContent = 'エラーが発生しました';
        } finally {
            document.getElementById('recalculateBtn').disabled = false;
        }
    }

    // --- モーダル操作 ---

    openModal(judgeId = null) {
        this.editingId = judgeId;

        if (judgeId) {
            document.getElementById('modalTitle').textContent = '審判採点データを編集';
            this.loadJudgeData(judgeId);
        } else {
            document.getElementById('modalTitle').textContent = '審判採点データを追加';
            document.getElementById('judgeForm').reset();
            document.getElementById('judgeId').value = '';
            document.getElementById('modalContestDate').value = '';
        }

        // コンテスト選択肢を設定
        this.populateContestSelect('modalContestName');

        document.getElementById('judgeModal').classList.remove('hidden');
    }

    closeModal() {
        document.getElementById('judgeModal').classList.add('hidden');
        document.getElementById('judgeForm').reset();
        this.editingId = null;
    }

    async loadJudgeData(id) {
        try {
            const response = await authFetch(`${this.apiUrl}/${id}`);
            const result = await response.json();

            if (result.success) {
                const judge = result.data;
                document.getElementById('judgeId').value = judge.id;
                document.getElementById('modalContestName').value = judge.contest_name;
                document.getElementById('modalContestDate').value = judge.contest_date || '';
                document.getElementById('modalClassName').value = judge.class_name;
                document.getElementById('modalPlayerNo').value = judge.player_no;
                document.getElementById('modalPlayerName').value = judge.player_name || '';
                document.getElementById('modalScoreJ1').value = judge.score_j1 != null ? judge.score_j1 : '';
                document.getElementById('modalScoreJ2').value = judge.score_j2 != null ? judge.score_j2 : '';
                document.getElementById('modalScoreJ3').value = judge.score_j3 != null ? judge.score_j3 : '';
                document.getElementById('modalScoreJ4').value = judge.score_j4 != null ? judge.score_j4 : '';
                document.getElementById('modalScoreJ5').value = judge.score_j5 != null ? judge.score_j5 : '';
                document.getElementById('modalScoreJ6').value = judge.score_j6 != null ? judge.score_j6 : '';
                document.getElementById('modalScoreJ7').value = judge.score_j7 != null ? judge.score_j7 : '';
            } else {
                this.showNotification('データの取得に失敗しました', 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました', 'error');
        }
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);

        if (!data.id) {
            delete data.id;
        }

        try {
            const method = this.editingId ? 'PUT' : 'POST';
            const url = this.editingId ? `${this.apiUrl}/${this.editingId}` : this.apiUrl;

            const response = await authFetch(url, {
                method,
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification(
                    this.editingId ? '審判採点データを更新しました' : '審判採点データを追加しました',
                    'success'
                );
                this.closeModal();
                this.loadJudges();
            } else {
                this.showNotification(result.error || '保存に失敗しました', 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    // --- 削除/復元 ---

    async deleteJudge(id) {
        if (!confirm('この審判採点データを削除しますか？')) return;

        try {
            const response = await authFetch(`${this.apiUrl}/${id}`, {
                method: 'DELETE'
            });
            const result = await response.json();

            if (result.success) {
                this.showNotification('審判採点データを削除しました', 'success');
                this.loadJudges();
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    async permanentDeleteJudge(id) {
        if (!confirm('この審判採点データを完全に削除しますか？この操作は元に戻せません。')) return;

        try {
            const response = await authFetch(`${this.apiUrl}/${id}/permanent`, {
                method: 'DELETE'
            });
            const result = await response.json();

            if (result.success) {
                this.showNotification('審判採点データを完全に削除しました', 'success');
                this.loadJudges();
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    async restoreJudge(id) {
        try {
            const response = await authFetch(`${this.apiUrl}/${id}/restore`, {
                method: 'PUT'
            });
            const result = await response.json();

            if (result.success) {
                this.showNotification('審判採点データを復元しました', 'success');
                this.loadJudges();
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    editJudge(id) {
        this.openModal(id);
    }

    // --- インポート/エクスポート ---

    openImportModal() {
        document.getElementById('importModal').classList.remove('hidden');

        // 大会選択肢を設定
        this.populateContestSelect('importContestName');

        // フォームをリセット
        document.getElementById('importClassName').value = '';
        document.getElementById('importCsvFile').value = '';
        document.getElementById('importBtn').disabled = true;
        document.getElementById('importStatus').className = 'import-status hidden';
        this.selectedImportFile = null;
    }

    openRegistrationImportModal() {
        document.getElementById('registrationImportModal').classList.remove('hidden');
        this.populateContestSelect('regImportContestName');
        document.getElementById('regImportBtn').disabled = true;
        document.getElementById('regImportStatus').className = 'import-status hidden';
    }

    closeRegistrationImportModal() {
        document.getElementById('registrationImportModal').classList.add('hidden');
    }

    async importFromRegistrations() {
        const contestName = document.getElementById('regImportContestName').value;

        if (!contestName) {
            this.showNotification('大会を選択してください', 'error');
            return;
        }

        if (!confirm(`「${contestName}」の出場登録データからインポートします。\n同じ大会の既存審判採点データは上書きされます。\nよろしいですか？`)) {
            return;
        }

        try {
            document.getElementById('regImportBtn').disabled = true;
            document.getElementById('regImportStatus').className = 'import-status';
            document.getElementById('regImportStatus').textContent = 'インポート中...';

            const response = await authFetch(`${this.apiUrl}/import-from-registrations`, {
                method: 'POST',
                body: JSON.stringify({ contestName })
            });

            const result = await response.json();

            if (result.success) {
                const { message } = result.data;
                this.showNotification(message, 'success');
                document.getElementById('regImportStatus').textContent = message;

                await this.loadFilterOptions();
                this.loadJudges();

                setTimeout(() => {
                    this.closeRegistrationImportModal();
                }, 2000);
            } else {
                this.showNotification(result.error, 'error');
                document.getElementById('regImportStatus').textContent = 'インポートに失敗しました';
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
            document.getElementById('regImportStatus').textContent = 'エラーが発生しました';
        } finally {
            document.getElementById('regImportBtn').disabled = false;
        }
    }

    closeImportModal() {
        document.getElementById('importModal').classList.add('hidden');
        this.selectedImportFile = null;
    }

    populateContestSelect(selectId) {
        const contestSelect = document.getElementById(selectId);
        contestSelect.innerHTML = '<option value="">大会を選択してください</option>';

        const contests = Array.from(this.contestsMap.entries())
            .sort((a, b) => new Date(b[1].date) - new Date(a[1].date));

        contests.forEach(([name, data]) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = `${name} (${data.date})`;
            contestSelect.appendChild(option);
        });
    }

    handleImportFileSelect(e) {
        const file = e.target.files[0];

        if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
            this.selectedImportFile = file;
        } else {
            this.selectedImportFile = null;
            if (file) {
                this.showNotification('CSVファイルを選択してください', 'error');
            }
        }
        this.updateImportButtonState();
    }

    updateImportButtonState() {
        const contestName = document.getElementById('importContestName').value;
        const className = document.getElementById('importClassName').value.trim();
        const importBtn = document.getElementById('importBtn');

        importBtn.disabled = !(contestName && className && this.selectedImportFile);
    }

    async importCsv() {
        const contestName = document.getElementById('importContestName').value;
        const className = document.getElementById('importClassName').value.trim();

        if (!contestName) {
            this.showNotification('大会を選択してください', 'error');
            return;
        }
        if (!className) {
            this.showNotification('クラス名を入力してください', 'error');
            return;
        }
        if (!this.selectedImportFile) {
            this.showNotification('CSVファイルを選択してください', 'error');
            return;
        }

        try {
            const csvText = await this.readFileAsText(this.selectedImportFile);

            document.getElementById('importBtn').disabled = true;
            document.getElementById('importStatus').className = 'import-status';
            document.getElementById('importStatus').textContent = 'インポート中...';

            const contestData = this.contestsMap.get(contestName);
            const contestDate = contestData ? contestData.date : '';

            const response = await authFetch(`${this.apiUrl}/import`, {
                method: 'POST',
                body: JSON.stringify({
                    csvText,
                    contestName,
                    contestDate,
                    className
                })
            });

            const result = await response.json();

            if (result.success) {
                const { message } = result.data;
                this.showNotification(message, 'success');
                document.getElementById('importStatus').textContent = message;

                await this.loadFilterOptions();
                this.loadJudges();

                setTimeout(() => {
                    this.closeImportModal();
                }, 2000);
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

    async exportCsv() {
        try {
            const params = new URLSearchParams();
            if (this.currentFilters.contest_name) params.set('contest_name', this.currentFilters.contest_name);
            if (this.currentFilters.class_name) params.set('class_name', this.currentFilters.class_name);

            const response = await authFetch(`${this.apiUrl}/export?${params.toString()}`, {
                headers: AuthToken.getHeaders()
            });

            if (!response.ok) {
                throw new Error('エクスポートに失敗しました');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'judges_export.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();

            this.showNotification('CSVエクスポートが完了しました', 'success');
        } catch (error) {
            this.showNotification('エクスポートエラー: ' + error.message, 'error');
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

    // --- フィルター/検索/ソート/ページネーション ---

    applyFilters() {
        this.currentFilters = {};

        const contestName = document.getElementById('contestFilter').value;
        const className = document.getElementById('classFilter').value;
        const showInvalid = document.getElementById('showInvalidToggle').checked;

        if (contestName) this.currentFilters.contest_name = contestName;
        if (className) this.currentFilters.class_name = className;
        if (showInvalid) this.currentFilters.showInvalid = 'true';

        // 検索テキストを維持
        const searchTerm = document.getElementById('searchInput').value.trim();
        if (searchTerm) this.currentFilters.search = searchTerm;

        this.currentPage = 1;
        this.loadJudges(1);
    }

    clearFilters() {
        document.getElementById('contestFilter').selectedIndex = 0;
        document.getElementById('classFilter').selectedIndex = 0;
        document.getElementById('showInvalidToggle').checked = false;
        document.getElementById('searchInput').value = '';
        document.getElementById('clearSearchBtn').classList.add('hidden');

        this.currentFilters = {};
        this.currentPage = 1;
        this.loadJudges(1);
    }

    handleSearch(searchTerm) {
        if (searchTerm.trim()) {
            this.currentFilters.search = searchTerm;
        } else {
            delete this.currentFilters.search;
        }
        this.currentPage = 1;
        this.loadJudges();
    }

    clearSearch() {
        document.getElementById('searchInput').value = '';
        document.getElementById('clearSearchBtn').classList.add('hidden');
        this.handleSearch('');
    }

    sortBy(column) {
        if (this.currentSort.column === column) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.column = column;
            this.currentSort.direction = 'asc';
        }
        this.currentPage = 1;
        this.loadJudges(1);
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
            await this.loadJudges(this.currentPage - 1);
        }
    }

    async nextPage() {
        if (this.currentPage < this.totalPages) {
            await this.loadJudges(this.currentPage + 1);
        }
    }

    // --- ユーティリティ ---

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

    async handleLogout() {
        try {
            await authFetch('/api/auth/logout', { method: 'POST' });
            AuthToken.remove();
            window.location.href = '/';
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

const judgesManager = new JudgesManager();
