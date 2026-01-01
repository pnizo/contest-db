const express = require('express');
const Score = require('../models/Score');
const Contest = require('../models/Contest');
const Registration = require('../models/Registration');
const { requireAuth, requireAdmin, checkAuth } = require('../middleware/auth');
const router = express.Router();

const scoreModel = new Score();
const contestModel = new Contest();
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
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

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
      fwj_card_no, 
      contest_name, 
      category_name, 
      startDate, 
      endDate,
      search,
      sortBy = 'contest_date',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};
    if (fwj_card_no) filters.fwj_card_no = fwj_card_no;
    if (contest_name) filters.contest_name = contest_name;
    if (category_name) filters.category_name = category_name;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (search) filters.search = search;

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

// FWJ番号別成績取得
router.get('/fwj/:fwjNo', requireAuth, async (req, res) => {
  try {
    const scores = await scoreModel.findByFwjNo(req.params.fwjNo);
    res.json({ 
      success: true, 
      data: scores
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 複合キー検索
router.get('/composite/:fwjNo/:contestDate/:contestName/:categoryName', requireAuth, async (req, res) => {
  try {
    const { fwjNo, contestDate, contestName, categoryName } = req.params;
    const score = await scoreModel.findByCompositeKey(
      decodeURIComponent(fwjNo),
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
    console.log('=== SCORES IMPORT REQUEST START ===');
    const { csvText, contestName } = req.body;
    
    if (!csvText || typeof csvText !== 'string') {
      return res.status(400).json({ success: false, error: 'CSVデータが無効です' });
    }

    if (!contestName || typeof contestName !== 'string') {
      return res.status(400).json({ success: false, error: '大会名が指定されていません' });
    }

    console.log('Selected contest:', contestName);

    // Contestsからcontest_dateとcontest_placeを取得
    const allContests = await contestModel.findAll();
    const contest = allContests.find(c => c.contest_name === contestName);

    if (!contest) {
      return res.status(400).json({ 
        success: false, 
        error: `大会「${contestName}」がContestsテーブルに見つかりません` 
      });
    }

    const contest_date = contest.contest_date;
    const contest_place = contest.contest_place || '';

    console.log('Contest date:', contest_date);
    console.log('Contest place:', contest_place);

    // Registrationsから該当する大会のデータを取得
    const allRegistrations = await registrationModel.findAll();
    const contestRegistrations = allRegistrations.filter(
      reg => reg.contest_date === contest_date
    );

    console.log(`Found ${contestRegistrations.length} registrations for contest date ${contest_date}`);

    // player_no + class_name をキーとするマップを作成
    const registrationMap = new Map();
    contestRegistrations.forEach(reg => {
      const key = `${reg.player_no}|${reg.class_name}`;
      registrationMap.set(key, {
        fwj_card_no: reg.fwj_card_no || '',
        player_name: reg.name_ja || ''
      });
    });

    console.log(`Created registration map with ${registrationMap.size} entries`);

    // CSVをパース（新しいフォーマット対応）
    // CSVの1行目に記載されている大会名は無視し、選択された大会情報を使用
    const lines = csvText.split(/\r?\n/);
    
    console.log(`Processing CSV with ${lines.length} lines`);
    console.log('Using selected contest:', contestName, contest_date);

    const scores = [];
    let currentCategory = '';
    let inDataSection = false;
    let lineNumber = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      lineNumber = i + 1;
      
      // 最初の2行はスキップ（大会名の行と空行）
      if (i < 2) {
        continue;
      }
      
      // 空行をスキップ
      if (!line) {
        inDataSection = false;
        continue;
      }

      // CSVをパース
      const values = parseCSVLine(line);

      // カテゴリー行を検出（最初のセルにデータがあり、他が空）
      if (values[0] && values[0].trim() && 
          (!values[1] || !values[1].trim()) && 
          (!values[4] || !values[4].trim())) {
        currentCategory = values[0].trim();
        inDataSection = false;
        console.log('Found category:', currentCategory);
        continue;
      }

      // ヘッダー行を検出（#, First Name, Last Name, Country, Score, Placing）
      if (values[0] === '#' && values[1] && values[1].toLowerCase().includes('first')) {
        inDataSection = true;
        console.log('Found header for category:', currentCategory);
        continue;
      }

      // データ行を処理
      // CSVのA列（"#"列）がplayer_noです
      if (inDataSection && currentCategory && values[0] && values[0].trim()) {
        const player_no = values[0].trim();  // A列の"#"から取得
        const first_name = values[1] ? values[1].trim() : '';  // B列
        const last_name = values[2] ? values[2].trim() : '';   // C列
        const country = values[3] ? values[3].trim() : '';     // D列
        const score = values[4] ? values[4].trim() : '';       // E列
        const placing = values[5] ? values[5].trim() : '';     // F列

        // player_no（A列の"#"）とcategory（class_name）でRegistrationsから情報を取得
        const regKey = `${player_no}|${currentCategory}`;
        const regData = registrationMap.get(regKey);

        if (!regData) {
          console.warn(`Warning: No registration found for player_no=${player_no}, class_name=${currentCategory}`);
        } else {
          console.log(`Matched: player_no=${player_no}, class_name=${currentCategory} -> fwj_card_no=${regData.fwj_card_no}, player_name=${regData.player_name}`);
        }

        const scoreData = {
          contest_date: contest_date,
          contest_name: contestName,
          contest_place: contest_place,
          category_name: currentCategory,
          player_no: player_no,
          placing: placing || '',
          fwj_card_no: regData ? regData.fwj_card_no : '',
          player_name: regData ? regData.player_name : ''
        };

        scores.push(scoreData);
      }
    }

    console.log(`Parsed ${scores.length} scores from CSV`);

    if (scores.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'インポート可能な成績データが見つかりませんでした' 
      });
    }

    // バッチインポートを実行
    console.log('Starting batch import...');
    const result = await scoreModel.batchImport(scores);
    console.log('Batch import result:', result.success ? 'SUCCESS' : 'FAILED');
    
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
    console.error('Import error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 複数のNPCJ番号の成績データをテキスト形式で取得
router.get('/text/multiple', async (req, res) => {
  try {
    const { fwjNos, id } = req.query;
    const sortBy = req.query.sort || 'contest_date';
    const sortOrder = req.query.order || 'desc';
    
    if (!fwjNos && !id) {
      return res.status(400).json({ success: false, error: 'fwjNosまたはidパラメータが必要です' });
    }
    
    // 全成績を取得
    const allScores = await scoreModel.findAll();
    let targetScores = [];
    
    // fwjNosによる絞り込み
    if (fwjNos) {
      const npcjList = fwjNos.split(',').map(n => n.trim()).filter(n => n);
      if (npcjList.length > 0) {
        const fwjScores = allScores.filter(score => 
          score.fwj_card_no && npcjList.includes(score.fwj_card_no.toString())
        );
        targetScores = targetScores.concat(fwjScores);
      }
    }
    
    // idによる絞り込み（単一IDのみ）
    if (id) {
      const idScore = allScores.find(score => 
        score.id && score.id.toString() === id.toString()
      );
      if (idScore) {
        targetScores = targetScores.concat([idScore]);
      }
    }
    
    // 重複を除去（同じIDの成績が複数選択された場合）
    const uniqueScores = targetScores.filter((score, index, self) => 
      index === self.findIndex(s => s.id === score.id)
    );
    
    if (uniqueScores.length === 0) {
      const errorMsg = fwjNos && id ? 
        `指定されたFWJ番号 [${fwjNos}] または ID ${id} の成績が見つかりません` :
        fwjNos ? 
        `指定されたFWJ番号 [${fwjNos}] の成績が見つかりません` :
        `指定されたID ${id} の成績が見つかりません`;
      
      return res.status(404).json({ 
        success: false, 
        error: errorMsg
      });
    }
    
    // マージした成績をソート処理用の変数に代入
    const mergedScores = uniqueScores;
    
    // ソート処理
    const sortedScores = mergedScores.sort((a, b) => {
      let aValue = a[sortBy] || '';
      let bValue = b[sortBy] || '';
      
      // 数値の場合は数値として比較
      if (sortBy === 'placing' || sortBy === 'fwj_card_no') {
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
    
    // テキスト形式で出力（NPCJ番号は除く）
    const textLines = sortedScores.map(score => {
      const date = score.contest_date || '不明';
      const contest = score.contest_name || '不明';
      const category = score.category_name || '不明';
      const placing = score.placing || '不明';
      
      return `${date} | ${contest} | ${category} | ${placing}位`;
    });
    
    // 重複行を削除
    const uniqueLines = [...new Set(textLines)];
    
    const resultText = uniqueLines.join('\n');
    
    // テキスト形式で返す
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(resultText);
    
  } catch (error) {
    console.error('Multiple text API error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// テキスト形式で成績データを取得
router.get('/text/:fwjNo', async (req, res) => {
  try {
    const { fwjNo } = req.params;
    const sortBy = req.query.sort || 'contest_date';
    const sortOrder = req.query.order || 'desc';

    if (!fwjNo) {
      return res.status(400).json({ success: false, error: 'FWJ番号が必要です' });
    }
    
    // 指定されたFWJ番号の成績を取得
    const allScores = await scoreModel.findAll();
    const userScores = allScores.filter(score => 
      score.fwj_card_no && score.fwj_card_no.toString() === fwjNo.toString()
    );
    
    if (userScores.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: `FWJ番号 ${fwjNo} の成績が見つかりません` 
      });
    }
    
    // ソート処理
    const sortedScores = userScores.sort((a, b) => {
      let aValue = a[sortBy] || '';
      let bValue = b[sortBy] || '';
      
      // 数値の場合は数値として比較
      if (sortBy === 'placing' || sortBy === 'fwj_card_no') {
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