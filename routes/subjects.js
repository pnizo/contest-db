const express = require('express');
const Subject = require('../models/Subject');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

const subjectModel = new Subject();

// 全対象者データ取得（認証必要）
router.get('/', requireAuth, async (req, res) => {
  try {
    const { search } = req.query;
    const filters = {};
    if (search) filters.search = search;

    if (Object.keys(filters).length > 0) {
      // フィルター付きの場合はBaseModelのfindWithPagingを使用
      const result = await subjectModel.findWithPaging(1, Number.MAX_SAFE_INTEGER, filters);
      res.json({ success: true, data: result.data });
    } else {
      // フィルターなしの場合は通常のfindAll
      const subjects = await subjectModel.findAll();
      res.json({ success: true, data: subjects });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 特定対象者データ取得（認証必要）
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const subject = await subjectModel.findById(req.params.id);
    if (!subject) {
      return res.status(404).json({ success: false, error: '対象者が見つかりません' });
    }
    res.json({ success: true, data: subject });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 対象者データ作成（管理者のみ）
router.post('/', requireAdmin, async (req, res) => {
  try {
    const result = await subjectModel.createSubject(req.body);
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 対象者データ更新（管理者のみ）
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updatedAt: new Date().toISOString()
    };
    const result = await subjectModel.update(req.params.id, updateData);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 対象者データ論理削除（管理者のみ）
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await subjectModel.softDelete(req.params.id);
    if (result.success) {
      res.json({ success: true, message: '対象者データを論理削除しました' });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 削除済み対象者データ一覧（管理者のみ）
router.get('/deleted/list', requireAdmin, async (req, res) => {
  try {
    const allSubjects = await subjectModel.findAllIncludingDeleted();
    const deletedSubjects = allSubjects.filter(subject => subject.isValid === 'FALSE');
    res.json({ success: true, data: deletedSubjects });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 対象者データ復元（管理者のみ）
router.put('/:id/restore', requireAdmin, async (req, res) => {
  try {
    const result = await subjectModel.update(req.params.id, { 
      isValid: 'TRUE',
      restoredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (result.success) {
      res.json({ success: true, message: '対象者データを復元しました', data: result.data });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 対象者データ完全削除（管理者のみ）
router.delete('/:id/permanent', requireAdmin, async (req, res) => {
  try {
    const result = await subjectModel.delete(req.params.id);
    if (result.success) {
      res.json({ success: true, message: '対象者データを完全に削除しました' });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;