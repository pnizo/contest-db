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

class RegistrationsManager {
    constructor() {
        console.log('REGISTRATIONS: RegistrationsManager constructor called');
        this.apiUrl = '/api/registrations';
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
        console.log('REGISTRATIONS: About to call init()');
        this.init();
    }

    async init() {
        console.log('REGISTRATIONS: init() method started');
        await this.checkAuthStatus();
        console.log('REGISTRATIONS: checkAuthStatus completed');
        this.bindEvents();
        console.log('REGISTRATIONS: bindEvents completed');
        if (this.currentUser) {
            console.log('REGISTRATIONS: User exists, loading data in 100ms...');
            setTimeout(async () => {
                console.log('REGISTRATIONS: Loading filter options and registrations...');
                await this.loadFilterOptions();
                await this.loadRegistrations();
                console.log('REGISTRATIONS: Data loading completed');
            }, 100);
        } else {
            console.log('REGISTRATIONS: No user found, skipping data loading');
        }
    }

    async checkAuthStatus() {
        try {
            console.log('=== REGISTRATIONS PAGE: checkAuthStatus START ===');
            const token = AuthToken.get();
            console.log('REGISTRATIONS: Token exists in localStorage:', !!token);
            if (token) {
                console.log('REGISTRATIONS: Token preview:', token.substring(0, 20) + '...');
            }

            console.log('REGISTRATIONS: Calling /api/auth/status...');
            const response = await authFetch('/api/auth/status');
            console.log('REGISTRATIONS: Auth status response status:', response.status);
            
            const result = await response.json();
            console.log('REGISTRATIONS: Auth status result:', result);
            
            if (!result.isAuthenticated) {
                console.log('REGISTRATIONS: User NOT authenticated, redirecting to / in 10 seconds...');
                AuthToken.remove();
                setTimeout(() => {
                    console.log('REGISTRATIONS: Executing redirect to /');
                    window.location.href = '/';
                }, 10000); // 10秒のタイムアウト
                return;
            }
            
            this.currentUser = result.user;
            this.isAdmin = result.user.role === 'admin';
            
            console.log('REGISTRATIONS: User authenticated successfully');
            console.log('REGISTRATIONS: Full user object:', result.user);
            console.log('REGISTRATIONS: User name:', result.user.name);
            console.log('REGISTRATIONS: User username:', result.user.username);
            console.log('REGISTRATIONS: User role:', result.user.role);
            console.log('REGISTRATIONS: Is admin:', this.isAdmin);
            
            // nameとusernameがundefinedの場合はemailを使用
            const displayName = result.user.name || result.user.username || result.user.email || 'Unknown';
            
            document.getElementById('userName').textContent = displayName;
            document.getElementById('userRole').textContent = result.user.role === 'admin' ? '管理者' : 'ユーザー';
            document.getElementById('userAvatar').textContent = displayName.charAt(0).toUpperCase();
            document.getElementById('authHeader').style.display = 'flex';
            
            console.log('REGISTRATIONS: Auth header displayed');
            
        } catch (error) {
            console.error('REGISTRATIONS: Auth check failed:', error);
            console.error('REGISTRATIONS: Error details:', error.stack);
            console.log('REGISTRATIONS: Continuing without redirect to debug the issue');
            // AuthToken.remove();
            // setTimeout(() => {
            //     console.log('REGISTRATIONS: Executing redirect to / due to error');
            //     window.location.href = '/';
            // }, 10000); // エラー時も10秒待機
        }
    }

