// ナビゲーション設定
const NAV_CONFIG = {
    userLink: { href: '/users', label: 'ユーザー' },
    dropdowns: [
        {
            label: '大会運営',
            items: [
                { href: '/registrations', label: '出場登録' },
                { href: '/scores', label: '大会成績' },
                { href: '/notes', label: '特記事項' },
                { href: '/subjects', label: '違反認定者', adminOnly: true },
                { href: '/contests', label: '大会基本情報' }
            ]
        },
        {
            label: '入場管理',
            items: [
                { href: '/tickets', label: 'チケット管理' },
                { href: '/guests', label: '関係者チケット' }
            ]
        },
        {
            label: 'Shopify検索',
            items: [
                { href: '/members', label: 'FWJ会員検索' },
                { href: '/orders', label: '注文検索' }
            ]
        }
    ],
    manualDropdown: {
        label: 'マニュアル',
        items: [
            { href: '/howto.html', label: '使い方' },
            { href: '/manual.html', label: '機能一覧' }
        ]
    }
};

/**
 * 現在のパスがアイテムのhrefと一致するかチェック
 */
function isCurrentPath(href) {
    const currentPath = window.location.pathname;
    // /users.html と /users の両方に対応
    return currentPath === href || currentPath === href + '.html';
}

/**
 * ドロップダウン内にアクティブなアイテムがあるかチェック
 */
function hasActiveItem(items) {
    return items.some(item => isCurrentPath(item.href));
}

/**
 * ナビゲーションHTMLを生成
 */
function renderNavigation() {
    const authActionsContainer = document.querySelector('.auth-actions');
    if (!authActionsContainer) return;

    // ナビゲーションHTML生成
    let navHtml = '<nav class="page-nav">';

    // ユーザーリンク
    const userActive = isCurrentPath(NAV_CONFIG.userLink.href) ? ' active' : '';
    navHtml += `<a href="${NAV_CONFIG.userLink.href}" class="nav-link${userActive}">${NAV_CONFIG.userLink.label}</a>`;

    // ドロップダウンメニュー
    NAV_CONFIG.dropdowns.forEach(dropdown => {
        const dropdownActive = hasActiveItem(dropdown.items) ? ' active' : '';

        navHtml += `
            <div class="nav-dropdown">
                <button class="nav-link dropdown-toggle${dropdownActive}">${dropdown.label} <span class="dropdown-arrow">▼</span></button>
                <div class="dropdown-menu">`;

        dropdown.items.forEach(item => {
            const itemActive = isCurrentPath(item.href) ? ' active' : '';
            const adminClass = item.adminOnly ? ' admin-only' : '';
            navHtml += `<a href="${item.href}" class="dropdown-item${itemActive}${adminClass}">${item.label}</a>`;
        });

        navHtml += `
                </div>
            </div>`;
    });

    navHtml += '</nav>';

    // マニュアルドロップダウン
    const md = NAV_CONFIG.manualDropdown;
    navHtml += `
        <div class="nav-dropdown manual-dropdown">
            <button class="dropdown-toggle">${md.label} <span class="dropdown-arrow">▼</span></button>
            <div class="dropdown-menu">`;
    md.items.forEach(item => {
        navHtml += `<a href="${item.href}" target="_blank" class="dropdown-item">${item.label}</a>`;
    });
    navHtml += `
            </div>
        </div>`;

    // ログアウトボタン
    navHtml += '<button id="logoutBtn" class="logout-btn">ログアウト</button>';

    authActionsContainer.innerHTML = navHtml;
}

/**
 * 管理者専用要素を表示
 */
function showAdminOnlyElements() {
    document.querySelectorAll('.admin-only').forEach(el => {
        // ドロップダウンアイテムはblock、それ以外はinline-block
        if (el.classList.contains('dropdown-item')) {
            el.style.display = 'block';
        } else {
            el.style.display = 'inline-block';
        }
    });
}

/**
 * ナビゲーション初期化（DOMContentLoaded時に呼び出し）
 */
function initNavigation() {
    renderNavigation();
}

// DOM読み込み完了時にナビゲーションを初期化
document.addEventListener('DOMContentLoaded', initNavigation);
