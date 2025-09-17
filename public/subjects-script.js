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

        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadSubjects();
        });

        document.getElementById('toggleDeletedBtn').addEventListener('click', () => {
            this.toggleDeletedView();
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
            document.getElementById('modalEmail').value = subject.email || '';
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
            document.getElementById('modalEmail').value = '';
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
                this.loadSubjects();
            } else {
                this.showNotification(result.errors ? result.errors.join(', ') : result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    async loadSubjects() {
        console.log('=== loadSubjects START ===');
        const container = document.getElementById('subjectsContainer');
        container.innerHTML = '<div class="loading">読み込み中...</div>';

        try {
            const url = this.showingDeleted ? `${this.apiUrl}/deleted/list` : this.apiUrl;
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
        const container = document.getElementById('subjectsContainer');
        
        if (subjects.length === 0) {
            container.innerHTML = '<div class="empty-state">認定者が見つかりません</div>';
            return;
        }

        const subjectsHtml = subjects.map(subject => {
            const isDeleted = subject.isValid === 'FALSE';
            const statusBadge = isDeleted ? 
                '<span class="status-badge deleted">削除済み</span>' :
                '<span class="status-badge active">アクティブ</span>';
            
            const actions = isDeleted ? `
                <button class="restore-btn" onclick="subjectManager.restoreSubject('${subject.id}')">
                    復元
                </button>
                <button class="delete-btn" onclick="subjectManager.permanentDeleteSubject('${subject.id}')">
                    完全削除
                </button>
            ` : `
                <button class="edit-btn" onclick="subjectManager.editSubject('${subject.id}')">
                    編集
                </button>
                <button class="delete-btn" onclick="subjectManager.deleteSubject('${subject.id}')">
                    削除
                </button>
            `;
            
            return `
                <div class="user-card ${isDeleted ? 'deleted' : ''}">
                    <div class="user-info">
                        <div class="user-details">
                            <h3>${this.escapeHtml(subject.name_ja || '')} ${statusBadge}</h3>
                            <p><strong>FWJカード番号:</strong> ${this.escapeHtml(subject.fwj_card_no || '')}</p>
                            <p><strong>英語名:</strong> ${this.escapeHtml(subject.first_name || '')} ${this.escapeHtml(subject.last_name || '')}</p>
                            <p><strong>メール:</strong> ${this.escapeHtml(subject.email || '')}</p>
                            ${subject.npc_member_no ? `<p><strong>NPCメンバー番号:</strong> ${this.escapeHtml(subject.npc_member_no)}</p>` : ''}
                            ${subject.note ? `<p><strong>備考:</strong> ${this.escapeHtml(subject.note)}</p>` : ''}
                            <p><strong>作成日:</strong> ${subject.createdAt ? new Date(subject.createdAt).toLocaleDateString('ja-JP') : '不明'}</p>
                            ${isDeleted && subject.deletedAt ? `<p><strong>削除日:</strong> ${new Date(subject.deletedAt).toLocaleDateString('ja-JP')}</p>` : ''}
                        </div>
                        <div class="user-actions">
                            ${actions}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = subjectsHtml;
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
                this.loadSubjects();
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
                this.loadSubjects();
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
                this.loadSubjects();
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