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

// GET /export/:productName - 指定商品名を持つチケットの全項目取得
router.get('/export/:productName', async (req, res) => {
  try {
    const productName = decodeURIComponent(req.params.productName);
    const tickets = await ticketModel.findByProductName(productName);

    // ファイル名を生成（日付付き）
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const safeName = productName.replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_');
    const filename = `tickets_${safeName}_${date}.csv`;

    res.json({
      success: true,
      data: tickets,
      filename
    });
  } catch (error) {
    console.error('Export tickets error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /import-reserved-seats - 指定席CSVインポート（管理者のみ）
router.post('/import-reserved-seats', requireAdmin, async (req, res) => {
  try {
    const { csvData } = req.body;

    if (!csvData || !Array.isArray(csvData)) {
      return res.status(400).json({
        success: false,
        error: 'CSVデータが不正です'
      });
    }

    // 必須フィールドのチェック
    const validData = csvData.filter(row => row.id && row.hasOwnProperty('reserved_seat'));

    if (validData.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'id と reserved_seat 列が必要です'
      });
    }

    const result = await ticketModel.bulkUpdateReservedSeats(validData);

    res.json({
      success: true,
      data: {
        total: result.total,
        updated: result.updated,
        message: `${result.updated}件の指定席を更新しました`
      }
    });
  } catch (error) {
    console.error('Import reserved seats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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
    const { tag = '観戦チケット', monthsAgo = 3 } = req.body;

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

    // シートにインポート
    const result = await ticketModel.importTickets(allTickets);

    if (!result.success) {
      return res.status(400).json(result);
    }

    console.log(`Imported ${result.imported} tickets`);

    res.json({
      success: true,
      message: `${orders.length}件の注文から${result.imported}件のチケットをインポートしました`,
      orderCount: orders.length,
      ticketCount: result.imported,
    });
  } catch (error) {
    console.error('Ticket import error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
