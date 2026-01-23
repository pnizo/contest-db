/**
 * チェックインコード検証ユーティリティ
 * 
 * コード形式: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (36文字)
 * 構造: [customer_id: 6B][order_id: 6B][line_item_id: 6B][quantity: 1B][signature: 3B]
 * 合計: 22バイト → Base32で36文字
 * 
 * 6バイトの最大値: 281,474,976,710,655 (約281兆) - Shopifyの13-14桁IDに対応
 * quantityの最大値: 255
 */

const crypto = require('crypto');

// Base32文字セット（紛らわしい文字を除外: 0, O, 1, I）
// 32文字: A-Z から I, O を除外 (24文字) + 2-9 (8文字) = 32文字
const BASE32_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BASE32_LOOKUP = {};
for (let i = 0; i < BASE32_ALPHABET.length; i++) {
  BASE32_LOOKUP[BASE32_ALPHABET[i]] = i;
}

/**
 * バイト配列をBase32エンコード
 * オーバーフローを防ぐため、5バイト単位で処理
 * @param {Buffer} buffer
 * @returns {string}
 */
function base32Encode(buffer) {
  let result = '';
  let bits = 0;
  let current = 0;

  for (let i = 0; i < buffer.length; i++) {
    // 現在のバイトを追加
    current = (current << 8) | buffer[i];
    bits += 8;

    // 5ビット単位で文字に変換
    while (bits >= 5) {
      bits -= 5;
      const index = (current >> bits) & 0x1f;
      result += BASE32_ALPHABET[index];
      // 使用済みのビットをクリア（オーバーフロー防止）
      current = current & ((1 << bits) - 1);
    }
  }

  // 残りのビットがあれば左にパディングして出力
  if (bits > 0) {
    const index = (current << (5 - bits)) & 0x1f;
    result += BASE32_ALPHABET[index];
  }

  return result;
}

/**
 * Base32デコード
 * @param {string} str
 * @returns {Buffer}
 */
function base32Decode(str) {
  const cleanStr = str.toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < cleanStr.length; i++) {
    const char = cleanStr[i];
    const charValue = BASE32_LOOKUP[char];
    
    if (charValue === undefined) {
      throw new Error(`無効な文字: ${char}`);
    }

    value = (value << 5) | charValue;
    bits += 5;

    while (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }

  return Buffer.from(bytes);
}

/**
 * BigIntをバイト配列に変換（固定長）
 * @param {BigInt} num
 * @param {number} byteLength
 * @returns {Buffer}
 */
function bigIntToBytes(num, byteLength) {
  const bytes = Buffer.alloc(byteLength);
  let n = num;
  for (let i = byteLength - 1; i >= 0; i--) {
    bytes[i] = Number(n & 0xffn);
    n = n >> 8n;
  }
  return bytes;
}

/**
 * バイト配列をBigIntに変換
 * @param {Buffer} bytes
 * @returns {BigInt}
 */
