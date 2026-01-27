const express = require('express');
const Ticket = require('../models/Ticket');
const ShopifyService = require('../services/shopify');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

const ticketModel = new Ticket();

// サービスの遅延初期化
let shopifyService = null;

function getShopifyService() {
  if (!shopifyService) {
    shopifyService = new ShopifyService();
  }
  return shopifyService;
}

// すべて認証が必要
router.use(requireAuth);

// GET /filter-options - フィルターオプション取得
router.get('/filter-options', async (req, res) => {
  try {
    const options = await ticketModel.getFilterOptions();
    res.json({
      success: true,
      data: options
    });
  } catch (error) {
    console.error('Filter options error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET / - チケット一覧取得（ページング付き）
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      product_name,
      financial_status,
      fulfillment_status,
      shopify_id_filter,
      valid_only,
      search,
      startDate,
      endDate,
      sortBy = 'id',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};
    if (product_name) filters.product_name = product_name;
    if (financial_status) filters.financial_status = financial_status;
    if (fulfillment_status) filters.fulfillment_status = fulfillment_status;
    if (shopify_id_filter) filters.shopify_id_filter = shopify_id_filter;
    if (valid_only) filters.valid_only = valid_only;
    if (search) filters.search = search;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const result = await ticketModel.findWithPaging(
      parseInt(page),
      Math.min(parseInt(limit), 100),
      filters,
      sortBy,
      sortOrder
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id - 特定チケット取得
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({
        success: false,
        error: '無効なIDです'
      });
    }

    const ticket = await ticketModel.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'チケットが見つかりません'
      });
    }

    res.json({ success: true, data: ticket });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - チケット更新（管理者のみ）
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({
        success: false,
        error: '無効なIDです'
      });
    }

    // 更新可能なフィールドを制限
    const allowedFields = ['is_usable', 'owner_shopify_id', 'reserved_seat'];
    const updateData = {};
    allowedFields.forEach(field => {
      if (req.body.hasOwnProperty(field)) {
        updateData[field] = req.body[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: '更新するフィールドがありません'
      });
    }

    const result = await ticketModel.updateById(id, updateData);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Update ticket error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - チケット削除（管理者のみ）
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({
        success: false,
        error: '無効なIDです'
      });
    }

    const result = await ticketModel.deleteById(id);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({ success: true, message: 'チケットを削除しました' });
  } catch (error) {
    console.error('Delete ticket error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /import - Shopifyからインポート（管理者のみ）
router.post('/import', requireAdmin, async (req, res) => {
  try {
    const { tag = '観戦チケット', monthsAgo = 6 } = req.body;

    console.log(`Starting ticket import with tag: "${tag}", monthsAgo: ${monthsAgo}`);

    // Shopifyから注文を取得
    const shopify = getShopifyService();
    const orders = await shopify.getTicketOrders(tag, parseInt(monthsAgo));

    if (orders.length === 0) {
      return res.json({
        success: true,
        message: `タグ「${tag}」を持つ注文が見つかりませんでした`,
        imported: 0
      });
    }

    console.log(`Found ${orders.length} orders`);

    // 注文をTicketシート形式に変換
    const allTickets = [];
    orders.forEach(order => {
      const tickets = shopify.formatOrderForTicketSheet(order);
      allTickets.push(...tickets);
    });

    console.log(`Converted to ${allTickets.length} ticket rows`);

    // 最大タグ数を計算
    const maxTags = allTickets.reduce((max, ticket) => Math.max(max, ticket.tags.length), 0);

    // シートにインポート
    const result = await ticketModel.importTickets(allTickets, maxTags);

    if (!result.success) {
      return res.status(400).json(result);
    }

    console.log(`Imported ${result.imported} tickets with ${maxTags} tag columns`);

    res.json({
      success: true,
      message: `${orders.length}件の注文から${result.imported}件のチケットをインポートしました`,
      orderCount: orders.length,
      ticketCount: result.imported,
      maxTags: maxTags
    });
  } catch (error) {
    console.error('Ticket import error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
