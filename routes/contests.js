const express = require('express');
const Contest = require('../models/Contest');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

const contestModel = new Contest();

// 全コンテストデータ取得（開催日順）
router.get('/', requireAuth, async (req, res) => {
  try {
    const { order = 'desc' } = req.query;
    const contests = await contestModel.findAllSorted(order);

    res.json({
      success: true,
      data: contests
    });
  } catch (error) {
    console.error('Contest list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 今日以降のコンテスト取得
router.get('/upcoming', requireAuth, async (req, res) => {
  try {
    const contests = await contestModel.findUpcoming();

    res.json({
      success: true,
      data: contests
    });
  } catch (error) {
    console.error('Upcoming contests error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 特定コンテストデータ取得（名前で検索）
router.get('/name/:contestName', requireAuth, async (req, res) => {
  try {
    const contest = await contestModel.findByName(decodeURIComponent(req.params.contestName));

    if (!contest) {
      return res.status(404).json({ success: false, error: 'コンテストが見つかりません' });
    }

    res.json({
      success: true,
      data: contest
    });
  } catch (error) {
    console.error('Contest lookup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
