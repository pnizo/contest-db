/**
 * ゼッケン番号採番 Google Apps Script
 *
 * コンテストDBの「全項目CSVエクスポート」でインポートしたスプレッドシートに対し、
 * player_no 列を自動採番する。
 *
 * 使用カラム:
 *   player_no    - 更新対象（ゼッケン番号）
 *   fwj_card_no  - 選手識別キー（同一人物判定）
 *   sort_index   - ソートキー（採番順序を決定）
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ゼッケン採番')
    .addItem('採番実行（既存番号を残す）', 'assignKeep')
    .addItem('採番実行（全て振り直し）', 'assignReassign')
    .addSeparator()
    .addItem('採番をクリア', 'clearPlayerNumbers')
    .addToUi();
}

function assignKeep() {
  assignPlayerNumbers('keep');
}

function assignReassign() {
  assignPlayerNumbers('reassign');
}

/**
 * メイン採番関数
 * @param {string} mode - 'keep'（既存番号を残す）または 'reassign'（全て振り直し）
 */
function assignPlayerNumbers(mode) {
  var sheet = SpreadsheetApp.getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var colPlayerNo = getColumnIndex(headers, 'player_no');
  var colFwjCardNo = getColumnIndex(headers, 'fwj_card_no');
  var colSortIndex = getColumnIndex(headers, 'sort_index');

  if (colPlayerNo === -1 || colFwjCardNo === -1 || colSortIndex === -1) {
    SpreadsheetApp.getUi().alert(
      'エラー: 必要なカラムが見つかりません\n' +
      '必要: player_no, fwj_card_no, sort_index'
    );
    return;
  }

  // データ行にシート上の行番号を付与してソート
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    rows.push({
      row: data[i],
      sheetRow: i + 1  // ヘッダーが1行目なのでデータは2行目から
    });
  }

  rows.sort(function(a, b) {
    var ai = parseInt(a.row[colSortIndex], 10);
    var bi = parseInt(b.row[colSortIndex], 10);
    if (isNaN(ai)) ai = 99999;
    if (isNaN(bi)) bi = 99999;
    return ai - bi;
  });

  var cardToPlayerNo = {};
  var updates = [];  // [{ sheetRow, playerNo }]

  if (mode === 'keep') {
    // 既存マッピングを収集
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i].row;
      var cardNo = String(row[colFwjCardNo] || '').trim();
      var playerNo = String(row[colPlayerNo] || '').trim();
      if (cardNo && playerNo) {
        cardToPlayerNo[cardNo] = playerNo;
      }
    }

    // 既存最大値を取得
    var maxNo = 0;
    for (var i = 0; i < rows.length; i++) {
      var pn = parseInt(rows[i].row[colPlayerNo], 10);
      if (!isNaN(pn) && pn > maxNo) {
        maxNo = pn;
      }
    }

    var counter = maxNo + 1;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i].row;
      var playerNo = String(row[colPlayerNo] || '').trim();
      var cardNo = String(row[colFwjCardNo] || '').trim();
      if (playerNo) continue;
      if (!cardNo) continue;

      var newNo;
      if (cardToPlayerNo.hasOwnProperty(cardNo)) {
        newNo = cardToPlayerNo[cardNo];
      } else {
        newNo = String(counter);
        cardToPlayerNo[cardNo] = newNo;
        counter++;
      }
      updates.push({ sheetRow: rows[i].sheetRow, playerNo: newNo });
    }

  } else if (mode === 'reassign') {
    var counter = 1;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i].row;
      var cardNo = String(row[colFwjCardNo] || '').trim();
      if (!cardNo) continue;

      var newNo;
      if (cardToPlayerNo.hasOwnProperty(cardNo)) {
        newNo = cardToPlayerNo[cardNo];
      } else {
        newNo = String(counter);
        cardToPlayerNo[cardNo] = newNo;
        counter++;
      }
      updates.push({ sheetRow: rows[i].sheetRow, playerNo: newNo });
    }
  }

  // player_no 列を一括更新
  for (var i = 0; i < updates.length; i++) {
    sheet.getRange(updates[i].sheetRow, colPlayerNo + 1).setValue(updates[i].playerNo);
  }

  var uniqueCount = Object.keys(cardToPlayerNo).length;
  SpreadsheetApp.getUi().alert(
    '採番完了\n\n' +
    '更新: ' + updates.length + '件\n' +
    'ユニーク選手数: ' + uniqueCount + '件'
  );
}

/**
 * 全行のゼッケン番号（player_no）をクリアする
 */
function clearPlayerNumbers() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.alert(
    '確認',
    '全行のゼッケン番号（player_no）をクリアしますか？',
    ui.ButtonSet.YES_NO
  );
  if (result !== ui.Button.YES) return;

  var sheet = SpreadsheetApp.getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var colPlayerNo = getColumnIndex(headers, 'player_no');

  if (colPlayerNo === -1) {
    ui.alert('エラー: player_no カラムが見つかりません');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, colPlayerNo + 1, lastRow - 1, 1).clearContent();
  }

  ui.alert('全行のゼッケン番号をクリアしました');
}

/**
 * ヘッダー配列から指定カラム名の0始まりインデックスを返す
 * @param {Array} headers - ヘッダー行の配列
 * @param {string} columnName - カラム名
 * @returns {number} 0始まりインデックス。見つからない場合は -1
 */
function getColumnIndex(headers, columnName) {
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === columnName) {
      return i;
    }
  }
  return -1;
}
