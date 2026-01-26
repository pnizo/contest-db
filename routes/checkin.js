const express = require('express');
const { verifyCheckinCode } = require('../utils/checkin-code');
const { requireAuth } = require('../middleware/auth');
const Ticket = require('../models/Ticket');
const router = express.Router();

// ============================================
// チェックインAPI（認証必須・IP制限なし）
// ============================================
router.use(requireAuth);

// POST /verify - コード検証のみ（チケット情報を取得）
router.post('/verify', async (req, res) => {
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

    const { ticketId } = verification;

    // Ticketsシートで確認
    const ticketModel = new Ticket();
    const ticket = await ticketModel.findByTicketId(ticketId);

    if (!ticket) {
      return res.status(400).json({
        success: false,
        error: 'チケットが見つかりません'
      });
    }

    res.json({
      success: true,
      orderName: ticket.order_no,
      productName: ticket.product_name,
      variantTitle: ticket.variant,
      isUsable: ticket.is_usable === 'TRUE',
      reservedSeat: ticket.reserved_seat,
      usedAt: ticket.used_at
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

    const { ticketId } = verification;

    // Ticketsシートでチケットを取得
    const ticketModel = new Ticket();
    const ticket = await ticketModel.findByTicketId(ticketId);

    if (!ticket) {
      return res.status(400).json({
        success: false,
        error: 'チケットが見つかりません'
      });
    }

    // 使用済みチェック
    if (ticket.is_usable !== 'TRUE') {
      return res.status(400).json({
        success: false,
        error: 'このチケットは既に使用済みです'
      });
    }

    // チェックイン実行（is_usableをfalseに更新）
    await ticketModel.checkin(ticket.id);

    res.json({
      success: true,
      message: '受付完了',
      orderName: ticket.order_no,
      productName: ticket.product_name,
      variantTitle: ticket.variant
    });
  } catch (error) {
    console.error('Checkin error:', error);

    let errorMessage = 'チェックイン処理中にエラーが発生しました';
    if (error.message.includes('not found') || error.message.includes('見つかりません')) {
      errorMessage = '注文情報が見つかりません';
    }

    res.status(400).json({ success: false, error: errorMessage });
  }
});

module.exports = router;
