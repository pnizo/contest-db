const express = require('express');
const Contest = require('../models/Contest');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

const contestModel = new Contest();

// すべて認証が必要
router.use(requireAuth);

// 開催地一覧を取得
router.get('/places', async (req, res) => {
  try {
    const places = await contestModel.getPlaces();
    res.json({ success: true, data: places });
  } catch (error) {
    console.error('Error getting places:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 今日以降のコンテスト取得
router.get('/upcoming', async (req, res) => {
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
router.get('/name/:contestName', async (req, res) => {
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

// 全コンテストデータ取得（ページング付き）
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const sortBy = req.query.sortBy || 'contest_date';
    const sortOrder = req.query.sortOrder || 'desc';

    const filters = {};
    if (req.query.contest_name) filters.contest_name = req.query.contest_name;
    if (req.query.contest_place) filters.contest_place = req.query.contest_place;
    if (req.query.search) filters.search = req.query.search;
    if (req.query.startDate && req.query.endDate) {
      filters.startDate = req.query.startDate;
      filters.endDate = req.query.endDate;
    }

    const result = await contestModel.findWithPaging(page, limit, filters, sortBy, sortOrder);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Contest list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 特定のコンテスト取得（行インデックス）
router.get('/:rowIndex', async (req, res) => {
  try {
    const rowIndex = parseInt(req.params.rowIndex);
    const contest = await contestModel.findByRowIndex(rowIndex);

    if (!contest) {
      return res.status(404).json({ success: false, error: '大会情報が見つかりません' });
    }

    res.json({ success: true, data: contest });
  } catch (error) {
    console.error('Error fetching contest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 新規コンテスト作成
router.post('/', async (req, res) => {
  try {
    const contestData = req.body;

    // 必須フィールドチェック
    if (!contestData['contest_name'] || !contestData['contest_name'].trim()) {
      return res.status(400).json({ success: false, error: '大会名は必須です' });
    }

    const result = await contestModel.create(contestData);
    res.json(result);
  } catch (error) {
    console.error('Error creating contest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// コンテスト更新
router.put('/:rowIndex', async (req, res) => {
  try {
    const rowIndex = parseInt(req.params.rowIndex);
    const contestData = req.body;

    // 必須フィールドチェック
    if (!contestData['contest_name'] || !contestData['contest_name'].trim()) {
      return res.status(400).json({ success: false, error: '大会名は必須です' });
    }

    const result = await contestModel.update(rowIndex, contestData);
    res.json(result);
  } catch (error) {
    console.error('Error updating contest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// コンテスト削除
router.delete('/:rowIndex', async (req, res) => {
  try {
    const rowIndex = parseInt(req.params.rowIndex);

    // 存在確認
    const contest = await contestModel.findByRowIndex(rowIndex);
    if (!contest) {
      return res.status(404).json({ success: false, error: '大会情報が見つかりません' });
    }

    // 行を削除
    await contestModel.getSheetsService().deleteRow(contestModel.sheetName, rowIndex - 1);

    res.json({ success: true, message: '大会情報を削除しました' });
  } catch (error) {
    console.error('Error deleting contest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
