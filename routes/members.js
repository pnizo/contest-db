const express = require('express');
const Member = require('../models/Member');
const ShopifyService = require('../services/shopify');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

const memberModel = new Member();
const shopifyService = new ShopifyService();

// すべて認証が必要
router.use(requireAuth);

// 全会員データ取得（ページング付き）
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder || 'desc';

    const filters = {};
    if (req.query.search) filters.search = req.query.search;

    const result = await memberModel.findWithPaging(page, limit, filters, sortBy, sortOrder);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Members list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ShopifyからFWJ会員情報を取得（管理者のみ）
router.post('/sync', requireAdmin, async (req, res) => {
  try {
    console.log('Starting Shopify sync...');

    // Shopifyから「FWJカード会員」タグを持つ顧客を取得
    const customers = await shopifyService.getCustomersByTag('FWJカード会員');
    console.log(`Fetched ${customers.length} customers from Shopify`);

    if (customers.length === 0) {
      return res.json({
        success: true,
        message: '「FWJカード会員」タグを持つ会員が見つかりませんでした',
        synced: 0
      });
    }

    // 全顧客データをフォーマット
    const membersData = customers.map(customer =>
      shopifyService.formatCustomerForSheet(customer)
    );

    // 既存のMembersデータをクリアして、Shopifyデータで上書き
    const result = await memberModel.clearAllAndSync(membersData);

    console.log(`Sync completed: ${result.count} members synced`);

    res.json({
      success: true,
      message: result.message,
      synced: result.count
    });
  } catch (error) {
    console.error('Shopify sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 全項目CSVエクスポート
router.get('/export', async (req, res) => {
  try {
    const filters = {};
    if (req.query.search) filters.search = req.query.search;

    const result = await memberModel.findWithPaging(1, 100000, filters, 'created_at', 'desc');

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `FWJ会員_全項目_${date}.csv`;

    res.json({ success: true, data: result.data, filename });
  } catch (error) {
    console.error('Members export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 特定の会員データ取得（Shopify ID）
router.get('/:shopifyId', async (req, res) => {
  try {
    const shopifyId = req.params.shopifyId;
    const member = await memberModel.findByShopifyId(shopifyId);

    if (!member) {
      return res.status(404).json({ success: false, error: '会員が見つかりません' });
    }

    res.json({ success: true, data: member });
  } catch (error) {
    console.error('Member lookup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
