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

class NotesManager {
    constructor() {
        console.log('NOTES: NotesManager constructor called');
        this.apiUrl = '/api/notes';
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
        this.editingNoteId = null;
        this.defaultContest = null; // 今日以降の最も近い大会
        console.log('NOTES: About to call init()');
        this.init();
    }

    async init() {
        console.log('NOTES: init() method started');
        await this.checkAuthStatus();
        console.log('NOTES: checkAuthStatus completed');
        this.bindEvents();
        console.log('NOTES: bindEvents completed');
        if (this.currentUser) {
            console.log('NOTES: User exists, loading data in 100ms...');
            setTimeout(async () => {
                console.log('NOTES: Loading filter options and notes...');
                await this.loadFilterOptions();
                await this.loadNotes();
                console.log('NOTES: Data loading completed');
            }, 100);
        } else {
            console.log('NOTES: No user found, skipping data loading');
        }
    }

    async checkAuthStatus() {
        try {
            console.log('=== NOTES PAGE: checkAuthStatus START ===');
            const token = AuthToken.get();
            console.log('NOTES: Token exists in localStorage:', !!token);

            console.log('NOTES: Calling /api/auth/status...');
            const response = await authFetch('/api/auth/status');
            console.log('NOTES: Auth status response status:', response.status);

            const result = await response.json();
            console.log('NOTES: Auth status result:', result);

            if (!result.isAuthenticated) {
                console.log('NOTES: User NOT authenticated, redirecting to /...');
                AuthToken.remove();
                window.location.href = '/';
                return;
            }

            this.currentUser = result.user;
            this.isAdmin = result.user.role === 'admin';

            console.log('NOTES: User authenticated successfully');
            console.log('NOTES: Is admin:', this.isAdmin);

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

            console.log('NOTES: Auth header displayed');

        } catch (error) {
            console.error('NOTES: Auth check failed:', error);
            AuthToken.remove();
            window.location.href = '/';
        }
    }

