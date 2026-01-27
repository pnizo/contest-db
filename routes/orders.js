const express = require('express');
const ShopifyService = require('../services/shopify');
const Order = require('../models/Order');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// サービスの遅延初期化（環境変数エラーをリクエスト時に報告するため）
let shopifyService = null;
let orderModel = null;

function getShopifyService() {
  if (!shopifyService) {
    shopifyService = new ShopifyService();
  }
  return shopifyService;
}

function getOrderModel() {
  if (!orderModel) {
    orderModel = new Order();
  }
  return orderModel;
}

// すべて認証が必要
router.use(requireAuth);

// GET /current - 現在のDBデータとエクスポート情報を取得
router.get('/current', async (req, res) => {
  try {
    const order = getOrderModel();
    const status = await order.getCurrentStatus();

    if (!status.success) {
      return res.status(500).json({ success: false, error: status.error });
    }

    // 現在のデータも取得（最初のページ）
    const ordersData = await order.findWithPaging(1, 50, {}, 'order_date', 'desc');

    res.json({
      success: true,
      totalOrders: status.totalOrders,
      latestExport: status.latestExport,
      orders: ordersData
    });
  } catch (error) {
    console.error('Current status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// タグで注文を検索（プレビュー用）
router.get('/search', async (req, res) => {
  try {
    const { tag = '', productType = '', limit = 0, paidOnly = 'true' } = req.query;  // limit=0 は無制限、tag は任意
    const paidOnlyBool = paidOnly === 'true';

    console.log(`Searching orders with tag: ${tag || '(指定なし)'}, productType: ${productType || '(指定なし)'}, paidOnly: ${paidOnlyBool}`);

    const shopify = getShopifyService();
    const orders = await shopify.getOrdersByTag(tag, parseInt(limit), paidOnlyBool, productType);
    console.log(`Found ${orders.length} orders`);

    // フォーマット（baseData + tags の形式）
    const formattedRows = [];
    orders.forEach(order => {
      const rows = shopify.formatOrderForSheet(order);
      formattedRows.push(...rows);
    });

    // 最大タグ数を計算
    const maxTags = formattedRows.reduce((max, row) => Math.max(max, row.tags.length), 0);

    // タグヘッダーを生成
    const tagHeaders = [];
    for (let i = 1; i <= maxTags; i++) {
      tagHeaders.push(`tag${i}`);
    }

    // 基本ヘッダー
    const baseHeaders = [
      '注文番号', '注文日時', '顧客ID', '顧客名', 'メールアドレス',
      '合計金額', '支払いステータス', '発送ステータス',
      '商品名', 'バリエーション', '数量', '現在数量', '単価', 'LineItemID'
    ];
    const headers = [...baseHeaders, ...tagHeaders];

    // 行データをフラット配列に変換（タグをパディング）
    const data = formattedRows.map(row => {
      const paddedTags = [...row.tags];
      while (paddedTags.length < maxTags) {
        paddedTags.push('');
      }
      return [...row.baseData, ...paddedTags];
    });

    // 検索タグを配列として解析（引用符で囲まれたスペース含むタグに対応）
    const searchTags = tag ? shopify.parseTags(tag) : [];

    // DBに保存（orders, order_tags をクリアして新規保存）
    const order = getOrderModel();
    const importResult = await order.clearAndImport(formattedRows);

    if (!importResult.success) {
      console.error('Failed to save orders to DB:', importResult.error);
    }

    // 検索メタデータを保存（order_export_meta）
    await order.saveExportMeta({
      searchTags,
      searchProductType: productType || null,
      paidOnly: paidOnlyBool,
      orderCount: orders.length,
      rowCount: formattedRows.length,
    });

    console.log(`Saved ${orders.length} orders (${formattedRows.length} rows) to database`);

    res.json({
      success: true,
      data: data,
      headers: headers,
      count: orders.length,
      rowCount: data.length,
      maxTags: maxTags
    });
  } catch (error) {
    console.error('Order search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 検索結果をDBに保存（旧シート出力機能を置き換え）
router.post('/export', requireAdmin, async (req, res) => {
  try {
    const { tag = '', productType = '', limit = 0, paidOnly = true } = req.body;  // limit=0 は無制限、tag は任意

    console.log(`Exporting orders with tag: ${tag || '(指定なし)'}, productType: ${productType || '(指定なし)'}, paidOnly: ${paidOnly} to database`);

    // 注文を取得
    const shopify = getShopifyService();
    const ordersData = await shopify.getOrdersByTag(tag, parseInt(limit), paidOnly, productType);

    if (ordersData.length === 0) {
      return res.json({
        success: true,
        message: tag ? `タグ「${tag}」を持つ注文が見つかりませんでした` : '該当する注文が見つかりませんでした',
        exported: 0
      });
    }

    // フォーマット（baseData + tags の形式）
    const formattedRows = [];
    ordersData.forEach(order => {
      const orderRows = shopify.formatOrderForSheet(order);
      formattedRows.push(...orderRows);
    });

    // 最大タグ数を計算（DB保存用）
    const maxTags = formattedRows.reduce((max, row) => Math.max(max, row.tags.length), 0);

    // DBに保存（全削除→一括追加）
    const order = getOrderModel();
    const result = await order.clearAndImport(formattedRows);

    if (!result.success) {
      throw new Error(result.error || 'DB保存に失敗しました');
    }

    // 検索タグを配列として解析（引用符で囲まれたスペース含むタグに対応）
    const searchTags = tag ? shopify.parseTags(tag) : [];

    // エクスポートメタデータを保存
    await order.saveExportMeta({
      searchTags,
      searchProductType: productType || null,
      paidOnly,
      orderCount: ordersData.length,
      rowCount: formattedRows.length,
    });

    console.log(`Exported ${ordersData.length} orders (${formattedRows.length} rows, ${maxTags} tag columns) to database`);

    res.json({
      success: true,
      message: `${ordersData.length}件の注文（${formattedRows.length}行）をデータベースに保存しました`,
      exported: ordersData.length,
      rowCount: formattedRows.length
    });
  } catch (error) {
    console.error('Order export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /list - DBから注文一覧を取得
router.get('/list', async (req, res) => {
  try {
    const { page = 1, limit = 50, sortBy = 'order_date', sortOrder = 'desc', ...filters } = req.query;

    const order = getOrderModel();
    const result = await order.findWithPaging(
      parseInt(page),
      parseInt(limit),
      filters,
      sortBy,
      sortOrder
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Order list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /filter-options - フィルターオプションを取得
router.get('/filter-options', async (req, res) => {
  try {
    const order = getOrderModel();
    const options = await order.getFilterOptions();

    res.json({
      success: true,
      ...options
    });
  } catch (error) {
    console.error('Filter options error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id - IDで注文を取得
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const order = getOrderModel();
    const result = await order.findById(id);

    if (!result) {
      return res.status(404).json({ success: false, error: '注文が見つかりません' });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Order get error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /decrement-quantity - LineItemのcurrentQuantityをデクリメント
router.post('/decrement-quantity', requireAdmin, async (req, res) => {
  try {
    const { orderId, lineItemId, decrementBy = 1 } = req.body;

    if (!orderId || !lineItemId) {
      return res.status(400).json({
        success: false,
        error: 'orderId と lineItemId は必須です'
      });
    }

    const decrement = parseInt(decrementBy, 10);
    if (isNaN(decrement) || decrement < 1) {
      return res.status(400).json({
        success: false,
        error: 'decrementBy は1以上の整数である必要があります'
      });
    }

    console.log(`Decrementing quantity for order: ${orderId}, lineItem: ${lineItemId}, by: ${decrement}`);

    const shopify = getShopifyService();
    const shopifyResult = await shopify.decrementLineItemQuantity(orderId, lineItemId, decrement);

    // DBの current_quantity も更新
    const order = getOrderModel();
    await order.updateCurrentQuantity(lineItemId, shopifyResult.newQuantity);

    res.json({
      success: true,
      message: `LineItem ${lineItemId} の数量を ${shopifyResult.previousQuantity} から ${shopifyResult.newQuantity} に変更しました`,
      ...shopifyResult
    });
  } catch (error) {
    console.error('Decrement quantity error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
