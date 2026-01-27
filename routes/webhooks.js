const express = require('express');
const router = express.Router();
const ShopifyService = require('../services/shopify');
const Ticket = require('../models/Ticket');

// 処理中の注文を追跡（重複Webhook対策）
const processingOrders = new Map();
const PROCESSING_TIMEOUT_MS = 30000; // 30秒

// Shopify Webhook受信
router.post('/shopify/:topic', async (req, res) => {
  const topic = req.params.topic; // orders-create, orders-updated, orders-cancelled
  const hmac = req.get('X-Shopify-Hmac-SHA256');
  const shopifyService = new ShopifyService();

  console.log(`[Webhook] Received: ${topic}`);

  // 1. 署名検証
  if (!shopifyService.verifyWebhookSignature(req.body, hmac)) {
    console.error('[Webhook] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    // 2. JSONパース
    const order = JSON.parse(req.body.toString());

    console.log(`[Webhook] Order: ${order.name}, Tags: ${order.tags || 'none'}`);

    // 3. 重複Webhook対策（同じ注文IDが短時間内に処理中なら待機またはスキップ）
    const orderKey = `${order.id}`;
    if (processingOrders.has(orderKey)) {
      console.log(`[Webhook] Order ${order.name} is already being processed, skipped`);
      return res.status(200).json({ message: 'Duplicate webhook, skipped' });
    }

    // 処理中フラグをセット
    processingOrders.set(orderKey, Date.now());
    // タイムアウト後に自動削除
    setTimeout(() => processingOrders.delete(orderKey), PROCESSING_TIMEOUT_MS);

    // 4. チケット対象の注文かチェック（lineItemのproductTypeに「観戦チケット」を含む）
    const hasTicketProduct = await shopifyService.orderHasProductType(order.id, '観戦チケット');
    if (!hasTicketProduct) {
      processingOrders.delete(orderKey);
      console.log('[Webhook] Not a ticket order (no ticket productType), skipped');
      return res.status(200).json({ message: 'Not a ticket order, skipped' });
    }

    // 5. トピックに応じた処理
    const ticket = new Ticket();
    let result;

    switch (topic) {
      case 'orders-create':
      case 'orders-updated':
        const ticketData = await shopifyService.formatWebhookOrderForTicket(order);
        result = await ticket.upsertFromWebhook(ticketData);
        console.log(`[Webhook] Upsert result:`, result);
        break;

      case 'orders-cancelled':
        result = await ticket.cancelByOrderNo(order.name);
        console.log(`[Webhook] Cancel result:`, result);
        break;

      default:
        processingOrders.delete(orderKey);
        console.log(`[Webhook] Unknown topic: ${topic}`);
        return res.status(200).json({ message: `Unknown topic: ${topic}` });
    }

    // 処理完了、フラグを削除
    processingOrders.delete(orderKey);
    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error);
    // Webhookは常に200を返す（リトライを防ぐため）
    res.status(200).json({ success: false, error: error.message });
  }
});

module.exports = router;
