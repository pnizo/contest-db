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
            const response = await authFetch('/api/auth/status');
            
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

            // 管理者の場合、admin-only要素を表示
            if (this.isAdmin && typeof showAdminOnlyElements === 'function') {
                showAdminOnlyElements();
            }

            // 管理者でない場合、新規追加ボタンを非表示にする
            if (!this.isAdmin) {
                document.body.classList.add('readonly-mode');
                document.getElementById('addUserModalBtn').style.display = 'none';
            }
        }
    }

    bindEvents() {
        // フォームのsubmitイベントはonsubmitプロパティで管理
        const form = document.getElementById('userForm');
        form.onsubmit = (e) => {
            e.preventDefault();
            this.handleSubmit(e);
        };

        document.getElementById('addUserModalBtn').addEventListener('click', () => {
            this.openUserModal();
        });

        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.handleLogout();
        });
    }

    // モーダル関連のメソッド
    // roleに応じてメール欄のラベル・typeを切り替え
    updateEmailFieldVisibility(role) {
        const emailField = document.getElementById('modalEmail');
        const emailLabel = emailField.closest('.form-group').querySelector('label');

        if (role === 'guest') {
            emailLabel.textContent = 'ID:';
            emailField.type = 'text';
        } else {
            emailLabel.textContent = 'メールアドレス:';
            emailField.type = 'email';
        }
    }

    // roleに応じてパスワード欄の表示/必須を制御
    updatePasswordFieldVisibility(role, isEditMode) {
        const passwordField = document.getElementById('modalPassword');
        const passwordGroup = passwordField.closest('.form-group');

        if (role === 'guest') {
            // ゲストはパスワード必須
            passwordGroup.style.display = '';
            if (!isEditMode) {
                passwordField.setAttribute('required', 'required');
            } else {
                passwordField.removeAttribute('required');
            }
        } else {
            // admin/userはGoogle SSO認証のためパスワード不要
            passwordGroup.style.display = 'none';
            passwordField.removeAttribute('required');
            passwordField.value = '';
        }
    }

    openUserModal(user = null) {
        const modal = document.getElementById('userModal');
        const modalTitle = document.getElementById('modalTitle');
        const submitBtn = document.getElementById('modalSubmitBtn');
        const roleField = document.getElementById('modalRole');

        if (user) {
            // 編集モード
            modalTitle.textContent = 'ユーザー編集';
            submitBtn.textContent = 'ユーザーを更新';

            document.getElementById('modalName').value = user.name || '';
            document.getElementById('modalEmail').value = user.email || '';
            roleField.value = user.role || 'user';
            document.getElementById('modalPassword').value = '';
            document.getElementById('modalPassword').removeAttribute('required');

            // 一般ユーザーはroleフィールドを変更できない
            if (!this.isAdmin) {
                roleField.disabled = true;
                roleField.style.backgroundColor = '#f5f5f5';
                roleField.style.cursor = 'not-allowed';
            } else {
                roleField.disabled = false;
                roleField.style.backgroundColor = '';
                roleField.style.cursor = '';
            }

            // ゲストユーザーは自分のパスワードを変更できない
            const passwordGroup = document.getElementById('modalPassword').closest('.form-group');
            if (!this.isAdmin && this.currentUser.role === 'guest' && String(user.id) === String(this.currentUser.id)) {
                passwordGroup.style.display = 'none';
            } else {
                // 編集モードではroleに応じてパスワード欄を制御
                this.updatePasswordFieldVisibility(user.role || 'user', true);
            }

            this.updateEmailFieldVisibility(user.role || 'user');
            this.editingUserId = user.id;
        } else {
            // 新規作成モード
            modalTitle.textContent = '新規ユーザー追加';
            submitBtn.textContent = 'ユーザーを追加';

            document.getElementById('modalName').value = '';
            document.getElementById('modalEmail').value = '';
            roleField.value = 'user';
            document.getElementById('modalPassword').value = '';

            roleField.disabled = false;
            roleField.style.backgroundColor = '';
            roleField.style.cursor = '';

            // 初期role（user）に応じてパスワード欄・メール欄を制御
            this.updatePasswordFieldVisibility('user', false);
            this.updateEmailFieldVisibility('user');

            this.editingUserId = null;
        }

        // roleの変更時にパスワード欄・メール欄を動的に制御
        roleField.onchange = () => {
            this.updatePasswordFieldVisibility(roleField.value, !!this.editingUserId);
            this.updateEmailFieldVisibility(roleField.value);
        };

        modal.classList.remove('hidden');
    }

    closeUserModal() {
        document.getElementById('userModal').classList.add('hidden');
        this.editingUserId = null;
    }

    async handleSubmit(e) {
        const formData = new FormData(e.target);
        const userData = Object.fromEntries(formData.entries());

        try {
            let response;
            let successMessage;
            
            if (this.editingUserId) {
                // 編集モード
                // パスワードが空の場合は除外
                if (!userData.password || userData.password.trim() === '') {
                    delete userData.password;
                }
                
                response = await authFetch(`${this.apiUrl}/${this.editingUserId}`, {
                    method: 'PUT',
                    body: JSON.stringify(userData)
                });
                successMessage = 'ユーザーが正常に更新されました';
            } else {
                // 新規作成モード
                response = await authFetch(this.apiUrl, {
                    method: 'POST',
                    body: JSON.stringify(userData)
                });
                successMessage = 'ユーザーが正常に追加されました';
            }

            const result = await response.json();

            if (result.success) {
                this.showNotification(successMessage, 'success');
                this.closeUserModal();
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
        const container = document.getElementById('usersTableContainer');
        container.innerHTML = '<div class="loading">読み込み中...</div>';

        try {
            console.log('About to call authFetch for:', this.apiUrl);
            const response = await authFetch(this.apiUrl);
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

    renderUsers(users) {
        const container = document.getElementById('usersTableContainer');

        if (users.length === 0) {
            container.innerHTML = '<div class="no-data">ユーザーが見つかりません</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'data-table';

        // ヘッダー作成
        const headers = [
            { key: 'name', label: '名前' },
            { key: 'email', label: 'ID/メール' },
            { key: 'role', label: '役割' },
            { key: 'createdAt', label: '作成日' },
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
        users.forEach(user => {
            const row = document.createElement('tr');

            headers.forEach(header => {
                const td = document.createElement('td');

                if (header.key === '_actions') {
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'row-actions';

                    if (this.isAdmin) {
                        const editBtn = document.createElement('button');
                        editBtn.className = 'btn-small btn-edit';
                        editBtn.textContent = '編集';
                        editBtn.addEventListener('click', () => this.editUser(user.id));
                        actionsDiv.appendChild(editBtn);

                        const deleteBtn = document.createElement('button');
                        deleteBtn.className = 'btn-small btn-delete';
                        deleteBtn.textContent = '削除';
                        deleteBtn.addEventListener('click', () => this.deleteUser(user.id));
                        actionsDiv.appendChild(deleteBtn);
                    } else if (this.currentUser.role !== 'guest') {
                        const editBtn = document.createElement('button');
                        editBtn.className = 'btn-small btn-edit';
                        editBtn.textContent = '編集';
                        editBtn.addEventListener('click', () => this.editUser(user.id));
                        actionsDiv.appendChild(editBtn);
                    }

                    td.appendChild(actionsDiv);
                } else if (header.key === 'name') {
                    td.textContent = user.name || '';
                } else if (header.key === 'role') {
                    const roleBadge = document.createElement('span');
                    roleBadge.className = `role-badge ${user.role || 'user'}`;
                    roleBadge.textContent = user.role === 'admin' ? '管理者' : user.role === 'guest' ? 'ゲスト' : 'ユーザー';
                    td.appendChild(roleBadge);
                } else if (header.key === 'createdAt') {
                    td.textContent = user.createdAt ? new Date(user.createdAt).toLocaleDateString('ja-JP') : '';
                } else {
                    td.textContent = user[header.key] || '';
                }

                row.appendChild(td);
            });

            table.appendChild(row);
        });

        container.innerHTML = '';
        container.appendChild(table);

        // 列幅リサイズ機能を初期化
        if (window.ColumnResize) {
            ColumnResize.init(table, 'users-column-widths');
        }

        // ソート機能を初期化
        if (window.TableSort) {
            TableSort.init(table);
        }
    }

    async editUser(id) {
        try {
            const response = await authFetch(`${this.apiUrl}/${id}`);
            const result = await response.json();

            if (result.success) {
                const user = result.data;
                this.openUserModal(user);
                this.showNotification(`${user.name || user.email} の編集モードになりました`, 'success');
            } else {
                this.showNotification(result.error || 'ユーザー情報の取得に失敗しました', 'error');
            }
        } catch (error) {
            this.showNotification('ユーザー情報の取得に失敗しました', 'error');
        }
    }


    async deleteUser(id) {
        if (!confirm('削除してもよろしいですか？（取り消せません）')) {
            return;
        }

        try {
            const response = await authFetch(`${this.apiUrl}/${id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('ユーザーが削除されました', 'success');
                this.loadUsers();
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