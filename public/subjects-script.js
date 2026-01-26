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
        console.log('Getting auth headers, token exists:', !!token);
        if (token) {
            console.log('Token preview:', token.substring(0, 20) + '...');
        }
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }
};

// 認証付きfetch関数
async function authFetch(url, options = {}) {
    const authHeaders = AuthToken.getHeaders();
    console.log('authFetch called for:', url);
    console.log('Auth headers:', authHeaders);
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
            ...(options.headers || {})
        },
        credentials: 'include'
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    console.log('Final request headers:', mergedOptions.headers);
    
    return fetch(url, mergedOptions);
}

class SubjectManager {
    constructor() {
        this.apiUrl = '/api/subjects';
        this.showingDeleted = false;
        this.currentUser = null;
        this.isAdmin = false;
        this.currentFilters = {};
        this.init();
    }

    async init() {
        await this.checkAuthStatus();
        this.bindEvents();
        if (this.currentUser) {
            this.loadSubjects();
        }
    }

    async checkAuthStatus() {
        try {
            const response = await authFetch('/api/auth/status');

            console.log('Auth status response status:', response.status);
            const result = await response.json();
            console.log('Auth status result on subjects page:', result);

            if (!result.isAuthenticated) {
                console.log('User NOT authenticated on subjects page, redirecting to /');
                AuthToken.remove();
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000);
                return;
            }

            console.log('User authenticated on subjects page, proceeding...');
            this.currentUser = result.user;
            this.isAdmin = result.user.role === 'admin';

            // 一般ユーザー（非管理者）の場合はログアウトしてログイン画面に遷移
            if (!this.isAdmin) {
                console.log('User is not admin, logging out and redirecting to /');
                AuthToken.remove();
                // ログアウトAPIを呼び出す
                try {
                    await authFetch('/api/auth/logout', { method: 'POST' });
                } catch (logoutError) {
                    console.error('Logout API error:', logoutError);
                }
                window.location.href = '/';
                return;
            }

            try {
                this.updateUI();
                console.log('updateUI completed successfully');
            } catch (uiError) {
                console.error('updateUI error (but keeping authentication):', uiError);
            }
        } catch (error) {
            console.error('Auth check error on subjects page:', error);
            AuthToken.remove();
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        }
    }

    updateUI() {
        if (this.currentUser) {
            console.log('updateUI - currentUser:', this.currentUser);
            document.getElementById('authHeader').style.display = 'flex';

            const userName = this.currentUser.name || this.currentUser.email || 'User';
            console.log('updateUI - userName:', userName);

            document.getElementById('userAvatar').textContent = userName.charAt(0).toUpperCase();
            document.getElementById('userName').textContent = userName;
            document.getElementById('userRole').innerHTML = `<span class="role-badge ${this.currentUser.role}">${this.currentUser.role}</span>`;

            // 管理者の場合、admin-onlyリンクを表示
            if (this.isAdmin) {
                document.querySelectorAll('.admin-only').forEach(el => {
                    el.style.display = 'inline-block';
                });
            }

            // 管理者でない場合、新規追加ボタンを非表示にする
            if (!this.isAdmin) {
                document.body.classList.add('readonly-mode');
                document.getElementById('addSubjectModalBtn').style.display = 'none';
            }
        }
    }

    bindEvents() {
        // フォームのsubmitイベント
        const form = document.getElementById('subjectForm');
        form.onsubmit = (e) => {
            e.preventDefault();
            this.handleSubmit(e);
        };

        document.getElementById('addSubjectModalBtn').addEventListener('click', () => {
            this.openSubjectModal();
        });

        document.getElementById('toggleDeletedBtn').addEventListener('click', () => {
            this.toggleDeletedView();
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

        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.handleLogout();
        });
    }

    // モーダル関連のメソッド
    openSubjectModal(subject = null) {
        const modal = document.getElementById('subjectModal');
        const modalTitle = document.getElementById('modalTitle');
        const submitBtn = document.getElementById('modalSubmitBtn');
        
        if (subject) {
            // 編集モード
            modalTitle.textContent = '認定者編集';
            submitBtn.textContent = '認定者を更新';
            
            document.getElementById('modalFwjCardNo').value = subject.fwj_card_no || '';
            document.getElementById('modalNameJa').value = subject.name_ja || '';
            document.getElementById('modalFirstName').value = subject.first_name || '';
            document.getElementById('modalLastName').value = subject.last_name || '';
            document.getElementById('modalNpcMemberNo').value = subject.npc_member_no || '';
            document.getElementById('modalNote').value = subject.note || '';
            
            this.editingSubjectId = subject.id;
        } else {
            // 新規作成モード
            modalTitle.textContent = '新規認定者追加';
            submitBtn.textContent = '認定者を追加';
            
            document.getElementById('modalFwjCardNo').value = '';
            document.getElementById('modalNameJa').value = '';
            document.getElementById('modalFirstName').value = '';
            document.getElementById('modalLastName').value = '';
            document.getElementById('modalNpcMemberNo').value = '';
            document.getElementById('modalNote').value = '';
            
            this.editingSubjectId = null;
        }
        
        modal.classList.remove('hidden');
    }

    closeSubjectModal() {
        document.getElementById('subjectModal').classList.add('hidden');
        this.editingSubjectId = null;
    }

    async handleSubmit(e) {
        const formData = new FormData(e.target);
        const subjectData = Object.fromEntries(formData.entries());

        try {
            let response;
            let successMessage;
            
            if (this.editingSubjectId) {
                // 編集モード
                response = await authFetch(`${this.apiUrl}/${this.editingSubjectId}`, {
                    method: 'PUT',
                    body: JSON.stringify(subjectData)
                });
                successMessage = '認定者が正常に更新されました';
            } else {
                // 新規作成モード
                response = await authFetch(this.apiUrl, {
                    method: 'POST',
                    body: JSON.stringify(subjectData)
                });
                successMessage = '認定者が正常に追加されました';
            }

            const result = await response.json();

            if (result.success) {
                const message = result.restored ? '認定者が復元されました' : successMessage;
                this.showNotification(message, 'success');
                this.closeSubjectModal();
                await this.loadSubjects();
            } else {
                this.showNotification(result.errors ? result.errors.join(', ') : result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    async loadSubjects() {
        console.log('=== loadSubjects START ===');
        const container = document.getElementById('subjectsTableContainer');
        container.innerHTML = '<div class="loading">読み込み中...</div>';

        try {
            let url = this.showingDeleted ? `${this.apiUrl}/deleted/list` : this.apiUrl;
            
            // 検索パラメータがある場合はクエリストリングに追加
            if (!this.showingDeleted && this.currentFilters.search) {
                const params = new URLSearchParams({
                    search: this.currentFilters.search
                });
                url += `?${params.toString()}`;
            }

            console.log('About to call authFetch for:', url);
            const response = await authFetch(url);
            console.log('loadSubjects response status:', response.status);
            const result = await response.json();

            if (result.success) {
                this.renderSubjects(result.data);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            container.innerHTML = `<div class="empty-state">エラー: ${error.message}</div>`;
        }
    }

    handleSearch(searchTerm) {
        // サーバーサイド検索実装（フィルターとして機能）
        if (searchTerm.trim()) {
            this.currentFilters.search = searchTerm;
        } else {
            delete this.currentFilters.search;
        }
        this.loadSubjects();
    }

    toggleDeletedView() {
        this.showingDeleted = !this.showingDeleted;
        const toggleBtn = document.getElementById('toggleDeletedBtn');
        
        if (this.showingDeleted) {
            toggleBtn.textContent = 'アクティブを表示';
            toggleBtn.classList.add('active');
        } else {
            toggleBtn.textContent = '削除済みを表示';
            toggleBtn.classList.remove('active');
        }
        
        this.loadSubjects();
    }

    renderSubjects(subjects) {
        const container = document.getElementById('subjectsTableContainer');

        if (subjects.length === 0) {
            container.innerHTML = '<div class="no-data">認定者が見つかりません</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'data-table';

        // ヘッダー作成
        const headers = [
            { key: 'fwj_card_no', label: 'FWJカード番号' },
            { key: 'name_ja', label: '日本語名' },
            { key: 'name_en', label: '英語名' },
            { key: 'npc_member_no', label: 'NPCメンバー番号' },
            { key: 'note', label: '備考' },
            { key: '_actions', label: '操作' }
        ];

        const headerRow = document.createElement('tr');
        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header.label;
            if (header.key === '_actions') {
                th.className = 'actions-header';
            }
            headerRow.appendChild(th);
        });
        table.appendChild(headerRow);

        // データ行作成
        subjects.forEach(subject => {
            const row = document.createElement('tr');
            const isDeleted = subject.isValid === 'FALSE';

            if (isDeleted) {
                row.classList.add('deleted-row');
            }

            headers.forEach(header => {
                const td = document.createElement('td');

                if (header.key === '_actions') {
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'row-actions';

                    if (isDeleted) {
                        const restoreBtn = document.createElement('button');
                        restoreBtn.className = 'btn-small btn-edit';
                        restoreBtn.textContent = '復元';
                        restoreBtn.addEventListener('click', () => this.restoreSubject(subject.id));
                        actionsDiv.appendChild(restoreBtn);

                        const deleteBtn = document.createElement('button');
                        deleteBtn.className = 'btn-small btn-delete';
                        deleteBtn.textContent = '完全削除';
                        deleteBtn.addEventListener('click', () => this.permanentDeleteSubject(subject.id));
                        actionsDiv.appendChild(deleteBtn);
                    } else {
                        const editBtn = document.createElement('button');
                        editBtn.className = 'btn-small btn-edit';
                        editBtn.textContent = '編集';
                        editBtn.addEventListener('click', () => this.editSubject(subject.id));
                        actionsDiv.appendChild(editBtn);

                        const deleteBtn = document.createElement('button');
                        deleteBtn.className = 'btn-small btn-delete';
                        deleteBtn.textContent = '削除';
                        deleteBtn.addEventListener('click', () => this.deleteSubject(subject.id));
                        actionsDiv.appendChild(deleteBtn);
                    }

                    td.appendChild(actionsDiv);
                } else if (header.key === 'name_ja') {
                    td.textContent = subject.name_ja || '';
                    if (isDeleted) {
                        const badge = document.createElement('span');
                        badge.className = 'status-badge deleted';
                        badge.textContent = '削除済み';
                        badge.style.marginLeft = '8px';
                        td.appendChild(badge);
                    }
                } else if (header.key === 'name_en') {
                    td.textContent = `${subject.first_name || ''} ${subject.last_name || ''}`.trim();
                } else if (header.key === 'note') {
                    td.textContent = subject.note || '';
                    td.title = subject.note || ''; // ホバーで全文表示
                    td.style.maxWidth = '200px';
                    td.style.overflow = 'hidden';
                    td.style.textOverflow = 'ellipsis';
                    td.style.whiteSpace = 'nowrap';
                } else {
                    td.textContent = subject[header.key] || '';
                }

                row.appendChild(td);
            });

            table.appendChild(row);
        });

        container.innerHTML = '';
        container.appendChild(table);

        // 列幅リサイズ機能を初期化
        if (window.ColumnResize) {
            ColumnResize.init(table, 'subjects-column-widths');
        }

        // ソート機能を初期化
        if (window.TableSort) {
            TableSort.init(table);
        }
    }

    async editSubject(id) {
        try {
            const response = await authFetch(`${this.apiUrl}/${id}`);
            const result = await response.json();

            if (result.success) {
                const subject = result.data;
                this.openSubjectModal(subject);
                this.showNotification(`${subject.name_ja || subject.fwj_card_no} の編集モードになりました`, 'success');
            } else {
                this.showNotification(result.error || '認定者情報の取得に失敗しました', 'error');
            }
        } catch (error) {
            this.showNotification('認定者情報の取得に失敗しました', 'error');
        }
    }

    async deleteSubject(id) {
        if (!confirm('この認定者を論理削除してもよろしいですか？\n（後で復元可能です）')) {
            return;
        }

        try {
            const response = await authFetch(`${this.apiUrl}/${id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('認定者が論理削除されました', 'success');
                await this.loadSubjects();
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    async restoreSubject(id) {
        if (!confirm('この認定者を復元してもよろしいですか？')) {
            return;
        }

        try {
            const response = await authFetch(`${this.apiUrl}/${id}/restore`, {
                method: 'PUT'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('認定者が復元されました', 'success');
                await this.loadSubjects();
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    async permanentDeleteSubject(id) {
        if (!confirm('この認定者を完全に削除してもよろしいですか？\n※この操作は取り消せません！')) {
            return;
        }

        try {
            const response = await authFetch(`${this.apiUrl}/${id}/permanent`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('認定者が完全に削除されました', 'success');
                await this.loadSubjects();
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
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
            this.showNotification('ログアウトエラーが発生しました', 'error');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

const subjectManager = new SubjectManager();