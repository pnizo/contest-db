#!/usr/bin/env node
/**
 * チェックインコード生成スクリプト
 *
 * 使い方:
 *   node scripts/generateCheckinCode.js <customerId> <orderId> <lineItemId> [quantity]
 *
 * 例:
 *   node scripts/generateCheckinCode.js 7531426922659 6130700075171 14551531905187 2
 */

require('dotenv').config();
const { generateCheckinCode, verifyCheckinCode } = require('../utils/checkin-code');

const args = process.argv.slice(2);

if (args.length < 3) {
  console.log('チェックインコード生成スクリプト');
  console.log('');
  console.log('使い方:');
  console.log('  node scripts/generateCheckinCode.js <customerId> <orderId> <lineItemId> [quantity]');
  console.log('');
  console.log('引数:');
  console.log('  customerId  - Shopify顧客ID');
  console.log('  orderId     - Shopify注文ID');
  console.log('  lineItemId  - Shopify明細ID');
  console.log('  quantity    - チケット枚数 (省略時: 1)');
  console.log('');
  console.log('例:');
  console.log('  node scripts/generateCheckinCode.js 7531426922659 6130700075171 14551531905187 2');
  process.exit(1);
}

const customerId = args[0];
const orderId = args[1];
const lineItemId = args[2];
const quantity = parseInt(args[3]) || 1;

console.log('=== チェックインコード生成 ===');
console.log('');
console.log('入力値:');
console.log('  customerId:', customerId);
console.log('  orderId:', orderId);
console.log('  lineItemId:', lineItemId);
console.log('  quantity:', quantity);
console.log('');

try {
  const code = generateCheckinCode(customerId, orderId, lineItemId, quantity);
  console.log('生成されたコード:');
  console.log('  ', code);
  console.log('');

  // 検証テスト
  const verification = verifyCheckinCode(code);
  if (verification.valid) {
    console.log('検証テスト: ✅ 成功');
    console.log('  復元されたID:');
    console.log('    customerId:', verification.customerId);
    console.log('    orderId:', verification.orderId);
    console.log('    lineItemId:', verification.lineItemId);
    console.log('    quantity:', verification.quantity);
  } else {
    console.log('検証テスト: ❌ 失敗');
    console.log('  エラー:', verification.error);
  }
} catch (error) {
  console.error('エラー:', error.message);
  process.exit(1);
}
