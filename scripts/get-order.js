require('dotenv').config();
const ShopifyService = require('../services/shopify');

async function main() {
  const orderId = process.argv[2];

  if (!orderId) {
    console.error('使用法: node scripts/get-order.js <order_id>');
    console.error('例: node scripts/get-order.js 6072988549437');
    process.exit(1);
  }

  try {
    const shopify = new ShopifyService();
    const order = await shopify.getOrderById(orderId);

    if (!order) {
      console.error(`注文が見つかりません: ${orderId}`);
      process.exit(1);
    }

    console.log(JSON.stringify(order, null, 2));
  } catch (error) {
    console.error('エラー:', error.message);
    process.exit(1);
  }
}

main();