    bindEvents() {
        // 基本操作ボタン
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadNotes();
        });

        document.getElementById('addNoteBtn').addEventListener('click', () => {
            this.openNoteModal();
        });

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
                this.loadNotes();
            }
        });

        document.getElementById('nextPageBtn').addEventListener('click', () => {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
                this.loadNotes();
            }
        });

        // フォーム送信
        document.getElementById('noteForm').addEventListener('submit', (e) => {
            this.handleFormSubmit(e);
        });

        // 検索ボタン
        document.getElementById('searchRegistrationBtn').addEventListener('click', () => {
            this.searchRegistration();
        });

        // 検索ボタンの有効/無効を制御する入力監視
        ['contestName', 'playerNo', 'fwjCardNo', 'npcMemberNo'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => {
                console.log(`Input event triggered on field: ${id}`);
                this.updateSearchButtonState();
            });
        });

        // 大会名の変更を監視して開催日を自動設定
        document.getElementById('contestName').addEventListener('change', (e) => {
            this.onContestNameChange(e.target.value);
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
                const { contestNames, types } = result.data;

                this.populateFilterSelect('contestFilter', contestNames);
                this.populateFilterSelect('typeFilter', types);
            }

            // NotesとRegistrationsの両方から大会名を取得
            await this.loadCombinedContestNames();

            // 今日以降で最も近い大会をフィルターの初期値として設定
            if (this.defaultContest) {
                const [contestName] = this.defaultContest;
                const contestFilter = document.getElementById('contestFilter');
                if (contestFilter) {
                    contestFilter.value = contestName;
                    // フィルターを適用
                    this.currentFilters.contest_name = contestName;
                }
            }
        } catch (error) {
            console.error('Filter options loading failed:', error);
        }
    }

    async loadCombinedContestNames() {
        try {
            // Contestsシートからデータを取得
            console.log('NOTES: Loading contests from API...');
            const contestsResponse = await authFetch('/api/contests');
            const contestsResult = await contestsResponse.json();

            console.log('NOTES: Contests API response:', contestsResult);

            if (!contestsResult.success || !contestsResult.data) {
                console.error('Failed to load contests');
                return;
            }

            console.log('NOTES: Contests data received:', contestsResult.data);

            // コンテストデータを保存（大会名と開催日のマップ）
            this.contestsMap = new Map();
            contestsResult.data.forEach(contest => {
                if (contest.contest_name && contest.contest_date) {
                    this.contestsMap.set(contest.contest_name, contest.contest_date);
                    console.log(`NOTES: Added to contestsMap: "${contest.contest_name}" -> "${contest.contest_date}"`);
                }
            });

            console.log('NOTES: contestsMap size:', this.contestsMap.size);
            console.log('NOTES: contestsMap contents:', Array.from(this.contestsMap.entries()));

            // 開催日順にソート済み（APIで降順でソート済み）
            const sortedContests = contestsResult.data
                .filter(c => c.contest_name && c.contest_date)
                .map(c => [c.contest_name, c.contest_date]);

            // datalistに設定
            this.populateContestNameDatalist(sortedContests);

            // 今日以降の最も近い大会を保存
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const upcomingContests = sortedContests
                .filter(([name, date]) => new Date(date) >= today)
                .sort((a, b) => new Date(a[1]) - new Date(b[1])); // 昇順：古い順

            this.defaultContest = upcomingContests.length > 0 ? upcomingContests[0] : null;

        } catch (error) {
            console.error('Contest names loading failed:', error);
        }
    }

    populateContestNameDatalist(sortedContests) {
        const contestSelect = document.getElementById('contestName');
        if (!contestSelect) return;

        // 最初のオプション（プレースホルダー）を保持
        contestSelect.innerHTML = '<option value="">大会を選択してください</option>';

        sortedContests.forEach(([name, date]) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            option.setAttribute('data-date', date);
            contestSelect.appendChild(option);
        });
    }

    // 大会名が選択されたときに開催日を自動設定
    onContestNameChange(contestName) {
        console.log('NOTES: onContestNameChange called with:', contestName);
        console.log('NOTES: contestsMap exists:', !!this.contestsMap);
        console.log('NOTES: contestsMap size:', this.contestsMap ? this.contestsMap.size : 'N/A');

        if (this.contestsMap && this.contestsMap.has(contestName)) {
            const contestDate = this.contestsMap.get(contestName);
            console.log('NOTES: Found contest date:', contestDate);

            // 日付フォーマットを yyyy/MM/dd から yyyy-MM-dd に変換
            const formattedDate = this.formatDateForInput(contestDate);
            console.log('NOTES: Formatted date:', formattedDate);

            document.getElementById('contestDate').value = formattedDate;
            console.log('NOTES: Set contestDate input to:', formattedDate);
        } else {
            console.log('NOTES: Contest not found in map or map does not exist');
            if (this.contestsMap) {
                console.log('NOTES: Available contest names:', Array.from(this.contestsMap.keys()));
            }
        }
    }

    // 日付を yyyy/MM/dd から yyyy-MM-dd に変換
    formatDateForInput(dateString) {
        if (!dateString) return '';

        // スラッシュをハイフンに置換
        return dateString.replace(/\//g, '-');
    }

    populateFilterSelect(selectId, options) {
        const select = document.getElementById(selectId);
        const currentValue = select.value;

        // 最初のオプション（プレースホルダー）を保持
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

    async loadNotes() {
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
                this.displayNotes(result.data);
                this.updatePagination(result);
            } else {
                this.showNotification('データの読み込みに失敗しました', 'error');
            }
        } catch (error) {
            console.error('Notes loading failed:', error);
            this.showNotification('エラーが発生しました', 'error');
        }
    }

    displayNotes(notes) {
        const container = document.getElementById('notesTableContainer');

        if (notes.length === 0) {
            container.innerHTML = '<div class="no-data">特記事項が見つかりません</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'data-table';

        // ヘッダー作成
        const headerRow = document.createElement('tr');
        const headers = [
            { key: 'contest_date', label: '開催日' },
            { key: 'contest_name', label: '大会名' },
            { key: 'name_ja', label: '氏名' },
            { key: 'type', label: 'タイプ' },
            { key: 'player_no', label: 'ゼッケン番号' },
            { key: 'fwj_card_no', label: 'FWJカード' },
            { key: 'npc_member_no', label: 'NPC番号' },
            { key: 'note', label: 'メモ' }
        ];

        headers.forEach(header => {
            const th = document.createElement('th');
            th.className = 'sortable';
            th.setAttribute('data-column', header.key);
            th.innerHTML = `${header.label}${this.getSortIcon(header.key)}`;
            th.addEventListener('click', () => this.sortBy(header.key));
            headerRow.appendChild(th);
        });

        // 操作列を追加（全ユーザー）
        const actionTh = document.createElement('th');
        actionTh.textContent = '操作';
        headerRow.appendChild(actionTh);

        table.appendChild(headerRow);

        // データ行作成
        notes.forEach(note => {
            const row = document.createElement('tr');
            if (note.isValid === 'FALSE') {
                row.classList.add('deleted-row');
            }

            headers.forEach(header => {
                const td = document.createElement('td');
                let value = note[header.key] || '';

                if (header.key === 'contest_date' && value) {
                    value = new Date(value).toLocaleDateString('ja-JP');
                }

                // メモが長い場合は省略表示
                if (header.key === 'note' && value && value.length > 50) {
                    value = value.substring(0, 50) + '...';
                }

                td.textContent = value;
                row.appendChild(td);
            });

            // 操作列を追加（全ユーザー）
            const actionTd = document.createElement('td');
            actionTd.innerHTML = this.createActionButtons(note);
            row.appendChild(actionTd);

            table.appendChild(row);
        });

        container.innerHTML = '';
        container.appendChild(table);
    }

    createActionButtons(note) {
        let buttons = '';

        if (note.isValid === 'FALSE') {
            buttons += `<button class="btn btn-sm btn-success" onclick="notesManager.restoreNote('${note.id}')">復元</button>`;
            // 完全削除は管理者のみ
            if (this.isAdmin) {
                buttons += `<button class="btn btn-sm btn-danger" onclick="notesManager.permanentDeleteNote('${note.id}')">完全削除</button>`;
            }
        } else {
            buttons += `<button class="btn btn-sm btn-primary" onclick="notesManager.editNote('${note.id}')">編集</button>`;
            buttons += `<button class="btn btn-sm btn-warning" onclick="notesManager.softDeleteNote('${note.id}')">削除</button>`;
        }

        return buttons;
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
        this.loadNotes();
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
            type: document.getElementById('typeFilter').value,
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value
        };

        // 空の値を削除
        Object.keys(this.currentFilters).forEach(key => {
            if (!this.currentFilters[key]) {
                delete this.currentFilters[key];
            }
        });

        this.currentPage = 1;
        this.loadNotes();
    }

    clearFilters() {
        document.getElementById('contestFilter').value = '';
        document.getElementById('typeFilter').value = '';
        document.getElementById('startDate').value = '';
        document.getElementById('endDate').value = '';
        document.getElementById('searchInput').value = '';
        document.getElementById('clearSearchBtn').classList.add('hidden');

        this.currentFilters = {};
        this.currentPage = 1;
        this.loadNotes();
    }

    handleSearch(searchTerm) {
        if (searchTerm.trim()) {
            this.currentFilters.search = searchTerm;
        } else {
            delete this.currentFilters.search;
        }
        this.currentPage = 1;
        this.loadNotes();
    }

    openNoteModal(noteId = null) {
        console.log('=== openNoteModal DEBUG ===');
        console.log('noteId:', noteId);
        console.log('editingNoteId will be set to:', noteId);

        this.editingNoteId = noteId;

        if (noteId) {
            console.log('Opening modal in EDIT mode');
            document.getElementById('modalTitle').textContent = '特記事項を編集';
            this.loadNoteData(noteId);
        } else {
            console.log('Opening modal in ADD mode');
            document.getElementById('modalTitle').textContent = '特記事項を追加';
            document.getElementById('noteForm').reset();
            document.getElementById('noteId').value = '';

            // 新規追加時のデフォルト値を設定
            if (this.defaultContest) {
                const [contestName, contestDate] = this.defaultContest;
                console.log('Setting default contest:', contestName, contestDate);
                document.getElementById('contestName').value = contestName;
                document.getElementById('contestDate').value = this.formatDateForInput(contestDate);
            }
        }

        console.log('Calling updateSearchButtonState from openNoteModal');
        this.updateSearchButtonState();
        document.getElementById('noteModal').classList.remove('hidden');
        console.log('Modal opened');
        console.log('===========================');
    }

    updateSearchButtonState() {
        const contestName = document.getElementById('contestName').value.trim();
        const playerNo = document.getElementById('playerNo').value.trim();
        const fwjCardNo = document.getElementById('fwjCardNo').value.trim();
        const npcMemberNo = document.getElementById('npcMemberNo').value.trim();

        const hasContest = contestName !== '';
        const hasAnyNumber = playerNo !== '' || fwjCardNo !== '' || npcMemberNo !== '';

        console.log('=== updateSearchButtonState DEBUG ===');
        console.log('contestName:', contestName);
        console.log('playerNo:', playerNo);
        console.log('fwjCardNo:', fwjCardNo);
        console.log('npcMemberNo:', npcMemberNo);
        console.log('hasContest:', hasContest);
        console.log('hasAnyNumber:', hasAnyNumber);
        console.log('Button should be enabled:', hasContest && hasAnyNumber);

        const searchBtn = document.getElementById('searchRegistrationBtn');
        searchBtn.disabled = !(hasContest && hasAnyNumber);
        console.log('Button disabled state:', searchBtn.disabled);
        console.log('=====================================');
    }

    async searchRegistration() {
        console.log('=== searchRegistration DEBUG ===');
        const contestName = document.getElementById('contestName').value.trim();
        const playerNo = document.getElementById('playerNo').value.trim();
        const fwjCardNo = document.getElementById('fwjCardNo').value.trim();
        const npcMemberNo = document.getElementById('npcMemberNo').value.trim();

        console.log('Search parameters:');
        console.log('  contestName:', contestName);
        console.log('  playerNo:', playerNo);
        console.log('  fwjCardNo:', fwjCardNo);
        console.log('  npcMemberNo:', npcMemberNo);

        if (!contestName || (!playerNo && !fwjCardNo && !npcMemberNo)) {
            console.log('ERROR: Missing required fields');
            this.showNotification('検索には大会名といずれかの番号が必要です', 'error');
            return;
        }

        try {
            // 検索条件を構築（新しい検索専用エンドポイントを使用）
            const params = new URLSearchParams({
                contest_name: contestName
            });

            // 番号パラメータを追加
            if (playerNo) params.append('player_no', playerNo);
            if (fwjCardNo) params.append('fwj_card_no', fwjCardNo);
            if (npcMemberNo) params.append('npc_member_no', npcMemberNo);

            const apiUrl = `/api/registrations/search/by-number?${params}`;
            console.log('API URL:', apiUrl);
            console.log('Calling API...');

            const response = await authFetch(apiUrl);
            console.log('API response status:', response.status);
            console.log('API response ok:', response.ok);

            const result = await response.json();
            console.log('API result:', result);
            console.log('Result success:', result.success);

            if (!result.success) {
                console.log('ERROR: Search failed');
                console.log('Error message:', result.error);
                this.showNotification(result.error || '該当する選手が見つかりません', 'error');
                console.log('================================');
                return;
            }

            console.log('Found matching record:', result.data);
            const foundRecord = result.data;

            // フォームに値を設定
            if (foundRecord.contest_date) {
                document.getElementById('contestDate').value = this.formatDateForInput(foundRecord.contest_date);
                console.log('Set contestDate:', foundRecord.contest_date);
            }
            if (foundRecord.player_no) {
                document.getElementById('playerNo').value = foundRecord.player_no;
                console.log('Set playerNo:', foundRecord.player_no);
            }
            if (foundRecord.fwj_card_no) {
                document.getElementById('fwjCardNo').value = foundRecord.fwj_card_no;
                console.log('Set fwjCardNo:', foundRecord.fwj_card_no);
            }
            if (foundRecord.npc_member_no) {
                document.getElementById('npcMemberNo').value = foundRecord.npc_member_no;
                console.log('Set npcMemberNo:', foundRecord.npc_member_no);
            }
            if (foundRecord.name_ja) {
                document.getElementById('nameJa').value = foundRecord.name_ja;
                console.log('Set nameJa:', foundRecord.name_ja);
            }
            if (foundRecord.email) {
                document.getElementById('email').value = foundRecord.email;
                console.log('Set email:', foundRecord.email);
            }
            // 出場登録データにはphoneフィールドがないので設定しない

            console.log('SUCCESS: Form populated with registration data');
            this.showNotification('出場登録データから情報を取得しました', 'success');

        } catch (error) {
            console.error('EXCEPTION in searchRegistration:', error);
            console.error('Error stack:', error.stack);
            this.showNotification('検索中にエラーが発生しました', 'error');
        }
        console.log('================================');
    }

    closeNoteModal() {
        document.getElementById('noteModal').classList.add('hidden');
        document.getElementById('noteForm').reset();
        this.editingNoteId = null;
    }

    async loadNoteData(noteId) {
        console.log('=== loadNoteData DEBUG ===');
        console.log('Loading note ID:', noteId);

        try {
            const response = await authFetch(`${this.apiUrl}/${noteId}`);
            const result = await response.json();

            console.log('API response:', result);

            if (result.success) {
                const note = result.data;
                console.log('Note data:', note);

                document.getElementById('noteId').value = note.id;
                // 日付フォーマットを yyyy/MM/dd から yyyy-MM-dd に変換
                document.getElementById('contestDate').value = this.formatDateForInput(note.contest_date) || '';
                document.getElementById('contestName').value = note.contest_name || '';
                document.getElementById('nameJa').value = note.name_ja || '';
                document.getElementById('noteType').value = note.type || '';
                document.getElementById('playerNo').value = note.player_no || '';
                document.getElementById('fwjCardNo').value = note.fwj_card_no || '';
                document.getElementById('npcMemberNo').value = note.npc_member_no || '';
                document.getElementById('email').value = note.email || '';
                document.getElementById('phone').value = note.phone || '';
                document.getElementById('noteDetail').value = note.note || '';

                console.log('Form fields populated. Calling updateSearchButtonState...');
                // データ読み込み後にボタンの状態を更新
                this.updateSearchButtonState();
            } else {
                console.error('Failed to load note data:', result.error);
                this.showNotification('特記事項の取得に失敗しました', 'error');
            }
        } catch (error) {
            console.error('Load note data failed:', error);
            this.showNotification('エラーが発生しました', 'error');
        }
        console.log('==========================');
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);

        // IDフィールドを除外（空の場合）
        if (!data.id) {
            delete data.id;
        }

        try {
            const method = this.editingNoteId ? 'PUT' : 'POST';
            const url = this.editingNoteId ? `${this.apiUrl}/${this.editingNoteId}` : this.apiUrl;

            const response = await authFetch(url, {
                method,
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification(
                    this.editingNoteId ? '特記事項を更新しました' : '特記事項を追加しました',
                    'success'
                );
                this.closeNoteModal();
                this.loadNotes();
            } else {
                const errorMessage = result.errors ? result.errors.join(', ') : result.error;
                this.showNotification(errorMessage || '保存に失敗しました', 'error');
            }
        } catch (error) {
            console.error('Save failed:', error);
            this.showNotification('エラーが発生しました', 'error');
        }
    }

    async editNote(id) {
        this.openNoteModal(id);
    }

    async softDeleteNote(id) {
        if (!confirm('この特記事項を削除しますか？')) return;

        try {
            const response = await authFetch(`${this.apiUrl}/${id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('特記事項を削除しました', 'success');
                this.loadNotes();
            } else {
                this.showNotification(result.error || '削除に失敗しました', 'error');
            }
        } catch (error) {
            console.error('Delete failed:', error);
            this.showNotification('エラーが発生しました', 'error');
        }
    }

    async restoreNote(id) {
        try {
            const response = await authFetch(`${this.apiUrl}/${id}/restore`, {
                method: 'PUT'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('特記事項を復元しました', 'success');
                this.loadNotes();
            } else {
                this.showNotification(result.error || '復元に失敗しました', 'error');
            }
        } catch (error) {
            console.error('Restore failed:', error);
            this.showNotification('エラーが発生しました', 'error');
        }
    }

    async permanentDeleteNote(id) {
        if (!confirm('この特記事項を完全に削除しますか？この操作は取り消せません。')) return;

        try {
            const response = await authFetch(`${this.apiUrl}/${id}/permanent`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('特記事項を完全に削除しました', 'success');
                this.loadNotes();
            } else {
                this.showNotification(result.error || '削除に失敗しました', 'error');
            }
        } catch (error) {
            console.error('Permanent delete failed:', error);
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
console.log('NOTES: Script loaded, creating NotesManager instance');
const notesManager = new NotesManager();
console.log('NOTES: NotesManager instance created');
