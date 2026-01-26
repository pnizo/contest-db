/**
 * 列幅リサイズ機能
 * テーブルの列幅をドラッグ＆ドロップで変更し、localStorageに保存する
 */

const ColumnResize = {
  /**
   * テーブルに列幅リサイズ機能を追加
   * @param {HTMLTableElement} table - 対象のテーブル要素
   * @param {string} storageKey - localStorage保存用のキー
   */
  init(table, storageKey) {
    if (!table || !storageKey) return;

    const headerRow = table.querySelector('thead tr, tr:first-child');
    if (!headerRow) return;

    const headers = headerRow.querySelectorAll('th');
    if (headers.length === 0) return;

    // 保存された列幅を復元
    this.restoreColumnWidths(table, storageKey, headers);

    // 各ヘッダーにリサイズハンドルを追加
    headers.forEach((th, index) => {
      // 最後の列以外にリサイズハンドルを追加
      if (index < headers.length - 1) {
        this.addResizeHandle(th, table, storageKey, headers);
      }
    });

    // テーブルにリサイズ可能クラスを追加
    table.classList.add('resizable-table');
  },

  /**
   * リサイズハンドルを追加
   */
  addResizeHandle(th, table, storageKey, headers) {
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    th.style.position = 'relative';
    th.appendChild(handle);

    let startX, startWidth, nextTh, nextStartWidth;

    const onMouseDown = (e) => {
      e.preventDefault();
      startX = e.pageX;
      startWidth = th.offsetWidth;

      // 次の列を取得
      const index = Array.from(headers).indexOf(th);
      nextTh = headers[index + 1];
      if (nextTh) {
        nextStartWidth = nextTh.offsetWidth;
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);

      // リサイズ中のカーソルスタイル
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      handle.classList.add('resizing');
    };

    const onMouseMove = (e) => {
      const diff = e.pageX - startX;
      const newWidth = Math.max(50, startWidth + diff);

      th.style.width = newWidth + 'px';
      th.style.minWidth = newWidth + 'px';

      // 対応するtdの幅も設定
      const index = Array.from(headers).indexOf(th);
      const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells[index]) {
          cells[index].style.width = newWidth + 'px';
          cells[index].style.minWidth = newWidth + 'px';
        }
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      handle.classList.remove('resizing');

      // 列幅を保存
      this.saveColumnWidths(table, storageKey, headers);
    };

    handle.addEventListener('mousedown', onMouseDown);
  },

  /**
   * 列幅をlocalStorageに保存
   */
  saveColumnWidths(table, storageKey, headers) {
    const widths = {};
    headers.forEach((th, index) => {
      widths[index] = th.offsetWidth;
    });

    try {
      localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch (e) {
      console.warn('Failed to save column widths:', e);
    }
  },

  /**
   * localStorageから列幅を復元
   */
  restoreColumnWidths(table, storageKey, headers) {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;

      const widths = JSON.parse(saved);

      headers.forEach((th, index) => {
        if (widths[index]) {
          th.style.width = widths[index] + 'px';
          th.style.minWidth = widths[index] + 'px';
        }
      });

      // 対応するtdの幅も設定
      const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        cells.forEach((td, index) => {
          if (widths[index]) {
            td.style.width = widths[index] + 'px';
            td.style.minWidth = widths[index] + 'px';
          }
        });
      });
    } catch (e) {
      console.warn('Failed to restore column widths:', e);
    }
  },

  /**
   * 保存された列幅をクリア
   */
  clearColumnWidths(storageKey) {
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
      console.warn('Failed to clear column widths:', e);
    }
  }
};

// グローバルに公開
window.ColumnResize = ColumnResize;
