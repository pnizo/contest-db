const express = require('express');
const router = express.Router();
const Guest = require('../models/Guest');
const { requireAuth } = require('../middleware/auth');

const guestModel = new Guest();

// すべて認証が必要
router.use(requireAuth);

// フィルターオプションの取得
router.get('/filter-options', async (req, res) => {
  try {
    const options = await guestModel.getFilterOptions();
    res.json({ success: true, data: options });
  } catch (error) {
    console.error('Error getting filter options:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ゲスト一覧取得（ページング付き）
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const sortBy = req.query.sortBy || 'contest_name';
    const sortOrder = req.query.sortOrder || 'asc';

    const filters = {};
    if (req.query.contest_name) filters.contest_name = req.query.contest_name;
    if (req.query.organization_type) filters.organization_type = req.query.organization_type;
    if (req.query.pass_type) filters.pass_type = req.query.pass_type;
    if (req.query.representative_name) filters.representative_name = req.query.representative_name;
    if (req.query.organization_name) filters.organization_name = req.query.organization_name;
    if (req.query.search) filters.search = req.query.search;

    const result = await guestModel.findWithPaging(page, limit, filters, sortBy, sortOrder);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error fetching guests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 特定のゲスト取得（ID）
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: '無効なIDです' });
    }

    const guest = await guestModel.findById(id);

    if (!guest) {
      return res.status(404).json({ success: false, error: 'ゲストが見つかりません' });
    }

    res.json({ success: true, data: guest });
  } catch (error) {
    console.error('Error fetching guest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 新規ゲスト作成
router.post('/', async (req, res) => {
  try {
    const guestData = req.body;

    // 必須フィールドチェック
    if (!guestData['name_ja'] || !guestData['name_ja'].trim()) {
      return res.status(400).json({ success: false, error: '代表者氏名は必須です' });
    }

    const result = await guestModel.create(guestData);
    res.json(result);
  } catch (error) {
    console.error('Error creating guest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ゲスト更新
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: '無効なIDです' });
    }

    const guestData = req.body;

    // 必須フィールドチェック
    if (!guestData['name_ja'] || !guestData['name_ja'].trim()) {
      return res.status(400).json({ success: false, error: '代表者氏名は必須です' });
    }

    const result = await guestModel.update(id, guestData);
    res.json(result);
  } catch (error) {
    console.error('Error updating guest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ゲスト削除（論理削除）
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: '無効なIDです' });
    }

    // 存在確認
    const guest = await guestModel.findById(id);
    if (!guest) {
      return res.status(404).json({ success: false, error: 'ゲストが見つかりません' });
    }

    const result = await guestModel.deleteById(id);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({ success: true, message: 'ゲストレコードを削除しました' });
  } catch (error) {
    console.error('Error deleting guest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// チェックイン状態更新
router.put('/:id/checkin', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: '無効なIDです' });
    }

    const { is_checked_in } = req.body;
    const result = await guestModel.updateCheckinStatus(id, is_checked_in === true || is_checked_in === 'TRUE');

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({ success: true, message: 'チェックイン状態を更新しました' });
  } catch (error) {
    console.error('Error updating checkin status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
