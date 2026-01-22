# チェックインコード仕様書

fitness-app でのコード生成実装用ドキュメント

## 概要

イベント会場でのチケット受付に使用するチェックインコード。
ユーザーがShopifyで購入したチケットの `customer_id`, `order_id`, `line_item_id`, `quantity` をエンコードし、HMAC署名で保護する。

## コード形式

```
AXNH-MHLB-AWCX-S7N7-JEDA-YQVV-32Z9-EA7G-47FS
```

- **36文字**（Base32エンコード）
- **4文字ごとにハイフン区切り**（読みやすさのため）
- 合計44文字（ハイフン含む）

## データ構造

| フィールド | バイト数 | 説明 |
|-----------|---------|------|
| customer_id | 6 | Shopify顧客ID（下位6バイト） |
| order_id | 6 | Shopify注文ID（下位6バイト） |
| line_item_id | 6 | Shopify LineItem ID（下位6バイト） |
| quantity | 1 | チケット枚数（1-255） |
| signature | 3 | HMAC-SHA256署名（先頭3バイト） |
| **合計** | **22** | Base32で36文字 |

- 6バイトの最大値: 281,474,976,710,655（約281兆）→ Shopifyの13-14桁IDに対応
- quantityの最大値: 255

## Base32アルファベット

紛らわしい文字（`0`, `O`, `1`, `I`）を除外した32文字:

```
ABCDEFGHJKLMNPQRSTUVWXYZ23456789
```

| Index | 0-7 | 8-15 | 16-23 | 24-31 |
|-------|-----|------|-------|-------|
| Char | A-H | J-R | S-Z | 2-9 |

## 環境変数

```env
CHECKIN_SALT=your-shared-secret-key
```

**重要**: `fitness-app` と `spreadsheet-db` で同じ値を設定すること

## 生成アルゴリズム

### JavaScript実装例

```javascript
const crypto = require('crypto');

// Base32アルファベット（I, O を除外）
const BASE32_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * BigIntを固定長バイト配列に変換
 */
function bigIntToBytes(num, byteLength) {
  const bytes = Buffer.alloc(byteLength);
  let n = BigInt(num);
  for (let i = byteLength - 1; i >= 0; i--) {
    bytes[i] = Number(n & 0xffn);
    n = n >> 8n;
  }
  return bytes;
}

/**
 * バイト配列をBase32エンコード
 */
function base32Encode(buffer) {
  let result = '';
  let bits = 0;
  let current = 0;

  for (let i = 0; i < buffer.length; i++) {
    current = (current << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      const index = (current >> bits) & 0x1f;
      result += BASE32_ALPHABET[index];
      current = current & ((1 << bits) - 1);
    }
  }

  if (bits > 0) {
    const index = (current << (5 - bits)) & 0x1f;
    result += BASE32_ALPHABET[index];
  }

  return result;
}

/**
 * チェックインコードを生成
 * @param {string|number} customerId - Shopify顧客ID
 * @param {string|number} orderId - Shopify注文ID
 * @param {string|number} lineItemId - Shopify LineItem ID
 * @param {number} quantity - チケット枚数（1-255）
 * @returns {string} ハイフン区切りのチェックインコード
 */
function generateCheckinCode(customerId, orderId, lineItemId, quantity) {
  const CHECKIN_SALT = process.env.CHECKIN_SALT;
  
  if (!CHECKIN_SALT) {
    throw new Error('CHECKIN_SALT環境変数が未設定です');
  }

  // quantityの検証
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty < 1 || qty > 255) {
    throw new Error('quantityは1-255の範囲で指定してください');
  }

  // 各IDを6バイトのバイト配列に変換
  const cidBytes = bigIntToBytes(customerId, 6);
  const oidBytes = bigIntToBytes(orderId, 6);
  const lidBytes = bigIntToBytes(lineItemId, 6);
  const qtyByte = Buffer.from([qty]);

  // データ部分を結合（19バイト）
  const data = Buffer.concat([cidBytes, oidBytes, lidBytes, qtyByte]);

  // HMAC-SHA256署名（先頭3バイトのみ使用）
  const hmac = crypto.createHmac('sha256', CHECKIN_SALT);
  hmac.update(data);
  const signature = hmac.digest().slice(0, 3);

  // データ + 署名を結合（22バイト）
  const payload = Buffer.concat([data, signature]);

  // Base32エンコード（36文字）
  const code = base32Encode(payload);

  // 4文字ごとにハイフン区切り
  return code.match(/.{1,4}/g).join('-');
}

module.exports = { generateCheckinCode };
```

### 使用例

```javascript
const { generateCheckinCode } = require('./checkin-code');

// Shopify GraphQL APIから取得したID（gid://形式から数値部分を抽出）
const customerId = '5877488500997';  // gid://shopify/Customer/5877488500997
const orderId = '5877488500998';      // gid://shopify/Order/5877488500998
const lineItemId = '12345678901234';  // gid://shopify/LineItem/12345678901234
const quantity = 3;                   // 購入枚数

const code = generateCheckinCode(customerId, orderId, lineItemId, quantity);
console.log(code);
// 出力例: AXNH-MHLB-AWCX-S7N7-JEDA-YQVV-32Z9-EA7G-47FS
```

## GIDからIDを抽出

Shopify GraphQL APIのIDは `gid://shopify/Order/123456789` 形式。数値部分のみ使用:

```javascript
function extractIdFromGid(gid) {
  const match = gid.match(/\/(\d+)$/);
  return match ? match[1] : gid;
}

// 使用例
const orderId = extractIdFromGid('gid://shopify/Order/5877488500997');
// => '5877488500997'
```

## QRコード生成

生成したコードをQRコードにする場合:

```javascript
const QRCode = require('qrcode');

const code = generateCheckinCode(customerId, orderId, lineItemId);

// Data URL形式で生成（img srcに使用可能）
const qrDataUrl = await QRCode.toDataURL(code, {
  errorCorrectionLevel: 'M',
  margin: 2,
  width: 200
});

// または Canvas に描画
await QRCode.toCanvas(canvasElement, code);
```

## 検証フロー（spreadsheet-db側）

```
1. コード入力（手入力 or QRスキャン）
2. ハイフン除去 & Base32デコード
3. データ部分（19バイト）と署名（3バイト）を分離
4. HMAC-SHA256で署名を再計算・照合
5. 一致すればID + quantityを復元
6. Shopify APIで currentQuantity をデクリメント
```

## セキュリティ

| 項目 | 設計 |
|------|------|
| 認証 | HMAC署名検証（CHECKIN_SALTを知らないと生成不可） |
| 改ざん防止 | 3バイト署名で保護（衝突確率: 1/16,777,216） |
| 使用回数制限 | Shopify側の currentQuantity で管理 |
| ログイン不要 | 署名検証のみで受付可能 |

## テスト

生成したコードが正しいか確認:

```bash
# spreadsheet-db で検証テスト
curl -X POST http://localhost:3000/api/orders/checkin \
  -H "Content-Type: application/json" \
  -d '{"code": "AXNH-MHLB-AWCX-S7N7-JEDA-YQVV-32Z9-EA7G-47FS"}'
```

成功レスポンス:
```json
{
  "success": true,
  "message": "受付完了",
  "orderName": "#1234",
  "productName": "イベントチケット",
  "ticketQuantity": 3,
  "previousQuantity": 3,
  "newQuantity": 2
}
```

| フィールド | 説明 |
|-----------|------|
| ticketQuantity | コードに埋め込まれた購入枚数（変更不可） |
| previousQuantity | チェックイン前の残り枚数 |
| newQuantity | チェックイン後の残り枚数 |
