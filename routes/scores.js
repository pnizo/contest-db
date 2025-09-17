const express = require('express');
const Score = require('../models/Score');
const { requireAuth, requireAdmin, checkAuth } = require('../middleware/auth');
const router = express.Router();

const scoreModel = new Score();

// フィルター用の一意値取得（特定のルートを先に定義）
router.get('/filter-options', requireAuth, async (req, res) => {
  try {
    console.log('Loading filter options...');
    const allScores = await scoreModel.findAll();
    console.log(`Found ${allScores.length} scores for filter options`);
    
    // 一意の大会名を取得（開催日の降順で並び替え）
    const contestNamesWithDates = allScores
      .filter(score => score.contest_name && score.contest_name.trim() !== '' && score.contest_date)
      .map(score => ({
        name: score.contest_name,
        date: score.contest_date
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
    
    // 一意のカテゴリー名を取得（空文字と重複を除く）
    const categoryNames = [...new Set(
      allScores
        .map(score => score.category_name)
        .filter(name => name && name.trim() !== '')
    )].sort();
    
    console.log(`Contest names: ${contestNames.length}, Category names: ${categoryNames.length}`);
    console.log('Contest names (sorted by date desc):', contestNames.slice(0, 5)); // 最初の5個を表示
    console.log('Category names:', categoryNames.slice(0, 5)); // 最初の5個を表示
    
    res.json({ 
      success: true, 
      data: {
        contestNames,
        categoryNames
      }
    });
  } catch (error) {
    console.error('Filter options error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 全成績取得（ページング対応）
router.get('/', requireAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50,
      fwj_no, 
      contest_name, 
      category_name, 
      startDate, 
      endDate,
      sortBy = 'contest_date',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};
    if (fwj_no) filters.fwj_no = fwj_no;
    if (contest_name) filters.contest_name = contest_name;
    if (category_name) filters.category_name = category_name;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const result = await scoreModel.findWithPaging(
      parseInt(page), 
      Math.min(parseInt(limit), 100), // 最大100件に制限
      filters,
      sortBy,
      sortOrder
    );

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 特定成績取得
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const score = await scoreModel.findById(req.params.id);
    if (!score) {
      return res.status(404).json({ success: false, error: '成績が見つかりません' });
    }
    res.json({ success: true, data: score });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 成績作成（管理者のみ）
router.post('/', requireAdmin, async (req, res) => {
  try {
    const result = await scoreModel.createScore(req.body);
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 成績更新（管理者のみ）
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updatedAt: new Date().toISOString()
    };
    const result = await scoreModel.update(req.params.id, updateData);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 成績論理削除（管理者のみ）
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await scoreModel.softDelete(req.params.id);
    if (result.success) {
      res.json({ success: true, message: '成績を論理削除しました' });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 削除済み成績一覧（管理者のみ）
router.get('/deleted/list', requireAdmin, async (req, res) => {
  try {
    const allScores = await scoreModel.findAllIncludingDeleted();
    const deletedScores = allScores.filter(score => score.isValid === 'FALSE');
    res.json({ success: true, data: deletedScores });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 成績復元（管理者のみ）
router.put('/:id/restore', requireAdmin, async (req, res) => {
  try {
    const result = await scoreModel.update(req.params.id, { 
      isValid: 'TRUE',
      restoredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (result.success) {
      res.json({ success: true, message: '成績を復元しました', data: result.data });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 成績完全削除（管理者のみ）
router.delete('/:id/permanent', requireAdmin, async (req, res) => {
  try {
    const result = await scoreModel.delete(req.params.id);
    if (result.success) {
      res.json({ success: true, message: '成績を完全に削除しました' });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// NPCJ番号別成績取得
router.get('/npcj/:npcjNo', requireAuth, async (req, res) => {
  try {
    const scores = await scoreModel.findByNpcjNo(req.params.npcjNo);
    res.json({ 
      success: true, 
      data: scores
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 複合キー検索
router.get('/composite/:npcjNo/:contestDate/:contestName/:categoryName', requireAuth, async (req, res) => {
  try {
    const { npcjNo, contestDate, contestName, categoryName } = req.params;
    const score = await scoreModel.findByCompositeKey(
      decodeURIComponent(npcjNo),
      decodeURIComponent(contestDate),
      decodeURIComponent(contestName),
      decodeURIComponent(categoryName)
    );
    
    if (score) {
      res.json({ success: true, data: score });
    } else {
      res.status(404).json({ success: false, error: '指定された成績が見つかりません' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 高速CSVインポート（認証済みユーザー）
router.post('/import', requireAuth, async (req, res) => {
  try {
    const { csvData } = req.body;
    
    if (!csvData || !Array.isArray(csvData)) {
      return res.status(400).json({ success: false, error: 'CSVデータが無効です' });
    }

    if (csvData.length === 0) {
      return res.status(400).json({ success: false, error: 'CSVデータが空です' });
    }

    // バッチインポートを実行
    const result = await scoreModel.batchImport(csvData);
    
    if (result.success) {
      res.json({
        success: true,
        data: {
          total: result.data.total,
          imported: result.data.imported,
          message: `${result.data.imported}件の成績を正常にインポートしました`
        }
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// テキスト形式で成績データを取得
router.get('/text/:npcjNo', async (req, res) => {
  try {
    const { npcjNo } = req.params;
    const sortBy = req.query.sort || 'contest_date';
    const sortOrder = req.query.order || 'desc';
    
    if (!npcjNo) {
      return res.status(400).json({ success: false, error: 'NPCJ番号が必要です' });
    }
    
    // 指定されたNPCJ番号の成績を取得
    const allScores = await scoreModel.findAll();
    const userScores = allScores.filter(score => 
      score.fwj_no && score.fwj_no.toString() === npcjNo.toString()
    );
    
    if (userScores.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: `NPCJ番号 ${npcjNo} の成績が見つかりません` 
      });
    }
    
    // ソート処理
    const sortedScores = userScores.sort((a, b) => {
      let aValue = a[sortBy] || '';
      let bValue = b[sortBy] || '';
      
      // 数値の場合は数値として比較
      if (sortBy === 'placing' || sortBy === 'fwj_no') {
        aValue = parseInt(aValue) || 0;
        bValue = parseInt(bValue) || 0;
      }
      
      // 日付の場合は日付として比較
      if (sortBy === 'contest_date') {
        aValue = new Date(aValue) || new Date(0);
        bValue = new Date(bValue) || new Date(0);
      }
      
      let comparison = 0;
      if (aValue < bValue) comparison = -1;
      if (aValue > bValue) comparison = 1;
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });
    
    // テキスト形式で出力
    const textLines = sortedScores.map(score => {
      const date = score.contest_date || '不明';
      const contest = score.contest_name || '不明';
      const category = score.category_name || '不明';
      const placing = score.placing || '不明';
      
      return `${date} | ${contest} | ${category} | ${placing}位`;
    });
    
    const resultText = textLines.join('\n');
    
    // テキスト形式で返す
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(resultText);
    
  } catch (error) {
    console.error('Text API error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;