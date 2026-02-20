const express = require('express');
const Contest = require('../models/Contest');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

const contestModel = new Contest();

/**
 * 外部サーバーのContestsキャッシュをクリアする
 */
async function clearContestsCache() {
  const baseUrl = process.env.FITNESS_APP_URL;
  const secret = process.env.FITNESS_APP_API_SECRET;
  const url = baseUrl ? `${baseUrl}/api/cache/clear` : null;
  if (!url || !secret) return;

  try {
    const res = await fetch(`${url}?secret=${encodeURIComponent(secret)}&target=contests`);
    if (!res.ok) {
      console.error('Contests cache clear failed:', res.status, await res.text());
    }
  } catch (error) {
    console.error('Contests cache clear error:', error.message);
  }
}

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

// 特定のコンテスト取得（ID）
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: '無効なIDです' });
    }

    const contest = await contestModel.findById(id);

    if (!contest) {
      return res.status(404).json({ success: false, error: '大会情報が見つかりません' });
    }

    res.json({ success: true, data: contest });
  } catch (error) {
    console.error('Error fetching contest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 新規コンテスト作成（管理者のみ）
router.post('/', requireAdmin, async (req, res) => {
  try {
    const contestData = req.body;

    // 必須フィールドチェック
    if (!contestData['contest_name'] || !contestData['contest_name'].trim()) {
      return res.status(400).json({ success: false, error: '大会名は必須です' });
    }

    const result = await contestModel.create(contestData);
    clearContestsCache();
    res.json(result);
  } catch (error) {
    console.error('Error creating contest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// コンテスト更新（管理者のみ）
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: '無効なIDです' });
    }

    const contestData = req.body;

    // 必須フィールドチェック
    if (!contestData['contest_name'] || !contestData['contest_name'].trim()) {
      return res.status(400).json({ success: false, error: '大会名は必須です' });
    }

    const result = await contestModel.update(id, contestData);
    clearContestsCache();
    res.json(result);
  } catch (error) {
    console.error('Error updating contest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// コンテスト削除（管理者のみ）
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: '無効なIDです' });
    }

    // 存在確認
    const contest = await contestModel.findById(id);
    if (!contest) {
      return res.status(404).json({ success: false, error: '大会情報が見つかりません' });
    }

    const result = await contestModel.deleteById(id);
    if (!result.success) {
      return res.status(400).json(result);
    }

    clearContestsCache();
    res.json({ success: true, message: '大会情報を削除しました' });
  } catch (error) {
    console.error('Error deleting contest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
