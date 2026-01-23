const express = require('express');
const ShopifyService = require('../services/shopify');
const { verifyCheckinCode } = require('../utils/checkin-code');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// サービスの遅延初期化
let shopifyService = null;

function getShopifyService() {
  if (!shopifyService) {
    shopifyService = new ShopifyService();
  }
  return shopifyService;
}

// ============================================
// チェックインAPI（認証必須・IP制限なし）
// ============================================
router.use(requireAuth);

// POST /verify - コード検証のみ（チケット情報を取得）
router.post('/verify', async (req, res) => {
  try {
    const { code } = req.body;
    console.log('Verify request - code:', code);
    console.log('CHECKIN_SALT set:', !!process.env.CHECKIN_SALT);

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'コードを入力してください'
      });
    }

    // コードを検証
    const verification = verifyCheckinCode(code);
    console.log('Verification result:', verification);
    
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

// POST / - チェックインコードで受付処理
router.post('/', async (req, res) => {
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
    console.log(`Checkin: customerId=${customerId}, orderId=${orderId}, lineItemId=${lineItemId}, codeQuantity=${quantity}, useQuantity=${useQty}`);

    // 注意: 使用枚数のチェックはShopify API側（checkinLineItem）で実際の残り枚数に基づいて行う
    // コードに埋め込まれた quantity は参考値として扱い、Shopify上の currentQuantity を正とする

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

module.exports = router;
