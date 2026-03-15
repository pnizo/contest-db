# GAS ゼッケン番号採番機能 仕様書

## 1. 背景・目的

現在コンテストDBの Node.js 側（`routes/registrations.js` `POST /assign-player-numbers`）で行っているゼッケン番号採番処理を、Google Apps Script（GAS）に移行する。

**目的**: 運用者がスプレッドシート上で採番結果を確認・手動調整してからDBに反映するワークフローを実現する。

## 2. 全体フロー

```
1. コンテストDB「全項目CSVエクスポート」→ CSVダウンロード
2. スプレッドシートにCSVインポート
3. GASで player_no 列を自動採番（★本仕様）
4. 運用者がスプレッドシート上で確認・手動修正
5. スプレッドシートをCSVでダウンロード
6. コンテストDB「全項目CSVインポート」→ player_noにチェックしてインポート → DB反映
```

## 3. スプレッドシート構造（前提）

コンテストDBの「全項目CSVエクスポート」で出力されるカラム一覧:

```
id, isValid, contest_date, contest_name, player_no, name_ja, name_ja_kana,
fwj_card_no, first_name, last_name, email, phone, country, province, age,
class_name, sort_index, height, weight, occupation, instagram, biography,
entry_date, back_stage_pass, is_member, createdAt, deletedAt, updatedAt, restoredAt
```

**採番処理で使用するカラム:**

| カラム名 | 説明 | 採番での役割 |
|---|---|---|
| `player_no` | ゼッケン番号 | **更新対象** |
| `fwj_card_no` | FWJカード番号 | 選手識別キー（同一人物判定） |
| `sort_index` | 開催順 | ソートキー（採番順序を決定） |

## 4. 採番ロジック

### 4.1 採番モード

| モード | 動作 |
|---|---|
| **keep**（既存番号を残す） | `player_no` が空 かつ `fwj_card_no` がある行のみ新規採番。既存番号の最大値+1から開始。 |
| **reassign**（振り直し） | `fwj_card_no` がある全行のゼッケン番号を1から振り直し。`fwj_card_no` が空の行はスキップ（既存値を保持）。 |

### 4.2 採番ルール（共通）

1. **ソート**: `sort_index` 列の値を数値として昇順ソート（空/非数値は末尾扱い = 99999）
2. **同一人物の統合**: 同じ `fwj_card_no` を持つ行には同じゼッケン番号を付与（複数クラスエントリー対応）
3. **スキップ条件**: `fwj_card_no` が空の行は採番しない（既存の `player_no` をそのまま保持）
4. **番号形式**: 整数の連番を文字列として書き込む（"1", "2", "3", ...）

### 4.3 keepモード詳細

```
1. 全行をスキャンし、fwj_card_no → 既存player_no のマッピングを収集
2. 既存 player_no の最大値（整数）を取得 → maxNo
3. counter = maxNo + 1
4. sort_index 昇順で各行を処理:
   - player_no が既にある → スキップ
   - fwj_card_no が空 → スキップ
   - fwj_card_no が既にマップにある → そのマップの番号を付与
   - それ以外 → counter の値を付与し、マップに登録、counter++
```

### 4.4 reassignモード詳細

```
1. counter = 1
2. sort_index 昇順で各行を処理:
   - fwj_card_no が空 → スキップ（既存値を保持）
   - fwj_card_no が既にマップにある → そのマップの番号を付与
   - それ以外 → counter の値を付与し、マップに登録、counter++
```

## 5. GAS関数一覧

### 5.1 `onOpen()` — カスタムメニュー追加

スプレッドシートを開いた時にメニューを追加:

```
ゼッケン採番
├── 採番実行（既存番号を残す）  → assignPlayerNumbers('keep')
├── 採番実行（全て振り直し）    → assignPlayerNumbers('reassign')
└── 採番をクリア               → clearPlayerNumbers()
```

### 5.2 `assignPlayerNumbers(mode)` — メイン採番関数

**引数**: `mode` — `'keep'` または `'reassign'`

**処理**:
1. アクティブシートからヘッダー行と全データ行を取得
2. `player_no`, `fwj_card_no`, `sort_index` のカラムインデックスを特定
3. カラムが見つからない場合はエラーダイアログを表示して終了
4. データ行を `sort_index` 昇順でソート（元の行番号を保持）
5. モードに応じた採番処理を実行
6. `player_no` 列の該当セルを一括更新
7. 結果ダイアログ: 「採番完了: N件を更新しました」

### 5.3 `clearPlayerNumbers()` — 採番クリア

確認ダイアログ後、全行の `player_no` 列を空にする。

### 5.4 `getColumnIndex(headers, columnName)` — カラムインデックス取得

ヘッダー配列から指定カラム名の0始まりインデックスを返す。見つからない場合は -1。

## 6. 擬似コード