    bindEvents() {
        // モーダル関連のイベント
        document.getElementById('importModalBtn').addEventListener('click', () => {
            this.openImportModal();
        });

        document.getElementById('exportModalBtn').addEventListener('click', () => {
            this.openExportModal();
        });

        document.getElementById('modalCsvFile').addEventListener('change', (e) => {
            this.handleModalFileSelect(e);
        });

        document.getElementById('modalImportBtn').addEventListener('click', () => {
            this.handleModalImport();
        });

        document.getElementById('modalExportBtn').addEventListener('click', () => {
            this.handleModalExport();
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadRegistrations();
        });

        // 削除済み表示機能を削除
        // document.getElementById('toggleDeletedBtn').addEventListener('click', () => {
        //     this.toggleDeletedRecords();
        // });

        document.getElementById('applyFiltersBtn').addEventListener('click', () => {
            this.applyFilters();
        });

        document.getElementById('clearFiltersBtn').addEventListener('click', () => {
            this.clearFilters();
        });

        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        document.getElementById('clearSearchBtn').addEventListener('click', () => {
            document.getElementById('searchInput').value = '';
            this.handleSearch('');
        });

        document.getElementById('prevPageBtn').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadRegistrations();
            }
        });

        document.getElementById('nextPageBtn').addEventListener('click', () => {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
                this.loadRegistrations();
            }
        });

        // 編集フォーム機能を削除
        // document.getElementById('editRegistrationForm').addEventListener('submit', (e) => {
        //     this.handleEditSubmit(e);
        // });

        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });
    }

    // モーダル関連のメソッド
    openImportModal() {
        document.getElementById('importModal').classList.remove('hidden');
        // フォームをリセット
        document.getElementById('modalContestDate').value = '';
        document.getElementById('modalContestName').value = '';
        document.getElementById('modalCsvFile').value = '';
        document.getElementById('modalImportBtn').disabled = true;
        document.getElementById('modalImportStatus').className = 'import-status hidden';
        this.selectedModalFile = null;
        
        // モーダル内の入力監視イベントを設定（重複回避のため一度削除してから追加）
        const contestDateEl = document.getElementById('modalContestDate');
        const contestNameEl = document.getElementById('modalContestName');
        
        // 既存のイベントリスナーを削除（もしあれば）
        contestDateEl.removeEventListener('input', this.validateModalImportFormBound);
        contestNameEl.removeEventListener('input', this.validateModalImportFormBound);
        
        // 新しいイベントリスナーを追加
        this.validateModalImportFormBound = () => this.validateModalImportForm();
        contestDateEl.addEventListener('input', this.validateModalImportFormBound);
        contestNameEl.addEventListener('input', this.validateModalImportFormBound);
    }

    closeImportModal() {
        document.getElementById('importModal').classList.add('hidden');
        this.selectedModalFile = null;
    }

    // エクスポートモーダル関連のメソッド
    async openExportModal() {
        document.getElementById('exportModal').classList.remove('hidden');
        // フォームをリセット
        document.getElementById('exportType').value = '';
        document.getElementById('exportContestName').value = '';
        document.getElementById('modalExportBtn').disabled = true;
        document.getElementById('modalExportStatus').className = 'import-status hidden';
        
        // 大会名リストを読み込み
        await this.loadExportContestNames();
        
        // バリデーション用イベントリスナーを設定
        document.getElementById('exportType').addEventListener('change', () => this.validateExportForm());
        document.getElementById('exportContestName').addEventListener('change', () => this.validateExportForm());
    }

    closeExportModal() {
        document.getElementById('exportModal').classList.add('hidden');
    }

    async loadExportContestNames() {
        try {
            const response = await authFetch(`${this.apiUrl}/filter-options`);
            const result = await response.json();
            
            if (result.success) {
                const contestSelect = document.getElementById('exportContestName');
                // 既存のオプションをクリア（最初のoptionは残す）
                contestSelect.innerHTML = '<option value="">大会名を選択</option>';
                
                result.data.contestNames.forEach(contestName => {
                    const option = document.createElement('option');
                    option.value = contestName;
                    option.textContent = contestName;
                    contestSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading contest names for export:', error);
        }
    }

    validateExportForm() {
        const exportType = document.getElementById('exportType').value;
        const contestName = document.getElementById('exportContestName').value;
        const exportBtn = document.getElementById('modalExportBtn');
        
        exportBtn.disabled = !(exportType && contestName);
    }

    async handleModalExport() {
        const exportType = document.getElementById('exportType').value;
        const contestName = document.getElementById('exportContestName').value;

        if (!exportType || !contestName) {
            this.showNotification('エクスポート種類と大会名を選択してください', 'error');
            return;
        }

        try {
            document.getElementById('modalExportBtn').disabled = true;
            document.getElementById('modalExportStatus').className = 'import-status';
            document.getElementById('modalExportStatus').textContent = 'エクスポート準備中...';

            const response = await authFetch(`${this.apiUrl}/export/${exportType}/${encodeURIComponent(contestName)}`);
            const result = await response.json();

            if (result.success) {
                // CSVデータをダウンロード
                this.downloadCSV(result.data, result.filename);
                
                this.showNotification(`${result.data.length}件のデータをエクスポートしました`, 'success');
                document.getElementById('modalExportStatus').textContent = 
                    `エクスポート完了: ${result.data.length}件`;
                
                // モーダルを閉じる
                setTimeout(() => {
                    this.closeExportModal();
                }, 2000);
            } else {
                this.showNotification(result.error, 'error');
                document.getElementById('modalExportStatus').textContent = 'エクスポートに失敗しました';
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
            document.getElementById('modalExportStatus').textContent = 'エラーが発生しました';
        } finally {
            document.getElementById('modalExportBtn').disabled = false;
        }
    }

    downloadCSV(data, filename) {
        if (data.length === 0) {
            this.showNotification('エクスポートするデータがありません', 'error');
            return;
        }

        // CSVヘッダーを取得
        const headers = Object.keys(data[0]);
        
        // CSVコンテンツを生成
        const csvContent = [
            headers.join(','), // ヘッダー行
            ...data.map(row => headers.map(header => {
                const value = row[header] || '';
                // カンマや改行を含む値は引用符で囲む
                return value.toString().includes(',') || value.toString().includes('\n') ? 
                    `"${value.toString().replace(/"/g, '""')}"` : value.toString();
            }).join(','))
        ].join('\n');

        // BOM付きUTF-8でファイルを作成
        const bom = '\uFEFF';
        const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
        
        // ダウンロードリンクを作成
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = filename;
        
        // ダウンロードを実行
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    handleModalFileSelect(e) {
        const file = e.target.files[0];
        const importBtn = document.getElementById('modalImportBtn');
        const contestDate = document.getElementById('modalContestDate').value;
        const contestName = document.getElementById('modalContestName').value;
        
        // CSVとXLSXファイルをサポート
        const isSupportedFile = file && (
            file.type === 'text/csv' || 
            file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.name.toLowerCase().endsWith('.csv') ||
            file.name.toLowerCase().endsWith('.xlsx')
        );
        
        if (isSupportedFile && contestDate && contestName) {
            importBtn.disabled = false;
            this.selectedModalFile = file;
        } else {
            importBtn.disabled = true;
            this.selectedModalFile = null;
            if (file && (!contestDate || !contestName)) {
                this.showNotification('大会開催日と大会名を入力してください', 'error');
            } else if (file && !isSupportedFile) {
                this.showNotification('CSVまたはXLSXファイルを選択してください', 'error');
            }
        }
        
        this.validateModalImportForm();
    }

    validateModalImportForm() {
        const file = this.selectedModalFile;
        const contestDate = document.getElementById('modalContestDate').value;
        const contestName = document.getElementById('modalContestName').value;
        const importBtn = document.getElementById('modalImportBtn');
        
        const shouldEnable = !!(file && contestDate && contestName);
        importBtn.disabled = !shouldEnable;
    }

    async handleModalImport() {
        if (!this.selectedModalFile) {
            this.showNotification('ファイルが選択されていません', 'error');
            return;
        }

        const contestDate = document.getElementById('modalContestDate').value;
        const contestName = document.getElementById('modalContestName').value;

        if (!contestDate || !contestName) {
            this.showNotification('大会開催日と大会名を入力してください', 'error');
            return;
        }

        try {
            const fileName = this.selectedModalFile.name.toLowerCase();
            const isXlsx = fileName.endsWith('.xlsx');
            const isCsv = fileName.endsWith('.csv') || this.selectedModalFile.type === 'text/csv';

            document.getElementById('modalImportBtn').disabled = true;
            document.getElementById('modalImportStatus').className = 'import-status';
            document.getElementById('modalImportStatus').textContent = 'インポート中...';

            let fileData;
            let fileType;

            if (isXlsx) {
                fileData = await this.readFileAsBase64(this.selectedModalFile);
                fileType = 'xlsx';
            } else if (isCsv) {
                const csvText = await this.readFileAsText(this.selectedModalFile);
                fileData = this.parseCSV(csvText);
                fileType = 'csv';
                
                if (fileData.length === 0) {
                    this.showNotification('CSVデータが空です', 'error');
                    return;
                }
            } else {
                this.showNotification('サポートされていないファイル形式です', 'error');
                return;
            }

            const requestData = { 
                fileData, 
                fileType,
                contestDate, 
                contestName 
            };

            const response = await authFetch(`${this.apiUrl}/import`, {
                method: 'POST',
                body: JSON.stringify(requestData)
            });
            
            const result = await response.json();

            if (result.success) {
                const { total, imported, message, contestDate: importedDate, contestName: importedName } = result.data;
                
                this.showNotification(message || `${imported}件の登録データをインポートしました`, 'success');
                document.getElementById('modalImportStatus').textContent = 
                    `インポート完了: ${importedName} (${importedDate}) - ${imported}件`;
                
                await this.loadFilterOptions();
                this.loadRegistrations();
                
                // モーダルを閉じる
                setTimeout(() => {
                    this.closeImportModal();
                }, 2000);
            } else {
                // エラーメッセージを改行で分割して表示
                const errorLines = result.error.split('\n');
                const mainError = errorLines[0];
                const detailError = errorLines.slice(1).join('\n');
                
                this.showNotification(mainError, 'error');
                document.getElementById('modalImportStatus').innerHTML = 
                    detailError ? 
                    `インポートに失敗しました<br><small style="font-size: 0.9em; line-height: 1.3;">${detailError.replace(/\n/g, '<br>')}</small>` :
                    'インポートに失敗しました';
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
            document.getElementById('modalImportStatus').textContent = 'エラーが発生しました';
        } finally {
            document.getElementById('modalImportBtn').disabled = false;
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file, 'UTF-8');
        });
    }

    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                // Base64文字列からdata:URLプレフィックスを削除
                const base64 = e.target.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
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
        return values;
    }

    async loadFilterOptions() {
        try {
            const response = await authFetch(`${this.apiUrl}/filter-options`);
            const result = await response.json();
            
            if (result.success) {
                const { contestNames, classNames } = result.data;
                
                this.populateFilterSelect('contestFilter', contestNames);
                this.populateFilterSelect('classFilter', classNames);
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

    async loadRegistrations() {
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
                this.displayRegistrations(result.data);
                this.updatePagination(result);
            } else {
                this.showNotification('データの読み込みに失敗しました', 'error');
            }
        } catch (error) {
            console.error('Registrations loading failed:', error);
            this.showNotification('エラーが発生しました', 'error');
        }
    }

    displayRegistrations(registrations) {
        const container = document.getElementById('registrationsTableContainer');
        
        if (registrations.length === 0) {
            container.innerHTML = '<div class="no-data">登録データが見つかりません</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'data-table';
        
        // ヘッダー作成
        const headerRow = document.createElement('tr');
        const headers = [
            { key: 'contest_date', label: '開催日' },
            { key: 'contest_name', label: '大会名' },
            { key: 'player_no', label: 'ゼッケン番号' },
            { key: 'name_ja', label: '氏名' },
            { key: 'first_name', label: 'First Name' },
            { key: 'last_name', label: 'Last Name' },
            { key: 'fwj_card_no', label: 'FWJカード' },
            { key: 'npc_member_no', label: 'NPC Worldwide番号' },
            { key: 'npc_member_status', label: 'NPC会員状態' },
            { key: 'class', label: 'クラス' },
            { key: 'score_card', label: 'スコアカード' },
            { key: 'contest_order', label: '開催順' },
            { key: 'backstage_pass', label: 'バックステージパス' },
            { key: 'country', label: '国' }
        ];

        headers.forEach(header => {
            const th = document.createElement('th');
            th.className = 'sortable';
            th.setAttribute('data-column', header.key);
            th.innerHTML = `${header.label}${this.getSortIcon(header.key)}`;
            th.addEventListener('click', () => this.sortBy(header.key));
            headerRow.appendChild(th);
        });

        // 操作列を削除
        // if (this.isAdmin) {
        //     const actionTh = document.createElement('th');
        //     actionTh.textContent = '操作';
        //     headerRow.appendChild(actionTh);
        // }

        table.appendChild(headerRow);

        // データ行作成
        registrations.forEach(registration => {
            const row = document.createElement('tr');
            if (registration.isValid === 'FALSE') {
                row.classList.add('deleted-row');
            }
            
            // ポリシー違反認定者の強調表示
            if (registration.isViolationSubject) {
                row.classList.add('violation-subject');
            }

            headers.forEach(header => {
                const td = document.createElement('td');
                let value = registration[header.key] || '';
                
                if (header.key === 'contest_date' && value) {
                    value = new Date(value).toLocaleDateString('ja-JP');
                }
                
                td.textContent = value;
                row.appendChild(td);
            });

            // 操作列を削除
            // if (this.isAdmin) {
            //     const actionTd = document.createElement('td');
            //     actionTd.innerHTML = this.createActionButtons(registration);
            //     row.appendChild(actionTd);
            // }

            table.appendChild(row);
        });

        container.innerHTML = '';
        container.appendChild(table);
    }

    createActionButtons(registration) {
        let buttons = '';
        
        // 管理者向けの復元・完全削除機能も削除
        // if (registration.isValid === 'FALSE') {
        //     buttons += `<button class="btn btn-sm btn-success" onclick="registrationsManager.restoreRegistration('${registration.id}')">復元</button>`;
        //     buttons += `<button class="btn btn-sm btn-danger" onclick="registrationsManager.permanentDeleteRegistration('${registration.id}')">完全削除</button>`;
        // } else {
        //     // 編集・削除ボタンを削除
        // }
        
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
        this.loadRegistrations();
    }

    updatePagination(result) {
        // APIレスポンス構造に応じてページネーション情報を取得
        let page, totalPages, total;
        
        if (result.pagination) {
            // ポリシー違反認定者フィルタが適用された場合の構造
            page = result.pagination.currentPage;
            totalPages = result.pagination.totalPages;
            total = result.pagination.totalCount;
        } else {
            // 通常のページング構造
            page = result.page;
            totalPages = result.totalPages;
            total = result.total;
        }
        
        this.currentPage = page;
        this.totalPages = totalPages;
        this.total = total;

        document.getElementById('pageInfo').textContent = 
            `ページ ${page} / ${totalPages} (全 ${total} 件)`;
        
        document.getElementById('prevPageBtn').disabled = page <= 1;
        document.getElementById('nextPageBtn').disabled = page >= totalPages;
        
        document.getElementById('pagination').classList.remove('hidden');
    }

    applyFilters() {
        this.currentFilters = {
            fwj_card_no: document.getElementById('fwjCardFilter').value,
            contest_name: document.getElementById('contestFilter').value,
            class_name: document.getElementById('classFilter').value,
            violation_only: document.getElementById('violationFilter').checked ? 'true' : '',
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
        this.loadRegistrations();
    }

    clearFilters() {
        document.getElementById('fwjCardFilter').value = '';
        document.getElementById('contestFilter').value = '';
        document.getElementById('classFilter').value = '';
        document.getElementById('violationFilter').checked = false;
        document.getElementById('startDate').value = '';
        document.getElementById('endDate').value = '';
        
        this.currentFilters = {};
        this.currentPage = 1;
        this.loadRegistrations();
    }

    handleSearch(searchTerm) {
        // 簡単な検索実装（フィルターとして機能）
        if (searchTerm.trim()) {
            this.currentFilters.search = searchTerm;
        } else {
            delete this.currentFilters.search;
        }
        this.currentPage = 1;
        this.loadRegistrations();
    }

    toggleDeletedRecords() {
        this.showingDeleted = !this.showingDeleted;
        const btn = document.getElementById('toggleDeletedBtn');
        btn.textContent = this.showingDeleted ? '通常表示' : '削除済みを表示';
        this.loadRegistrations();
    }

    // 編集機能をすべて削除
    // async editRegistration(id) {
    //     try {
    //         const response = await authFetch(`${this.apiUrl}/${id}`);
    //         const result = await response.json();
            
    //         if (result.success) {
    //             this.populateEditForm(result.data);
    //             document.getElementById('editModal').classList.remove('hidden');
    //         } else {
    //             this.showNotification('登録データの取得に失敗しました', 'error');
    //         }
    //     } catch (error) {
    //         console.error('Edit registration fetch failed:', error);
    //         this.showNotification('エラーが発生しました', 'error');
    //     }
    // }

    // populateEditForm(registration) {
    //     document.getElementById('editRegistrationForm').dataset.id = registration.id;
    //     document.getElementById('editContestDate').value = registration.contest_date || '';
    //     document.getElementById('editContestName').value = registration.contest_name || '';
    //     document.getElementById('editAthleteNumber').value = registration.athlete_number || '';
    //     document.getElementById('editName').value = registration.name || '';
    //     document.getElementById('editFwjCard').value = registration.fwj_card_no || '';
    //     document.getElementById('editClass').value = registration.class || '';
    //     document.getElementById('editCountry').value = registration.country || '';
    //     document.getElementById('editEmail').value = registration.email || '';
    // }

    // async handleEditSubmit(e) {
    //     e.preventDefault();
        
    //     const form = e.target;
    //     const id = form.dataset.id;
    //     const formData = new FormData(form);
    //     const data = Object.fromEntries(formData);

    //     try {
    //         const response = await authFetch(`${this.apiUrl}/${id}`, {
    //             method: 'PUT',
    //             body: JSON.stringify(data)
    //         });

    //         const result = await response.json();
            
    //         if (result.success) {
    //             this.showNotification('登録データを更新しました', 'success');
    //             this.closeEditModal();
    //             this.loadRegistrations();
    //         } else {
    //             this.showNotification(result.error || '更新に失敗しました', 'error');
    //         }
    //     } catch (error) {
    //         console.error('Update failed:', error);
    //         this.showNotification('エラーが発生しました', 'error');
    //     }
    // }

    // closeEditModal() {
    //     document.getElementById('editModal').classList.add('hidden');
    //     document.getElementById('editRegistrationForm').reset();
    // }

    // 削除・復元・完全削除機能をすべて削除
    // async softDeleteRegistration(id) {
    //     if (!confirm('この登録データを削除しますか？')) return;

    //     try {
    //         const response = await authFetch(`${this.apiUrl}/${id}`, {
    //             method: 'DELETE'
    //         });

    //         const result = await response.json();
            
    //         if (result.success) {
    //             this.showNotification('登録データを削除しました', 'success');
    //             this.loadRegistrations();
    //         } else {
    //             this.showNotification(result.error || '削除に失敗しました', 'error');
    //         }
    //     } catch (error) {
    //         console.error('Delete failed:', error);
    //         this.showNotification('エラーが発生しました', 'error');
    //     }
    // }

    // async restoreRegistration(id) {
    //     try {
    //         const response = await authFetch(`${this.apiUrl}/${id}/restore`, {
    //             method: 'PUT'
    //         });

    //         const result = await response.json();
            
    //         if (result.success) {
    //             this.showNotification('登録データを復元しました', 'success');
    //             this.loadRegistrations();
    //         } else {
    //             this.showNotification(result.error || '復元に失敗しました', 'error');
    //         }
    //     } catch (error) {
    //         console.error('Restore failed:', error);
    //         this.showNotification('エラーが発生しました', 'error');
    //     }
    // }

    // async permanentDeleteRegistration(id) {
    //     if (!confirm('この登録データを完全に削除しますか？この操作は取り消せません。')) return;

    //     try {
    //         const response = await authFetch(`${this.apiUrl}/${id}/permanent`, {
    //             method: 'DELETE'
    //         });

    //         const result = await response.json();
            
    //         if (result.success) {
    //             this.showNotification('登録データを完全に削除しました', 'success');
    //             this.loadRegistrations();
    //         } else {
    //             this.showNotification(result.error || '削除に失敗しました', 'error');
    //         }
    //     } catch (error) {
    //         console.error('Permanent delete failed:', error);
    //         this.showNotification('エラーが発生しました', 'error');
    //     }
    // }

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
console.log('REGISTRATIONS: Script loaded, creating RegistrationsManager instance');
const registrationsManager = new RegistrationsManager();
console.log('REGISTRATIONS: RegistrationsManager instance created');