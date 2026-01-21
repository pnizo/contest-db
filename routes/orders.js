const express = require('express');
const ShopifyService = require('../services/shopify');
const SheetsService = require('../config/sheets');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// サービスの遅延初期化（環境変数エラーをリクエスト時に報告するため）
let shopifyService = null;
let sheetsService = null;

function getShopifyService() {
  if (!shopifyService) {
    shopifyService = new ShopifyService();
  }
  return shopifyService;
}

function getSheetsService() {
  if (!sheetsService) {
    sheetsService = new SheetsService();
  }
  return sheetsService;
}

// すべて認証が必要
router.use(requireAuth);

// タグで注文を検索（プレビュー用）
router.get('/search', async (req, res) => {
  try {
    const { tag = '', limit = 0, paidOnly = 'true' } = req.query;  // limit=0 は無制限、tag は任意
    const paidOnlyBool = paidOnly === 'true';

    console.log(`Searching orders with tag: ${tag || '(指定なし)'}, paidOnly: ${paidOnlyBool}`);

    const shopify = getShopifyService();
    const orders = await shopify.getOrdersByTag(tag, parseInt(limit), paidOnlyBool);
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
      '商品名', 'バリエーション', '数量', '単価'
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

// 検索結果をスプレッドシートに出力（固定シート名: Orders）
router.post('/export', requireAdmin, async (req, res) => {
  try {
    const { tag = '', limit = 0, paidOnly = true } = req.body;  // limit=0 は無制限、tag は任意
    const sheetTitle = 'Orders';  // 固定シート名

    console.log(`Exporting orders with tag: ${tag || '(指定なし)'}, paidOnly: ${paidOnly} to sheet: ${sheetTitle}`);

    // 注文を取得
    const shopify = getShopifyService();
    const orders = await shopify.getOrdersByTag(tag, parseInt(limit), paidOnly);

    if (orders.length === 0) {
      return res.json({
        success: true,
        message: tag ? `タグ「${tag}」を持つ注文が見つかりませんでした` : '該当する注文が見つかりませんでした',
        exported: 0
      });
    }

    // フォーマット（baseData + tags の形式）
    const formattedRows = [];
    orders.forEach(order => {
      const orderRows = shopify.formatOrderForSheet(order);
      formattedRows.push(...orderRows);
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
      'order_no', 'order_date', 'shopify_id', 'full_name', 'email',
      'total_price', 'financial_status', 'fulfillment_status',
      'product_name', 'variant', 'quantity', 'price'
    ];
    const headers = [...baseHeaders, ...tagHeaders];

    // 行データをフラット配列に変換（タグをパディング）
    const rows = formattedRows.map(row => {
      const paddedTags = [...row.tags];
      while (paddedTags.length < maxTags) {
        paddedTags.push('');
      }
      return [...row.baseData, ...paddedTags];
    });

    // スプレッドシートに出力
    const sheets = getSheetsService();
    await sheets.writeToSheet(sheetTitle, headers, rows);

    console.log(`Exported ${orders.length} orders (${rows.length} rows, ${maxTags} tag columns) to sheet: ${sheetTitle}`);

    res.json({
      success: true,
      message: `${orders.length}件の注文（${rows.length}行）をシート「${sheetTitle}」に出力しました`,
      exported: orders.length,
      rowCount: rows.length,
      sheetTitle
    });
  } catch (error) {
    console.error('Order export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
