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

// POST /import-csv - CSVインポート（管理者のみ）
const ALLOWED_IMPORT_FIELDS = [
  'reserved_seat',
  'is_usable',
  'full_name',
  'email',
  'product_name',
  'variant',
  'price',
  'financial_status',
  'fulfillment_status',
  'owner_shopify_id',
  'tag1', 'tag2', 'tag3', 'tag4', 'tag5',
  'tag6', 'tag7', 'tag8', 'tag9', 'tag10',
];

router.post('/import-csv', requireAdmin, async (req, res) => {
  try {
    const { csvData, fields } = req.body;

    if (!csvData || !Array.isArray(csvData)) {
      return res.status(400).json({ success: false, error: 'CSVデータが不正です' });
    }
    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ success: false, error: 'インポートする項目を選択してください' });
    }

    // ホワイトリストチェック
    const validFields = fields.filter(f => ALLOWED_IMPORT_FIELDS.includes(f));
    if (validFields.length === 0) {
      return res.status(400).json({ success: false, error: '許可されていない項目が指定されています' });
    }

    console.log(`[import-csv] Received: ${csvData.length} rows, fields: [${validFields.join(', ')}]`);

    // 行を分類
    const updates = [];
    const inserts = [];

    for (const row of csvData) {
      const id = row.id ? parseInt(row.id, 10) : NaN;
      if (!row.id || row.id.toString().trim() === '' || isNaN(id)) {
        // id空白 → 新規INSERT
        inserts.push(row);
      } else {
        // id あり → 選択フィールドのみ抽出してUPDATE
        const data = {};
        for (const field of validFields) {
          if (row.hasOwnProperty(field)) {
            data[field] = row[field];
          }
        }
        if (Object.keys(data).length > 0) {
          updates.push({ id, data });
        }
      }
    }

    console.log(`[import-csv] Classification: updates=${updates.length}, inserts=${inserts.length}`);

    let updated = 0;
    let inserted = 0;
    let skipped = 0;

    // バッチUPDATE
    if (updates.length > 0) {
      const updateResult = await ticketModel.batchUpdate(updates);
      if (!updateResult.success) {
        return res.status(500).json({ success: false, error: updateResult.error });
      }
      updated = updateResult.updated;
    }

    // バッチINSERT
    if (inserts.length > 0) {
      const insertResult = await ticketModel.batchInsertFromCsv(inserts);
      if (!insertResult.success) {
        return res.status(500).json({ success: false, error: insertResult.error });
      }
      inserted = insertResult.inserted;
      skipped = insertResult.skipped;
    }

    const messages = [];
    if (updated > 0) messages.push(`${updated}件を更新`);
    if (inserted > 0) messages.push(`${inserted}件を新規追加`);
    if (skipped > 0) messages.push(`${skipped}件をスキップ`);
    const message = messages.length > 0 ? messages.join('、') + 'しました' : '対象データがありませんでした';

    res.json({
      success: true,
      data: { updated, inserted, skipped, message }
    });
  } catch (error) {
    console.error('Import CSV error:', error);
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
