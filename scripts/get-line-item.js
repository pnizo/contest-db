require('dotenv').config();
const ShopifyService = require('../services/shopify');

async function main() {
  const lineItemId = process.argv[2];

  if (!lineItemId) {
    console.error('使用法: node scripts/get-line-item.js <line_item_id>');
    console.error('例: node scripts/get-line-item.js 14435344015677');
    process.exit(1);
  }

  try {
    const shopify = new ShopifyService();
    const lineItem = await shopify.getLineItemById(lineItemId);

    if (!lineItem) {
      console.error(`ラインアイテムが見つかりません: ${lineItemId}`);
      process.exit(1);
    }

    console.log(JSON.stringify(lineItem, null, 2));
  } catch (error) {
    console.error('エラー:', error.message);
    process.exit(1);
  }
}

main();
