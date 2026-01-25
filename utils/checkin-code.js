/**
 * チェックインコード検証ユーティリティ
 *
 * コード形式: XXXX-XXXX-XXXX (12文字)
 * 構造: [ticket_id: 4B][signature: 3B]
 * 合計: 7バイト → Base32で12文字
 *
 * ticket_id: 4バイト (32ビット) = 最大約43億通り
 * signature: 3バイト (24ビット) = 約1600万通り
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
 * @param {Buffer} buffer
 * @returns {string}
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
 * 数値を4バイトバッファに変換（ビッグエンディアン）
 * @param {number} num
 * @returns {Buffer}
 */
function numberToBytes(num) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(num >>> 0, 0);
  return buffer;
}

/**
 * 4バイトバッファを数値に変換（ビッグエンディアン）
 * @param {Buffer} buffer
 * @returns {number}
 */
function bytesToNumber(buffer) {
  return buffer.readUInt32BE(0);
}

/**
 * チェックインコードを検証
 * @param {string} code - ハイフン区切りのコード (XXXX-XXXX-XXXX)
 * @returns {{ valid: boolean, ticketId?: number, error?: string }}
 */
function verifyCheckinCode(code) {
  const CHECKIN_SALT = process.env.CHECKIN_SALT;

  if (!CHECKIN_SALT) {
    return { valid: false, error: 'システム設定エラー: CHECKIN_SALTが未設定です' };
  }

  try {
    // ハイフン除去 & 大文字変換
    const cleanCode = code.replace(/-/g, '').toUpperCase();

    // 長さチェック（12文字: 7バイト = 56ビット → ceil(56/5) = 12文字）
    if (cleanCode.length !== 12) {
      return { valid: false, error: '無効なコード形式です' };
    }

    // Base32デコード
    const payload = base32Decode(cleanCode);

    // 7バイト必要（ticketId 4バイト + 署名 3バイト）
    if (payload.length < 7) {
      return { valid: false, error: '無効なコードです' };
    }

    // データ部分と署名を分離
    const data = payload.slice(0, 4);      // 4バイト (ticket_id)
    const signature = payload.slice(4, 7); // 3バイト

    // 署名を再計算して検証
    const hmac = crypto.createHmac('sha256', CHECKIN_SALT);
    hmac.update(data);
    const expectedSig = hmac.digest().slice(0, 3);

    if (!signature.equals(expectedSig)) {
      return { valid: false, error: '無効なコードです' };
    }

    // ticketIdを復元
    const ticketId = bytesToNumber(data);

    return { valid: true, ticketId };
  } catch (error) {
    console.error('Checkin code verification error:', error);
    return { valid: false, error: '無効なコードです' };
  }
}

/**
 * チェックインコードを生成
 * @param {number} ticketId - チケットID（4バイト整数）
 * @returns {string} ハイフン区切りのコード (XXXX-XXXX-XXXX)
 */
function generateCheckinCode(ticketId) {
  const CHECKIN_SALT = process.env.CHECKIN_SALT;

  if (!CHECKIN_SALT) {
    throw new Error('CHECKIN_SALTが未設定です');
  }

  // ticketIdをバイト配列に変換（4バイト）
  const data = numberToBytes(ticketId);

  // HMAC署名（SHA256の先頭3バイト）
  const hmac = crypto.createHmac('sha256', CHECKIN_SALT);
  hmac.update(data);
  const signature = hmac.digest().slice(0, 3);

  // データ + 署名を結合（7バイト）
  const payload = Buffer.concat([data, signature]);

  // Base32エンコード（12文字）
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
  numberToBytes,
  bytesToNumber
};
