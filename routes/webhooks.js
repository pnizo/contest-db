const express = require('express');
const router = express.Router();
const ShopifyService = require('../services/shopify');
const Ticket = require('../models/Ticket');

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

    // 3. チケット対象の注文かチェック（タグに「観戦チケット」を含む）
    if (!order.tags || !order.tags.includes('観戦チケット')) {
      console.log('[Webhook] Not a ticket order, skipped');
      return res.status(200).json({ message: 'Not a ticket order, skipped' });
    }

    // 4. トピックに応じた処理
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
        console.log(`[Webhook] Unknown topic: ${topic}`);
        return res.status(200).json({ message: `Unknown topic: ${topic}` });
    }

    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error);
    // Webhookは常に200を返す（リトライを防ぐため）
    res.status(200).json({ success: false, error: error.message });
  }
});

module.exports = router;
