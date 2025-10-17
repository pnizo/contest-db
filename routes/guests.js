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
    const sortBy = req.query.sortBy || '大会名';
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

// 特定のゲスト取得
router.get('/:rowIndex', async (req, res) => {
  try {
    const rowIndex = parseInt(req.params.rowIndex);
    const guest = await guestModel.findByRowIndex(rowIndex);

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
    if (!guestData['代表者氏名'] || !guestData['代表者氏名'].trim()) {
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
router.put('/:rowIndex', async (req, res) => {
  try {
    const rowIndex = parseInt(req.params.rowIndex);
    const guestData = req.body;

    // 必須フィールドチェック
    if (!guestData['代表者氏名'] || !guestData['代表者氏名'].trim()) {
      return res.status(400).json({ success: false, error: '代表者氏名は必須です' });
    }

    const result = await guestModel.update(rowIndex, guestData);
    res.json(result);
  } catch (error) {
    console.error('Error updating guest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
