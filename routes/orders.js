const express = require('express');
const ShopifyService = require('../services/shopify');
const SheetsService = require('../config/sheets');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { verifyCheckinCode } = require('../utils/checkin-code');
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

// ============================================
// 認証不要のエンドポイント（署名検証のみ）
// ============================================

// POST /checkin/verify - コード検証のみ（チケット情報を取得）
router.post('/checkin/verify', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'コードを入力してください'
      });
    }

    // コードを検証
    const verification = verifyCheckinCode(code);
    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        error: verification.error
      });
    }

    const { customerId, orderId, lineItemId, quantity } = verification;
    console.log(`Verify: customerId=${customerId}, orderId=${orderId}, lineItemId=${lineItemId}, quantity=${quantity}`);

    // Shopify APIで注文情報を取得（デクリメントはしない）
    const shopify = getShopifyService();
    const result = await shopify.getLineItemInfo(orderId, lineItemId);

    res.json({
      success: true,
      orderName: result.orderName,
      productName: result.productName,
      variantTitle: result.variantTitle,
      ticketQuantity: quantity,      // コードに埋め込まれた購入枚数
      currentQuantity: result.currentQuantity  // 現在の残り枚数
    });
  } catch (error) {
    console.error('Verify error:', error);
    
    let errorMessage = 'コード検証中にエラーが発生しました';
    if (error.message.includes('not found') || error.message.includes('見つかりません')) {
      errorMessage = '注文情報が見つかりません';
    }
    
    res.status(400).json({ success: false, error: errorMessage });
  }
});

// POST /checkin - チェックインコードで受付処理
router.post('/checkin', async (req, res) => {
  try {
    const { code, useQuantity = 1 } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'コードを入力してください'
      });
    }

    // 使用枚数の検証
    const useQty = parseInt(useQuantity, 10);
    if (isNaN(useQty) || useQty < 1) {
      return res.status(400).json({
        success: false,
        error: '使用枚数は1以上を指定してください'
      });
    }

    // コードを検証
    const verification = verifyCheckinCode(code);
    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        error: verification.error
      });
    }

    const { customerId, orderId, lineItemId, quantity } = verification;
    console.log(`Checkin: customerId=${customerId}, orderId=${orderId}, lineItemId=${lineItemId}, quantity=${quantity}, useQuantity=${useQty}`);

    // 使用枚数がコードに埋め込まれた枚数を超えていないかチェック
    if (useQty > quantity) {
      return res.status(400).json({
        success: false,
        error: `使用枚数は${quantity}枚以下にしてください`
      });
    }

    // Shopify APIで注文情報を取得し、数量をデクリメント
    const shopify = getShopifyService();
    const result = await shopify.checkinLineItem(orderId, lineItemId, useQty);

    res.json({
      success: true,
      message: '受付完了',
      orderName: result.orderName,
      productName: result.productName,
      variantTitle: result.variantTitle,
      ticketQuantity: quantity,       // コードに埋め込まれた購入枚数
      usedQuantity: useQty,           // 今回使用した枚数
      previousQuantity: result.previousQuantity,
      newQuantity: result.newQuantity
    });
  } catch (error) {
    console.error('Checkin error:', error);
    
    // ユーザーフレンドリーなエラーメッセージ
    let errorMessage = 'チェックイン処理中にエラーが発生しました';
    if (error.message.includes('already 0') || error.message.includes('現在数量が0')) {
      errorMessage = 'このチケットは既に使用済みです';
    } else if (error.message.includes('not found') || error.message.includes('見つかりません')) {
      errorMessage = '注文情報が見つかりません';
    } else if (error.message.includes('残り枚数が足りません')) {
      errorMessage = error.message;
    }
    
    res.status(400).json({ success: false, error: errorMessage });
  }
});

// ============================================
// 以下は認証が必要なエンドポイント
// ============================================
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
      'product_name', 'variant', 'quantity', 'current_quantity', 'price', 'line_item_id'
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
    const result = await shopify.decrementLineItemQuantity(orderId, lineItemId, decrement);

    res.json({
      success: true,
      message: `LineItem ${lineItemId} の数量を ${result.previousQuantity} から ${result.newQuantity} に変更しました`,
      ...result
    });
  } catch (error) {
    console.error('Decrement quantity error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