function bytesToBigInt(bytes) {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

/**
 * チェックインコードを検証
 * @param {string} code - ハイフン区切りのコード
 * @returns {{ valid: boolean, customerId?: string, orderId?: string, lineItemId?: string, quantity?: number, error?: string }}
 */
function verifyCheckinCode(code) {
  const CHECKIN_SALT = process.env.CHECKIN_SALT;

  console.log('[verifyCheckinCode] Starting verification');
  console.log('[verifyCheckinCode] CHECKIN_SALT set:', !!CHECKIN_SALT);
  if (CHECKIN_SALT) {
    // SALTの先頭文字だけ表示（デバッグ用、セキュリティのため一部のみ）
    console.log('[verifyCheckinCode] CHECKIN_SALT starts with:', CHECKIN_SALT.substring(0, 3) + '...');
  }

  if (!CHECKIN_SALT) {
    return { valid: false, error: 'システム設定エラー: CHECKIN_SALTが未設定です' };
  }

  try {
    // ハイフン除去 & 大文字変換
    const cleanCode = code.replace(/-/g, '').toUpperCase();
    console.log('[verifyCheckinCode] Clean code:', cleanCode);
    console.log('[verifyCheckinCode] Code length:', cleanCode.length);

    // 長さチェック（36文字: 22バイト = 176ビット → ceil(176/5) = 36文字）
    if (cleanCode.length !== 36) {
      console.log('[verifyCheckinCode] Invalid code length, expected 36');
      return { valid: false, error: '無効なコード形式です' };
    }

    // Base32デコード
    const payload = base32Decode(cleanCode);
    console.log('[verifyCheckinCode] Decoded payload length:', payload.length);
    console.log('[verifyCheckinCode] Payload hex:', payload.toString('hex'));

    // 22バイト必要（データ19バイト + 署名3バイト）
    if (payload.length < 22) {
      console.log('[verifyCheckinCode] Payload too short, expected >= 22');
      return { valid: false, error: '無効なコードです' };
    }

    // データ部分と署名を分離
    const data = payload.slice(0, 19);      // 19バイト (6+6+6+1)
    const signature = payload.slice(19, 22); // 3バイト
    console.log('[verifyCheckinCode] Data hex:', data.toString('hex'));
    console.log('[verifyCheckinCode] Signature hex:', signature.toString('hex'));

    // 署名を再計算して検証
    const hmac = crypto.createHmac('sha256', CHECKIN_SALT);
    hmac.update(data);
    const expectedSig = hmac.digest().slice(0, 3);
    console.log('[verifyCheckinCode] Expected signature hex:', expectedSig.toString('hex'));
    console.log('[verifyCheckinCode] Signature match:', signature.equals(expectedSig));

    if (!signature.equals(expectedSig)) {
      console.log('[verifyCheckinCode] Signature mismatch!');
      return { valid: false, error: '無効なコードです' };
    }

    // IDとquantityを復元
    const customerId = bytesToBigInt(data.slice(0, 6)).toString();
    const orderId = bytesToBigInt(data.slice(6, 12)).toString();
    const lineItemId = bytesToBigInt(data.slice(12, 18)).toString();
    const quantity = data[18];  // 1バイト (0-255)

    console.log('[verifyCheckinCode] Extracted IDs:');
    console.log('  customerId:', customerId);
    console.log('  orderId:', orderId);
    console.log('  lineItemId:', lineItemId);
    console.log('  quantity:', quantity);

    return { valid: true, customerId, orderId, lineItemId, quantity };
  } catch (error) {
    console.error('Checkin code verification error:', error);
    return { valid: false, error: '無効なコードです' };
  }
}

/**
 * チェックインコードを生成（テスト用）
 * @param {string} customerId
 * @param {string} orderId
 * @param {string} lineItemId
 * @param {number} quantity - チケット枚数 (1-255)
 * @returns {string}
 */
function generateCheckinCode(customerId, orderId, lineItemId, quantity) {
  const CHECKIN_SALT = process.env.CHECKIN_SALT;
  
  if (!CHECKIN_SALT) {
    throw new Error('CHECKIN_SALTが未設定です');
  }

  // quantityの検証
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty < 1 || qty > 255) {
    throw new Error('quantityは1-255の範囲で指定してください');
  }

  // IDを数値からバイト配列に変換（6バイト = 最大281兆）
  const cidBytes = bigIntToBytes(BigInt(customerId), 6);
  const oidBytes = bigIntToBytes(BigInt(orderId), 6);
  const lidBytes = bigIntToBytes(BigInt(lineItemId), 6);
  const qtyByte = Buffer.from([qty]);

  // データ部分を結合（19バイト）
  const data = Buffer.concat([cidBytes, oidBytes, lidBytes, qtyByte]);

  // HMAC署名（SHA256の先頭3バイト）
  const hmac = crypto.createHmac('sha256', CHECKIN_SALT);
  hmac.update(data);
  const signature = hmac.digest().slice(0, 3);

  // データ + 署名を結合（22バイト）
  const payload = Buffer.concat([data, signature]);

  // Base32エンコード（36文字）
  const code = base32Encode(payload);

  // ハイフン区切り（4文字ごと）
  return code.match(/.{1,4}/g).join('-');
}

module.exports = {
  verifyCheckinCode,
  generateCheckinCode,
  // テスト用にエクスポート
  base32Encode,
  base32Decode,
  bigIntToBytes,
  bytesToBigInt
};
