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
        this.contestsMap = new Map(); // 大会名と開催日のマップ
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
                console.log('REGISTRATIONS: Loading contests, filter options and registrations...');
                await this.loadContests();
                await this.loadFilterOptions();
                await this.loadRegistrations();
                console.log('REGISTRATIONS: Data loading completed');
            }, 100);
        } else {
            console.log('REGISTRATIONS: No user found, skipping data loading');
        }
    }

    async loadContests() {
        try {
            const response = await authFetch('/api/contests');
            const result = await response.json();

            if (result.success && result.data) {
                result.data.forEach(contest => {
                    if (contest.contest_name && contest.contest_date) {
                        this.contestsMap.set(contest.contest_name, contest.contest_date);
                    }
                });

                // 今日以降の最も近い大会を保存
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const upcomingContests = result.data
                    .filter(contest => {
                        if (!contest.contest_date) return false;
                        const contestDate = new Date(contest.contest_date);
                        return contestDate >= today;
                    })
                    .sort((a, b) => new Date(a.contest_date) - new Date(b.contest_date)); // 昇順：古い順

                this.defaultContest = upcomingContests.length > 0 ? upcomingContests[0] : null;
            }
        } catch (error) {
            console.error('Contests loading failed:', error);
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

            // 管理者の場合、admin-onlyリンクを表示
            if (this.isAdmin) {
                document.querySelectorAll('.admin-only').forEach(el => {
                    el.style.display = 'inline-block';
                });
            }

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
        document.getElementById('exportModalBtn').addEventListener('click', () => {
            this.openExportModal();
        });

        document.getElementById('shopifyImportBtn').addEventListener('click', () => {
            this.openShopifyImportModal();
        });

        document.getElementById('contestOrderImportBtn').addEventListener('click', () => {
            this.openContestOrderImportModal();
        });

        document.getElementById('contestOrderImportExecuteBtn').addEventListener('click', () => {
            this.executeContestOrderImport();
        });

        document.getElementById('shopifyImportExecuteBtn').addEventListener('click', () => {
            this.executeShopifyImport();
        });

        document.getElementById('syncMembersBtn').addEventListener('click', () => {
            this.syncMembersFromShopify();
        });

        document.getElementById('syncOrdersBtn').addEventListener('click', () => {
            this.syncOrdersFromShopify();
        });

        document.getElementById('modalExportBtn').addEventListener('click', () => {
            this.handleModalExport();
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

        // 検索ボタンのクリックイベント
        document.getElementById('searchBtn').addEventListener('click', () => {
            const searchTerm = document.getElementById('searchInput').value;
            this.handleSearch(searchTerm);
        });

        // 検索入力時のEnterキー処理とクリアボタン表示制御
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSearch(e.target.value);
            }
        });

        // 検索入力時にクリアボタンの表示/非表示を制御（検索は実行しない）
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
            const clearBtn = document.getElementById('clearSearchBtn');
            clearBtn.classList.add('hidden');
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

    // 日付を yyyy/MM/dd から yyyy-MM-dd に変換
    formatDateForInput(dateString) {
        if (!dateString) return '';
        // スラッシュをハイフンに置換
        return dateString.replace(/\//g, '-');
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

    // Shopifyインポートモーダル
    openShopifyImportModal() {
        document.getElementById('shopifyImportModal').classList.remove('hidden');

        // コンテスト選択肢を設定
        const contestSelect = document.getElementById('shopifyContestName');
        contestSelect.innerHTML = '<option value="">大会を選択してください</option>';

        // 開催日順（降順）にソートしてオプションを追加
        const contests = Array.from(this.contestsMap.entries())
            .sort((a, b) => new Date(b[1]) - new Date(a[1]));

        contests.forEach(([name, date]) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            option.setAttribute('data-date', date);
            contestSelect.appendChild(option);
        });

        // フォームをリセット
        document.getElementById('shopifyContestDate').value = '';
        document.getElementById('shopifyImportExecuteBtn').disabled = true;
        document.getElementById('shopifyImportStatus').className = 'import-status hidden';
        document.getElementById('shopifyImportStatus').textContent = '';

        // 今日以降で最も近い大会をデフォルト値として設定
        if (this.defaultContest) {
            document.getElementById('shopifyContestName').value = this.defaultContest.contest_name;
            document.getElementById('shopifyContestDate').value = this.formatDateForInput(this.defaultContest.contest_date);
            this.validateShopifyImportForm();
        }

        // コンテスト名選択時に開催日を自動設定
        contestSelect.removeEventListener('change', this.shopifyContestSelectChangeBound);
        this.shopifyContestSelectChangeBound = (e) => {
            const selectedName = e.target.value;
            if (selectedName && this.contestsMap.has(selectedName)) {
                const contestDate = this.contestsMap.get(selectedName);
                const formattedDate = this.formatDateForInput(contestDate);
                document.getElementById('shopifyContestDate').value = formattedDate;
            } else {
                document.getElementById('shopifyContestDate').value = '';
            }
            this.validateShopifyImportForm();
        };
        contestSelect.addEventListener('change', this.shopifyContestSelectChangeBound);
    }

    closeShopifyImportModal() {
        document.getElementById('shopifyImportModal').classList.add('hidden');
    }

    openContestOrderImportModal() {
        document.getElementById('contestOrderImportModal').classList.remove('hidden');

        // コンテスト選択肢を設定
        const contestSelect = document.getElementById('contestOrderContestName');
        contestSelect.innerHTML = '<option value="">大会を選択してください</option>';

        // 開催日順（降順）にソートしてオプションを追加
        const contests = Array.from(this.contestsMap.entries())
            .sort((a, b) => new Date(b[1]) - new Date(a[1]));

        contests.forEach(([name, date]) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            contestSelect.appendChild(option);
        });

        // フォームをリセット
        document.getElementById('contestOrderCsvFile').value = '';
        document.getElementById('contestOrderImportExecuteBtn').disabled = true;
        document.getElementById('contestOrderImportStatus').className = 'import-status hidden';
        document.getElementById('contestOrderImportStatus').textContent = '';

        // 今日以降で最も近い大会をデフォルト値として設定
        if (this.defaultContest) {
            document.getElementById('contestOrderContestName').value = this.defaultContest.contest_name;
            this.validateContestOrderImportForm();
        }

        // フォームバリデーション
        contestSelect.removeEventListener('change', this.contestOrderContestSelectChangeBound);
        this.contestOrderContestSelectChangeBound = () => this.validateContestOrderImportForm();
        contestSelect.addEventListener('change', this.contestOrderContestSelectChangeBound);

        const fileInput = document.getElementById('contestOrderCsvFile');
        fileInput.removeEventListener('change', this.contestOrderFileChangeBound);
        this.contestOrderFileChangeBound = () => this.validateContestOrderImportForm();
        fileInput.addEventListener('change', this.contestOrderFileChangeBound);
    }

    closeContestOrderImportModal() {
        document.getElementById('contestOrderImportModal').classList.add('hidden');
    }

    validateContestOrderImportForm() {
        const contestName = document.getElementById('contestOrderContestName').value;
        const csvFile = document.getElementById('contestOrderCsvFile').files[0];
        const importBtn = document.getElementById('contestOrderImportExecuteBtn');
        importBtn.disabled = !(contestName && csvFile);
    }

    async executeContestOrderImport() {
        const contestName = document.getElementById('contestOrderContestName').value;
        const csvFile = document.getElementById('contestOrderCsvFile').files[0];
        const statusEl = document.getElementById('contestOrderImportStatus');
        const importBtn = document.getElementById('contestOrderImportExecuteBtn');

        if (!contestName || !csvFile) {
            statusEl.textContent = '大会名とCSVファイルを選択してください';
            statusEl.className = 'import-status error';
            return;
        }

        try {
            importBtn.disabled = true;
            statusEl.textContent = 'CSVファイルを読み込み中...';
            statusEl.className = 'import-status';

            // CSVファイルを読み込み
            const csvText = await this.readFileAsText(csvFile);
            const csvData = this.parseCSV(csvText);

            if (csvData.length === 0) {
                statusEl.textContent = 'CSVファイルにデータがありません';
                statusEl.className = 'import-status error';
                importBtn.disabled = false;
                return;
            }

            // 必要な列があるか確認
            const firstRow = csvData[0];
            if (!('class_name' in firstRow)) {
                statusEl.textContent = 'CSVにclass_name列が必要です';
                statusEl.className = 'import-status error';
                importBtn.disabled = false;
                return;
            }

            statusEl.textContent = `${csvData.length}件のデータをインポート中...`;

            // APIを呼び出し
            const response = await authFetch('/api/registrations/import-contest-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...AuthToken.getHeaders()
                },
                body: JSON.stringify({ contestName, csvData })
            });

            const result = await response.json();

            if (result.success) {
                statusEl.textContent = result.data.message;
                statusEl.className = 'import-status success';
                this.showNotification(result.data.message, 'success');
                
                // データを再読み込み
                setTimeout(() => {
                    this.closeContestOrderImportModal();
                    this.loadRegistrations();
                }, 1500);
            } else {
                statusEl.textContent = `エラー: ${result.error}`;
                statusEl.className = 'import-status error';
                importBtn.disabled = false;
            }
        } catch (error) {
            console.error('Contest order import error:', error);
            statusEl.textContent = `エラー: ${error.message}`;
            statusEl.className = 'import-status error';
            importBtn.disabled = false;
        }
    }

    validateShopifyImportForm() {
        const contestDate = document.getElementById('shopifyContestDate').value;
        const contestName = document.getElementById('shopifyContestName').value;
        const importBtn = document.getElementById('shopifyImportExecuteBtn');
        const syncOrdersBtn = document.getElementById('syncOrdersBtn');

        importBtn.disabled = !(contestDate && contestName);
        syncOrdersBtn.disabled = !contestName;
    }

    async syncMembersFromShopify() {
        const syncBtn = document.getElementById('syncMembersBtn');
        const originalText = syncBtn.textContent;
        const statusElement = document.getElementById('syncStatus');

        try {
            syncBtn.disabled = true;
            syncBtn.textContent = '同期中...';
            statusElement.className = 'import-status';
            statusElement.style.display = 'block';
            statusElement.textContent = 'Membersを同期中...';

            const response = await authFetch('/api/members/sync', {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success) {
                const message = result.message || `Members同期完了: ${result.synced}件を同期しました`;
                this.showNotification(message, 'success');
                statusElement.className = 'import-status success';
                statusElement.textContent = message;
            } else {
                this.showNotification(result.error || 'Members同期に失敗しました', 'error');
                statusElement.className = 'import-status error';
                statusElement.textContent = 'Members同期に失敗しました: ' + (result.error || '');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
            statusElement.className = 'import-status error';
            statusElement.textContent = 'エラーが発生しました: ' + error.message;
        } finally {
            syncBtn.disabled = false;
            syncBtn.textContent = originalText;
        }
    }

    async syncOrdersFromShopify() {
        const contestName = document.getElementById('shopifyContestName').value;
        if (!contestName) {
            this.showNotification('大会名を選択してください', 'error');
            return;
        }

        const syncBtn = document.getElementById('syncOrdersBtn');
        const originalText = syncBtn.textContent;
        const statusElement = document.getElementById('syncStatus');

        try {
            syncBtn.disabled = true;
            syncBtn.textContent = '取得中...';
            statusElement.className = 'import-status';
            statusElement.style.display = 'block';
            statusElement.textContent = 'エントリーを取得中...';

            // "コンテストエントリー" と contest_name の2つのタグで検索してOrdersシートに出力
            const tag = `"コンテストエントリー", "${contestName}"`;
            const response = await authFetch('/api/orders/export', {
                method: 'POST',
                body: JSON.stringify({
                    tag: tag,
                    paidOnly: true
                })
            });

            const result = await response.json();

            if (result.success) {
                const message = result.message || `エントリー取得完了: ${result.exported}件`;
                this.showNotification(message, 'success');
                statusElement.className = 'import-status success';
                statusElement.textContent = message;
            } else {
                this.showNotification(result.error || 'エントリー取得に失敗しました', 'error');
                statusElement.className = 'import-status error';
                statusElement.textContent = 'エントリー取得に失敗しました: ' + (result.error || '');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
            statusElement.className = 'import-status error';
            statusElement.textContent = 'エラーが発生しました: ' + error.message;
        } finally {
            syncBtn.disabled = false;
            syncBtn.textContent = originalText;
            this.validateShopifyImportForm();
        }
    }

    async executeShopifyImport() {
        const contestDate = document.getElementById('shopifyContestDate').value;
        const contestName = document.getElementById('shopifyContestName').value;

        if (!contestDate || !contestName) {
            this.showNotification('大会開催日と大会名を選択してください', 'error');
            return;
        }

        try {
            document.getElementById('shopifyImportExecuteBtn').disabled = true;
            const statusElement = document.getElementById('shopifyImportStatus');
            statusElement.className = 'import-status';
            statusElement.style.display = 'block';
            statusElement.textContent = 'インポート中...';

            const response = await authFetch(`${this.apiUrl}/import-shopify`, {
                method: 'POST',
                body: JSON.stringify({ contestDate, contestName })
            });

            const result = await response.json();

            if (result.success) {
                const { imported, skipped, memberNotFound, warnings } = result.data;

                this.showNotification(`${imported}件のRegistrationをインポートしました`, 'success');

                statusElement.className = 'import-status success';
                let statusMessage = `インポート完了: ${contestName} (${contestDate}) - ${imported}件`;
                if (memberNotFound > 0) {
                    statusMessage += `\n※${memberNotFound}件はMemberが見つからず、Members由来の項目が空白です`;
                }
                statusElement.textContent = statusMessage;

                // 警告がある場合はコンソールに出力
                if (warnings && warnings.length > 0) {
                    console.log('Shopify import warnings:', warnings);
                }

                await this.loadFilterOptions();
                this.loadRegistrations();

                // モーダルを閉じる
                setTimeout(() => {
                    this.closeShopifyImportModal();
                }, 2000);
            } else {
                this.showNotification(result.error, 'error');
                statusElement.className = 'import-status error';
                statusElement.textContent = 'インポートに失敗しました: ' + result.error;
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
            const statusElement = document.getElementById('shopifyImportStatus');
            statusElement.className = 'import-status error';
            statusElement.textContent = 'エラーが発生しました: ' + error.message;
        } finally {
            document.getElementById('shopifyImportExecuteBtn').disabled = false;
        }
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
                    `エクスポート完了: ${result.data.length}件 - 続けて別のエクスポートを実行できます`;
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
        ].join('\r\n');

        // UTF-8（BOMなし）でファイルを作成
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        
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

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
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
            { key: 'name_ja_kana', label: 'フリガナ' },
            { key: 'first_name', label: 'First Name' },
            { key: 'last_name', label: 'Last Name' },
            { key: 'email', label: 'Email' },
            { key: 'phone', label: '電話番号' },
            { key: 'fwj_card_no', label: 'FWJ card #' },
            { key: 'country', label: '国' },
            { key: 'age', label: '年齢' },
            { key: 'class_name', label: 'クラス' },
            { key: 'sort_index', label: 'ソート順' },
            { key: 'score_card', label: 'スコアカード' },
            { key: 'contest_order', label: '開催順' },
            { key: 'height', label: '身長' },
            { key: 'weight', label: '体重' },
            { key: 'occupation', label: '職業' },
            { key: 'instagram', label: 'Instagram' },
            { key: 'biography', label: '自己紹介' }
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
        registrations.forEach(registration => {
            const row = document.createElement('tr');
            if (registration.isValid === 'FALSE') {
                row.classList.add('deleted-row');
            }

            // ポリシー違反認定者の強調表示
            if (registration.isViolationSubject) {
                row.classList.add('violation-subject');
            }

            // 特記事項ありの強調表示（violation-subjectを上書きしない）
            if (registration.hasNote && !registration.isViolationSubject) {
                row.classList.add('has-note');
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

            table.appendChild(row);
        });

        container.innerHTML = '';
        container.appendChild(table);

        // 列幅リサイズ機能を初期化
        if (window.ColumnResize) {
            ColumnResize.init(table, 'registrations-column-widths');
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
            note_exists: document.getElementById('noteExistsFilter').checked ? 'true' : ''
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
        document.getElementById('noteExistsFilter').checked = false;
        document.getElementById('searchInput').value = '';

        // クリアボタンも隠す
        const clearBtn = document.getElementById('clearSearchBtn');
        clearBtn.classList.add('hidden');

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
    //     document.getElementById('editClass').value = registration.class_name || '';
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