```javascript
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ゼッケン採番')
    .addItem('採番実行（既存番号を残す）', 'assignKeep')
    .addItem('採番実行（全て振り直し）', 'assignReassign')
    .addSeparator()
    .addItem('採番をクリア', 'clearPlayerNumbers')
    .addToUi();
}

function assignKeep() { assignPlayerNumbers('keep'); }
function assignReassign() { assignPlayerNumbers('reassign'); }

function assignPlayerNumbers(mode) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const colPlayerNo = headers.indexOf('player_no');
  const colFwjCardNo = headers.indexOf('fwj_card_no');
  const colSortIndex = headers.indexOf('sort_index');

  if (colPlayerNo === -1 || colFwjCardNo === -1 || colSortIndex === -1) {
    SpreadsheetApp.getUi().alert(
      'エラー: 必要なカラムが見つかりません\n' +
      '必要: player_no, fwj_card_no, sort_index'
    );
    return;
  }

  // データ行にシート上の行番号を付与してソート
  const rows = data.slice(1).map((row, i) => ({
    row,
    sheetRow: i + 2  // ヘッダーが1行目なのでデータは2行目から
  }));

  rows.sort((a, b) => {
    const ai = parseInt(a.row[colSortIndex], 10) || 99999;
    const bi = parseInt(b.row[colSortIndex], 10) || 99999;
    return ai - bi;
  });

  const cardToPlayerNo = new Map();
  const updates = [];  // { sheetRow, playerNo }

  if (mode === 'keep') {
    // 既存マッピングを収集
    for (const { row } of rows) {
      const cardNo = String(row[colFwjCardNo] || '').trim();
      const playerNo = String(row[colPlayerNo] || '').trim();
      if (cardNo && playerNo) {
        cardToPlayerNo.set(cardNo, playerNo);
      }
    }

    // 既存最大値を取得
    let maxNo = 0;
    for (const { row } of rows) {
      const pn = parseInt(row[colPlayerNo], 10);
      if (!isNaN(pn) && pn > maxNo) maxNo = pn;
    }

    let counter = maxNo + 1;
    for (const { row, sheetRow } of rows) {
      const playerNo = String(row[colPlayerNo] || '').trim();
      const cardNo = String(row[colFwjCardNo] || '').trim();
      if (playerNo) continue;
      if (!cardNo) continue;

      let newNo;
      if (cardToPlayerNo.has(cardNo)) {
        newNo = cardToPlayerNo.get(cardNo);
      } else {
        newNo = String(counter);
        cardToPlayerNo.set(cardNo, newNo);
        counter++;
      }
      updates.push({ sheetRow, playerNo: newNo });
    }

  } else if (mode === 'reassign') {
    let counter = 1;
    for (const { row, sheetRow } of rows) {
      const cardNo = String(row[colFwjCardNo] || '').trim();
      if (!cardNo) continue;

      let newNo;
      if (cardToPlayerNo.has(cardNo)) {
        newNo = cardToPlayerNo.get(cardNo);
      } else {
        newNo = String(counter);
        cardToPlayerNo.set(cardNo, newNo);
        counter++;
      }
      updates.push({ sheetRow, playerNo: newNo });
    }
  }

  // player_no 列を一括更新
  for (const { sheetRow, playerNo } of updates) {
    sheet.getRange(sheetRow, colPlayerNo + 1).setValue(playerNo);
  }

  SpreadsheetApp.getUi().alert(
    '採番完了\n\n' +
    `更新: ${updates.length}件\n` +
    `ユニーク選手数: ${cardToPlayerNo.size}件`
  );
}

function clearPlayerNumbers() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.alert(
    '確認',
    '全行のゼッケン番号（player_no）をクリアしますか？',
    ui.ButtonSet.YES_NO
  );
  if (result !== ui.Button.YES) return;

  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colPlayerNo = headers.indexOf('player_no');

  if (colPlayerNo === -1) {
    ui.alert('エラー: player_no カラムが見つかりません');
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, colPlayerNo + 1, lastRow - 1, 1).clearContent();
  }

  ui.alert('全行のゼッケン番号をクリアしました');
}
```

## 7. 運用手順

### 事前準備（初回のみ）
1. スプレッドシートを作成
2. 「拡張機能」→「Apps Script」でGASエディタを開く
3. 上記スクリプトを貼り付けて保存
4. スプレッドシートをリロード → カスタムメニュー「ゼッケン採番」が表示される

### 毎回の採番作業
1. コンテストDB → 出場登録 →「CSV出力」→「全項目」でCSVダウンロード
2. スプレッドシートにCSVをインポート（「ファイル」→「インポート」）
3. メニュー「ゼッケン採番」→ モードを選択して実行
4. `player_no` 列を確認・手動修正
5. 「ファイル」→「ダウンロード」→「CSV」でダウンロード
6. コンテストDB → 出場登録 →「全項目CSVを適用」→ `player_no` にチェック → インポート

## 8. 注意事項

- GAS側ではデータの新規追加・削除は行わない（`player_no` 列の更新のみ）
- カラム名はCSVエクスポートの snake_case そのまま
- DBへの反映は既存の「全項目CSVインポート」機能を使用
- `isValid` フィルタリングはGAS側では不要（CSVエクスポート時点で全レコードが含まれるが、DBインポート時にidベースで更新されるため問題なし）

## 9. 検証方法

1. テスト用大会データを全項目CSVエクスポート
2. スプレッドシートにインポート
3. **keepモードテスト**: player_no が空の行のみ採番されること
4. **reassignモードテスト**: fwj_card_no がある全行が1から採番されること
5. **同一人物テスト**: 同一 fwj_card_no の行が同じ player_no になること
6. **ソート順テスト**: sort_index 昇順に採番されること
7. **DB反映テスト**: CSVダウンロード → コンテストDB全項目CSVインポートで player_no が正しく反映されること
