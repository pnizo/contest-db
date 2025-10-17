const express = require('express');
const Note = require('../models/Note');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

const noteModel = new Note();

// フィルター用の一意値取得
router.get('/filter-options', requireAuth, async (req, res) => {
  try {
    console.log('Loading note filter options...');
    const allNotes = await noteModel.findAll();
    console.log(`Found ${allNotes.length} notes for filter options`);

    // 一意の大会名を取得（開催日の降順で並び替え）
    const contestNamesWithDates = allNotes
      .filter(note => note.contest_name && note.contest_name.trim() !== '' && note.contest_date)
      .map(note => ({
        name: note.contest_name,
        date: note.contest_date
      }));

    // 大会名でグループ化し、各大会の最新の開催日を取得
    const contestMap = new Map();
    contestNamesWithDates.forEach(item => {
      if (!contestMap.has(item.name) || new Date(item.date) > new Date(contestMap.get(item.name))) {
        contestMap.set(item.name, item.date);
      }
    });

    // 開催日の降順で並び替え
    const contestNames = Array.from(contestMap.entries())
      .sort((a, b) => new Date(b[1]) - new Date(a[1]))
      .map(entry => entry[0]);

    // 一意の特記事項タイプを取得
    const types = [...new Set(
      allNotes
        .map(note => note.type)
        .filter(type => type && type.trim() !== '')
    )].sort();

    console.log(`Contest names: ${contestNames.length}, Types: ${types.length}`);

    res.json({
      success: true,
      data: {
        contestNames,
        types
      }
    });
  } catch (error) {
    console.error('Note filter options error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 全特記事項データ取得（ページング対応）
router.get('/', requireAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      fwj_card_no,
      contest_name,
      type,
      search,
      startDate,
      endDate,
      sortBy = 'contest_date',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};
    if (fwj_card_no) filters.fwj_card_no = fwj_card_no;
    if (contest_name) filters.contest_name = contest_name;
    if (type) filters.type = type;
    if (search) filters.search = search;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const result = await noteModel.findWithPaging(
      parseInt(page),
      Math.min(parseInt(limit), 100),
      filters,
      sortBy,
      sortOrder
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 特定特記事項データ取得
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const note = await noteModel.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ success: false, error: '特記事項が見つかりません' });
    }
    res.json({ success: true, data: note });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 特記事項データ作成（認証済みユーザー）
router.post('/', requireAuth, async (req, res) => {
  try {
    const result = await noteModel.createNote(req.body);
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 特記事項データ更新（認証済みユーザー）
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updatedAt: new Date().toISOString()
    };
    const result = await noteModel.update(req.params.id, updateData);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 特記事項データ論理削除（認証済みユーザー）
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await noteModel.softDelete(req.params.id);
    if (result.success) {
      res.json({ success: true, message: '特記事項を論理削除しました' });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 削除済み特記事項データ一覧（管理者のみ）
router.get('/deleted/list', requireAdmin, async (req, res) => {
  try {
    const allNotes = await noteModel.findAllIncludingDeleted();
    const deletedNotes = allNotes.filter(note => note.isValid === 'FALSE');
    res.json({ success: true, data: deletedNotes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 特記事項データ復元（認証済みユーザー）
router.put('/:id/restore', requireAuth, async (req, res) => {
  try {
    const result = await noteModel.restore(req.params.id);
    if (result.success) {
      res.json({ success: true, message: '特記事項を復元しました', data: result.data });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 特記事項データ完全削除（管理者のみ）
router.delete('/:id/permanent', requireAdmin, async (req, res) => {
  try {
    const result = await noteModel.delete(req.params.id);
    if (result.success) {
      res.json({ success: true, message: '特記事項を完全に削除しました' });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// FWJカード番号別特記事項データ取得
router.get('/fwj/:fwjCardNo', requireAuth, async (req, res) => {
  try {
    const notes = await noteModel.findByFwjCardNo(req.params.fwjCardNo);
    res.json({
      success: true,
      data: notes
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 大会・日付別特記事項データ取得
router.get('/contest/:contestName/:contestDate', requireAuth, async (req, res) => {
  try {
    const { contestName, contestDate } = req.params;
    const notes = await noteModel.findByContestAndDate(
      decodeURIComponent(contestName),
      decodeURIComponent(contestDate)
    );

    res.json({
      success: true,
      data: notes,
      contestName: decodeURIComponent(contestName),
      contestDate: decodeURIComponent(contestDate)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
