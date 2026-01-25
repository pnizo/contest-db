# チェックインコード仕様書

## 概要

チケットごとに一意のチェックインコードを生成し、受付時に検証するための仕様です。

## コード形式

```
XXXX-XXXX-XXXX
```

- **文字数**: 12文字（ハイフン除く）
- **使用文字**: Base32（後述）
- **表示形式**: 4文字ごとにハイフン区切り

### 例
```
A7KP-N3QW-RVXT
```

---

## データ構造

| フィールド | サイズ | 説明 |
|-----------|--------|------|
| ticket_id | 4バイト | チケットの一意ID（符号なし32ビット整数） |
| signature | 3バイト | HMAC-SHA256署名の先頭3バイト |
| **合計** | **7バイト** | Base32で12文字 |

### ticket_id

- **形式**: 符号なし32ビット整数（0〜4,294,967,295）
- **生成方法**: 暗号学的に安全な乱数で生成
- **保存**: Ticketsシートの`id`列に数値として保存

---

## Base32エンコーディング

紛らわしい文字を除外したカスタムBase32を使用します。

### 文字セット（32文字）

```
ABCDEFGHJKLMNPQRSTUVWXYZ23456789
```

**除外文字**:
- `0`（ゼロ）と `O`（オー）
- `1`（イチ）と `I`（アイ）

### エンコード手順

1. バイト列を5ビット単位で分割
2. 各5ビット値（0-31）を文字セットの対応文字に変換
3. 7バイト = 56ビット → 56÷5 = 11.2 → 12文字（端数は左パディング）

---

## 生成アルゴリズム

### 前提条件

- `CHECKIN_SALT`: 共有秘密鍵（環境変数で管理）
- `ticket_id`: チケットの数値ID

### 手順

```
1. ticket_id を4バイトのビッグエンディアンバイト列に変換
   例: 1234567890 → [0x49, 0x96, 0x02, 0xD2]

2. HMAC-SHA256で署名を生成
   signature = HMAC-SHA256(CHECKIN_SALT, ticket_id_bytes)

3. 署名の先頭3バイトを取得
   signature_3bytes = signature[0:3]

4. ticket_id (4バイト) + signature (3バイト) を結合
   payload = ticket_id_bytes + signature_3bytes  // 7バイト

5. Base32エンコード
   code = base32_encode(payload)  // 12文字

6. 4文字ごとにハイフンで区切る
   formatted_code = "XXXX-XXXX-XXXX"
```

### 疑似コード

```javascript
function generateCheckinCode(ticketId, salt) {
  // 1. ticket_id を4バイトに変換（ビッグエンディアン）
  const ticketIdBytes = new Uint8Array(4);
  ticketIdBytes[0] = (ticketId >>> 24) & 0xff;
  ticketIdBytes[1] = (ticketId >>> 16) & 0xff;
  ticketIdBytes[2] = (ticketId >>> 8) & 0xff;
  ticketIdBytes[3] = ticketId & 0xff;

  // 2. HMAC-SHA256で署名
  const signature = hmacSha256(salt, ticketIdBytes);

  // 3. 署名の先頭3バイトを取得
  const sig3 = signature.slice(0, 3);

  // 4. 結合（7バイト）
  const payload = concat(ticketIdBytes, sig3);

  // 5. Base32エンコード
  const code = base32Encode(payload);

  // 6. ハイフン区切り
  return code.match(/.{4}/g).join('-');
}
```

---

## 検証アルゴリズム

### 手順

```
1. ハイフンを除去し、大文字に変換
   clean_code = code.replace('-', '').toUpperCase()

2. 文字数チェック（12文字であること）

3. Base32デコード
   payload = base32_decode(clean_code)  // 7バイト

4. ticket_id と signature を分離
   ticket_id_bytes = payload[0:4]
   signature = payload[4:7]

5. 署名を再計算
   expected_sig = HMAC-SHA256(CHECKIN_SALT, ticket_id_bytes)[0:3]

6. 署名を比較
   if (signature !== expected_sig) → 無効なコード

7. ticket_id を復元
   ticket_id = bytes_to_uint32(ticket_id_bytes)

8. Ticketsシートで ticket_id を検索してチケット情報を取得
```

---

## Base32エンコード/デコード実装

### エンコード

```javascript
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function base32Encode(bytes) {
  let result = '';
  let bits = 0;
  let current = 0;

  for (const byte of bytes) {
    current = (current << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      const index = (current >> bits) & 0x1f;
      result += ALPHABET[index];
      current = current & ((1 << bits) - 1);
    }
  }

  if (bits > 0) {
    const index = (current << (5 - bits)) & 0x1f;
    result += ALPHABET[index];
  }

  return result;
}
```

### デコード

```javascript
const LOOKUP = {};
for (let i = 0; i < ALPHABET.length; i++) {
  LOOKUP[ALPHABET[i]] = i;
}

function base32Decode(str) {
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of str.toUpperCase()) {
    const charValue = LOOKUP[char];
    if (charValue === undefined) {
      throw new Error('無効な文字');
    }

    value = (value << 5) | charValue;
    bits += 5;

    while (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}
```

---

## セキュリティ考慮事項

### CHECKIN_SALT

- **長さ**: 32文字以上を推奨
- **生成**: 暗号学的に安全な乱数で生成
- **管理**: 環境変数として厳重に管理
- **共有**: コード生成側と検証側で同一の値を使用

### 署名の強度

- 3バイト = 24ビット = 約1,600万通り
- ブルートフォース対策としてレート制限を推奨

### ticket_id の生成

- `crypto.randomBytes(4)` 等で暗号学的に安全な乱数を使用
- 連番は使用しない（推測可能になるため）

---

## 実装例（Node.js）

```javascript
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SALT = process.env.CHECKIN_SALT;

// チケットID生成
function generateTicketId() {
  return crypto.randomBytes(4).readUInt32BE(0);
}

// チェックインコード生成
function generateCheckinCode(ticketId) {
  const data = Buffer.alloc(4);
  data.writeUInt32BE(ticketId, 0);

  const hmac = crypto.createHmac('sha256', SALT);
  hmac.update(data);
  const signature = hmac.digest().slice(0, 3);

  const payload = Buffer.concat([data, signature]);
  const code = base32Encode(payload);

  return code.match(/.{4}/g).join('-');
}

// 使用例
const ticketId = generateTicketId();
const code = generateCheckinCode(ticketId);
console.log(`Ticket ID: ${ticketId}`);
console.log(`Code: ${code}`);
```

---

## 変更履歴

| 日付 | バージョン | 変更内容 |
|------|-----------|----------|
| 2025-01-25 | 1.0 | 初版作成。36文字形式から12文字形式に変更 |
