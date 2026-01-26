/**
 * テーブルソート機能 - 全画面共通ユーティリティ
 *
 * 使い方:
 * 1. HTMLに <script src="table-sort.js"></script> を追加
 * 2. テーブル作成後に TableSort.init(table) を呼び出す
 */
const TableSort = {
    /**
     * テーブルにソート機能を追加
     * @param {HTMLTableElement} table - 対象のテーブル要素
     * @param {Object} options - オプション
     * @param {Array<string>} options.excludeColumns - ソート対象外の列キー（例: ['_actions', 'actions']）
     */
    init(table, options = {}) {
        if (!table) return;

        const excludeColumns = options.excludeColumns || ['_actions', 'actions'];
        const headers = table.querySelectorAll('th');

        headers.forEach((th, index) => {
            // 操作列はソート対象外
            if (th.classList.contains('actions-header') ||
                excludeColumns.includes(th.dataset.column)) {
                return;
            }

            th.classList.add('sortable');
            th.style.cursor = 'pointer';
            th.style.userSelect = 'none';

            // ソートインジケーターを追加
            if (!th.querySelector('.sort-indicator')) {
                const indicator = document.createElement('span');
                indicator.className = 'sort-indicator';
                indicator.style.marginLeft = '5px';
                indicator.style.opacity = '0.3';
                indicator.textContent = '⇅';
                th.appendChild(indicator);
            }

            th.addEventListener('click', () => {
                this.sortTable(table, index, th);
            });
        });
    },

    /**
     * テーブルをソート
     * @param {HTMLTableElement} table - 対象のテーブル要素
     * @param {number} columnIndex - ソートする列のインデックス
     * @param {HTMLTableCellElement} clickedHeader - クリックされたヘッダー
     */
    sortTable(table, columnIndex, clickedHeader) {
        const tbody = table.querySelector('tbody') || table;
        const rows = Array.from(tbody.querySelectorAll('tr')).filter(row => row.querySelector('td'));
        const headers = table.querySelectorAll('th');

        // 現在のソート方向を取得
        const currentDirection = clickedHeader.dataset.sortDirection || '';
        const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';

        // 全ヘッダーのソート状態をリセット
        headers.forEach(th => {
            th.dataset.sortDirection = '';
            th.classList.remove('sorted', 'asc', 'desc');
            const indicator = th.querySelector('.sort-indicator');
            if (indicator) {
                indicator.textContent = '⇅';
                indicator.style.opacity = '0.3';
            }
        });

        // クリックされたヘッダーにソート状態を設定
        clickedHeader.dataset.sortDirection = newDirection;
        clickedHeader.classList.add('sorted', newDirection);
        const indicator = clickedHeader.querySelector('.sort-indicator');
        if (indicator) {
            indicator.textContent = newDirection === 'asc' ? '↑' : '↓';
            indicator.style.opacity = '1';
        }

        // ソート処理
        rows.sort((a, b) => {
            const aCell = a.querySelectorAll('td')[columnIndex];
            const bCell = b.querySelectorAll('td')[columnIndex];

            if (!aCell || !bCell) return 0;

            let aValue = this.getCellValue(aCell);
            let bValue = this.getCellValue(bCell);

            // 比較
            const comparison = this.compare(aValue, bValue);
            return newDirection === 'asc' ? comparison : -comparison;
        });

        // 並び替えた行をテーブルに再配置
        const headerRow = table.querySelector('tr:first-child');
        rows.forEach(row => {
            tbody.appendChild(row);
        });
    },

    /**
     * セルの値を取得
     * @param {HTMLTableCellElement} cell - セル要素
     * @returns {string|number} セルの値
     */
    getCellValue(cell) {
        // チェックボックスの場合
        const checkbox = cell.querySelector('input[type="checkbox"]');
        if (checkbox) {
            return checkbox.checked ? 1 : 0;
        }

        // テキストを取得
        let text = cell.textContent.trim();

        // 円マークや数値フォーマットを処理
        if (text.startsWith('¥') || text.startsWith('$')) {
            text = text.replace(/[¥$,]/g, '');
        }

        // 数値として解析を試みる
        const num = parseFloat(text);
        if (!isNaN(num) && text !== '') {
            return num;
        }

        // 日付として解析を試みる
        const date = Date.parse(text);
        if (!isNaN(date)) {
            return date;
        }

        return text.toLowerCase();
    },

    /**
     * 2つの値を比較
     * @param {*} a - 値1
     * @param {*} b - 値2
     * @returns {number} 比較結果
     */
    compare(a, b) {
        // nullまたは空文字の処理
        if (a === '' || a === null || a === undefined) return 1;
        if (b === '' || b === null || b === undefined) return -1;

        // 数値の比較
        if (typeof a === 'number' && typeof b === 'number') {
            return a - b;
        }

        // 文字列の比較
        return String(a).localeCompare(String(b), 'ja');
    }
};

// グローバルに公開
window.TableSort = TableSort;
