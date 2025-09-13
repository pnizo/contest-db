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

class UserManager {
    constructor() {
        this.apiUrl = '/api/users';
        this.showingDeleted = false;
        this.currentUser = null;
        this.isAdmin = false;
        this.init();
    }

    async init() {
        await this.checkAuthStatus();
        this.bindEvents();
        if (this.currentUser) {
            this.loadUsers();
        }
    }

    async checkAuthStatus() {
        try {
            console.log('=== Users page checkAuthStatus START ===');
            const token = AuthToken.get();
            console.log('Token exists in localStorage on users page:', !!token);
            if (token) {
                console.log('Token preview on users page:', token.substring(0, 20) + '...');
            }
            
            const headers = AuthToken.getHeaders();
            console.log('Auth headers for /api/auth/status:', headers);
            
            const response = await fetch('/api/auth/status', {
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            console.log('Auth status response status:', response.status);
            const result = await response.json();
            console.log('Auth status result on users page:', result);
            
            if (!result.isAuthenticated) {
                console.log('User NOT authenticated on users page, redirecting to /');
                AuthToken.remove();
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000); // 1秒待機してログを確認
                return;
            }

            console.log('User authenticated on users page, proceeding...');
            this.currentUser = result.user;
            this.isAdmin = result.user.role === 'admin';
            
            try {
                this.updateUI();
                console.log('updateUI completed successfully');
            } catch (uiError) {
                console.error('updateUI error (but keeping authentication):', uiError);
                // UIエラーでもトークンは保持
            }
        } catch (error) {
            console.error('Auth check error on users page:', error);
            AuthToken.remove();
            setTimeout(() => {
                window.location.href = '/';
            }, 1000); // 1秒待機してログを確認
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

            // 管理者でない場合、読み取り専用モードにする
            if (!this.isAdmin) {
                document.body.classList.add('readonly-mode');
                document.querySelector('.form-section h2').textContent = 'ユーザー情報（閲覧のみ）';
            }
        }
    }

    bindEvents() {
        document.getElementById('userForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit(e);
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadUsers();
        });

        document.getElementById('toggleDeletedBtn').addEventListener('click', () => {
            this.toggleDeletedView();
        });

        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.handleLogout();
        });
    }

    async handleSubmit(e) {
        const formData = new FormData(e.target);
        const userData = Object.fromEntries(formData.entries());

        try {
            const response = await authFetch(this.apiUrl, {
                method: 'POST',
                body: JSON.stringify(userData)
            });

            const result = await response.json();

            if (result.success) {
                const message = result.restored ? 'ユーザーが復元されました' : 'ユーザーが正常に追加されました';
                this.showNotification(message, 'success');
                e.target.reset();
                this.loadUsers();
            } else {
                this.showNotification(result.errors ? result.errors.join(', ') : result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    async loadUsers() {
        console.log('=== loadUsers START ===');
        const container = document.getElementById('usersContainer');
        container.innerHTML = '<div class="loading">読み込み中...</div>';

        try {
            const url = this.showingDeleted ? `${this.apiUrl}/deleted/list` : this.apiUrl;
            console.log('About to call authFetch for:', url);
            const response = await authFetch(url);
            console.log('loadUsers response status:', response.status);
            const result = await response.json();

            if (result.success) {
                this.renderUsers(result.data);
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
        
        this.loadUsers();
    }

    renderUsers(users) {
        const container = document.getElementById('usersContainer');
        
        if (users.length === 0) {
            container.innerHTML = '<div class="empty-state">ユーザーが見つかりません</div>';
            return;
        }

        const usersHtml = users.map(user => {
            const isDeleted = user.isValid === 'FALSE';
            const statusBadge = isDeleted ? 
                '<span class="status-badge deleted">削除済み</span>' :
                '<span class="status-badge active">アクティブ</span>';
            
            const actions = isDeleted ? `
                <button class="restore-btn" onclick="userManager.restoreUser('${user.id}')">
                    復元
                </button>
                <button class="delete-btn" onclick="userManager.permanentDeleteUser('${user.id}')">
                    完全削除
                </button>
            ` : `
                <button class="edit-btn" onclick="userManager.editUser('${user.id}')">
                    編集
                </button>
                <button class="delete-btn" onclick="userManager.deleteUser('${user.id}')">
                    削除
                </button>
            `;
            
            return `
                <div class="user-card ${isDeleted ? 'deleted' : ''}">
                    <div class="user-info">
                        <div class="user-details">
                            <h3>${this.escapeHtml(user.name)} ${statusBadge}</h3>
                            <p><strong>メール:</strong> ${this.escapeHtml(user.email)}</p>
                            <p><strong>役割:</strong> ${this.escapeHtml(user.role || 'user')}</p>
                            <p><strong>作成日:</strong> ${user.createdAt ? new Date(user.createdAt).toLocaleDateString('ja-JP') : '不明'}</p>
                            ${isDeleted && user.deletedAt ? `<p><strong>削除日:</strong> ${new Date(user.deletedAt).toLocaleDateString('ja-JP')}</p>` : ''}
                        </div>
                        <div class="user-actions">
                            ${actions}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = usersHtml;
    }

    async editUser(id) {
        try {
            console.log('=== EDIT USER CLICKED ===');
            console.log('User ID:', id);
            
            const response = await authFetch(`${this.apiUrl}/${id}`);
            console.log('Edit user response status:', response.status);
            
            const result = await response.json();
            console.log('Edit user result:', result);

            if (result.success) {
                const user = result.data;
                console.log('User data to populate form:', user);
                
                document.getElementById('name').value = user.name || '';
                document.getElementById('email').value = user.email || '';
                document.getElementById('role').value = user.role || 'user';
                
                const form = document.getElementById('userForm');
                const submitBtn = form.querySelector('button[type="submit"]');
                submitBtn.textContent = 'ユーザーを更新';
                submitBtn.dataset.editId = id;
                
                form.onsubmit = (e) => {
                    e.preventDefault();
                    this.handleUpdate(e, id);
                };
                
                console.log('Form populated successfully');
                
                // フォームセクションを展開
                const formSection = document.getElementById('user-form-content');
                if (formSection.classList.contains('collapsed')) {
                    toggleSection('user-form');
                }
                
                this.showNotification('編集モードになりました', 'success');
            } else {
                console.error('Edit user failed:', result.error);
                this.showNotification(result.error || 'ユーザー情報の取得に失敗しました', 'error');
            }
        } catch (error) {
            console.error('Edit user error:', error);
            this.showNotification('ユーザー情報の取得に失敗しました', 'error');
        }
    }

    async handleUpdate(e, id) {
        const formData = new FormData(e.target);
        const userData = Object.fromEntries(formData.entries());

        try {
            const response = await authFetch(`${this.apiUrl}/${id}`, {
                method: 'PUT',
                body: JSON.stringify(userData)
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('ユーザーが正常に更新されました', 'success');
                this.resetForm();
                this.loadUsers();
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    async deleteUser(id) {
        if (!confirm('このユーザーを論理削除してもよろしいですか？\n（後で復元可能です）')) {
            return;
        }

        try {
            const response = await authFetch(`${this.apiUrl}/${id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('ユーザーが論理削除されました', 'success');
                this.loadUsers();
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    async restoreUser(id) {
        if (!confirm('このユーザーを復元してもよろしいですか？')) {
            return;
        }

        try {
            const response = await authFetch(`${this.apiUrl}/${id}/restore`, {
                method: 'PUT'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('ユーザーが復元されました', 'success');
                this.loadUsers();
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    async permanentDeleteUser(id) {
        if (!confirm('このユーザーを完全に削除してもよろしいですか？\n※この操作は取り消せません！')) {
            return;
        }

        try {
            const response = await authFetch(`${this.apiUrl}/${id}/permanent`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('ユーザーが完全に削除されました', 'success');
                this.loadUsers();
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        }
    }

    resetForm() {
        const form = document.getElementById('userForm');
        form.reset();
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.textContent = 'ユーザーを追加';
        delete submitBtn.dataset.editId;
        form.onsubmit = (e) => {
            e.preventDefault();
            this.handleSubmit(e);
        };
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

    // すべてのAPI呼び出しにcredentialsを追加
    async apiCall(url, options = {}) {
        const defaultOptions = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        try {
            const response = await fetch(url, { ...defaultOptions, ...options });
            const result = await response.json();

            // 認証エラーの場合、ログイン画面にリダイレクト
            if (response.status === 401) {
                window.location.href = '/login';
                return null;
            }

            return { response, result };
        } catch (error) {
            console.error('API call error:', error);
            throw error;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

const userManager = new UserManager();

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