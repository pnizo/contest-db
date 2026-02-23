const express = require('express');
const Judge = require('../models/Judge');
const Registration = require('../models/Registration');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

const judgeModel = new Judge();
const registrationModel = new Registration();

// CSVをパースするヘルパー関数
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

// フィルター用の一意値取得
router.get('/filter-options', requireAuth, async (req, res) => {
  try {
    const options = await judgeModel.getFilterOptions();
    res.json({ success: true, data: options });
  } catch (error) {
    console.error('Filter options error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// CSVエクスポート
router.get('/export', requireAuth, async (req, res) => {
  try {
    const { contest_name, contest_date, class_name } = req.query;
    const filters = {};
    if (contest_name) filters.contest_name = contest_name;
    if (contest_date) filters.contest_date = contest_date;
    if (class_name) filters.class_name = class_name;

    const data = await judgeModel.findForExport(filters);

    // CSV文字列を生成
    const headers = ['contest_name', 'contest_date', 'class_name', 'player_no', 'player_name', 'placing', 'score_j1', 'score_j2', 'score_j3', 'score_j4', 'score_j5', 'score_t'];
    const csvLines = [headers.join(',')];

    data.forEach(row => {
      const values = headers.map(h => {
        const val = row[h] != null ? String(row[h]) : '';
        // カンマやダブルクオートを含む場合はエスケープ
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      });
      csvLines.push(values.join(','));
    });

    const csvText = csvLines.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="judges_export.csv"');
    // BOM付きUTF-8
    res.send('\uFEFF' + csvText);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 全審判採点取得（ページング対応）
router.get('/', requireAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      contest_name,
      class_name,
      search,
      showInvalid,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};
    if (contest_name) filters.contest_name = contest_name;
    if (class_name) filters.class_name = class_name;
    if (search) filters.search = search;
    if (showInvalid === 'true') filters.showInvalid = true;

    const result = await judgeModel.findWithPaging(
      parseInt(page),
      Math.min(parseInt(limit), 100),
      filters,
      sortBy,
      sortOrder
    );

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 特定審判採点取得
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const judge = await judgeModel.findById(req.params.id);
    if (!judge) {
      return res.status(404).json({ success: false, error: '審判採点データが見つかりません' });
    }
    res.json({ success: true, data: judge });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 審判採点作成（管理者のみ）
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { contest_name, class_name, player_no } = req.body;

    if (!contest_name || !class_name || player_no == null) {
      return res.status(400).json({ success: false, error: 'コンテスト名、クラス名、ゼッケン番号は必須です' });
    }

    const result = await judgeModel.create(req.body);
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CSVインポート（管理者のみ）
router.post('/import', requireAdmin, async (req, res) => {
  try {
    const { csvText, contestName, contestDate, className } = req.body;

    if (!csvText || typeof csvText !== 'string') {
      return res.status(400).json({ success: false, error: 'CSVデータが無効です' });
    }

    if (!contestName) {
      return res.status(400).json({ success: false, error: '大会名が指定されていません' });
    }

    if (!className) {
      return res.status(400).json({ success: false, error: 'クラス名が指定されていません' });
    }

    // CSVをパース
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());

    if (lines.length < 2) {
      return res.status(400).json({ success: false, error: 'CSVデータが不正です（ヘッダーとデータ行が必要です）' });
    }

    const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"(.*)"$/, '$1').trim().toLowerCase());
    console.log('CSV headers:', headers);

    const requiredHeaders = ['player_no', 'placing'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

    if (missingHeaders.length > 0) {
      return res.status(400).json({
        success: false,
        error: `必須ヘッダーが不足しています: ${missingHeaders.join(', ')}\n\n見つかったヘッダー: ${headers.join(', ')}`
      });
    }

    const csvData = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]).map(v => v.replace(/^"(.*)"$/, '$1'));
      if (values.length < headers.length) continue;

      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      csvData.push(row);
    }

    if (csvData.length === 0) {
      return res.status(400).json({ success: false, error: 'インポート可能なデータが見つかりません' });
    }

    const result = await judgeModel.batchImport(csvData, contestName, contestDate, className);

    if (result.success) {
      res.json({
        success: true,
        data: {
          total: result.data.total,
          imported: result.data.imported,
          message: `${result.data.imported}件の審判採点データをインポートしました（${contestName} / ${className}）`
        }
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 出場登録からインポート（管理者のみ）
router.post('/import-from-registrations', requireAdmin, async (req, res) => {
  try {
    const { contestName } = req.body;

    if (!contestName) {
      return res.status(400).json({ success: false, error: '大会名が指定されていません' });
    }

    // Registration から該当大会のデータを取得
    const registrations = await registrationModel.findByContestName(contestName);

    if (!registrations || registrations.length === 0) {
      return res.status(400).json({ success: false, error: '該当大会の出場登録データが見つかりません' });
    }

    // Contests から contest_date を取得
    const { getDb } = require('../lib/db');
    const { contests } = require('../lib/db/schema');
    const { eq } = require('drizzle-orm');
    const db = getDb();
    const contestRows = await db
      .select({ contestDate: contests.contestDate })
      .from(contests)
      .where(eq(contests.contestName, contestName))
      .limit(1);

    const contestDate = contestRows.length > 0 ? contestRows[0].contestDate : '';

    const result = await judgeModel.importFromRegistrations(registrations, contestName, contestDate);

    if (result.success) {
      res.json({
        success: true,
        data: {
          total: result.data.total,
          imported: result.data.imported,
          message: `${result.data.imported}件の選手データを出場登録からインポートしました（${contestName}）`
        }
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Import from registrations error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 審判採点更新（管理者のみ）
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updatedAt: new Date().toISOString()
    };
    const result = await judgeModel.update(req.params.id, updateData);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 審判採点論理削除（管理者のみ）
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await judgeModel.softDelete(req.params.id);
    if (result.success) {
      res.json({ success: true, message: '審判採点データを削除しました' });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 審判採点完全削除（管理者のみ）
router.delete('/:id/permanent', requireAdmin, async (req, res) => {
  try {
    const result = await judgeModel.delete(req.params.id);
    if (result.success) {
      res.json({ success: true, message: '審判採点データを完全に削除しました' });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 審判採点復元（管理者のみ）
router.put('/:id/restore', requireAdmin, async (req, res) => {
  try {
    const result = await judgeModel.restore(req.params.id);
    if (result.success) {
      res.json({ success: true, message: '審判採点データを復元しました', data: result.data });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
