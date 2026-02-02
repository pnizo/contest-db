const express = require('express');
const router = express.Router();
const ShopifyService = require('../services/shopify');
const Ticket = require('../models/Ticket');

// Shopify Webhook受信
router.post('/shopify/:topic', async (req, res) => {
  const topic = req.params.topic;
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

    // 3. orders-updated 以外は無視
    if (topic !== 'orders-updated') {
      console.log(`[Webhook] Topic ${topic} is not supported, skipped`);
      return res.status(200).json({ message: `Topic ${topic} is not supported` });
    }

    // 4. チケット対象の注文かチェック（ペイロードのtagsから判定）
    const tags = (order.tags || '').split(',').map(t => t.trim());
    if (!tags.includes('観戦チケット')) {
      console.log('[Webhook] Not a ticket order (no ticket tag), skipped');
      return res.status(200).json({ message: 'Not a ticket order, skipped' });
    }

    // 5. チケット更新
    const ticket = new Ticket();
    const result = await ticket.upsertByOrder(order);
    console.log(`[Webhook] Upsert result:`, result);

    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error);
    res.status(200).json({ success: false, error: error.message });
  }
});

module.exports = router;
