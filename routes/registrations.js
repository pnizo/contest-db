const express = require('express');
const Registration = require('../models/Registration');
const Subject = require('../models/Subject');
const Note = require('../models/Note');
const { requireAuth, requireAdmin, checkAuth } = require('../middleware/auth');
const XLSX = require('xlsx');
const iconv = require('iconv-lite');
const router = express.Router();

const registrationModel = new Registration();
const subjectModel = new Subject();
const noteModel = new Note();

// 氏名を正規化する関数（スペースを除去）
function normalizeNameJa(nameJa) {
  if (!nameJa) return '';
  return nameJa.replace(/\s+/g, '');
}

// 登録データと特記事項をマッチングする関数
function hasMatchingNote(registration, notes) {
  // 同じ大会名のNotesのみ対象
  const contestNotes = notes.filter(note => note.contest_name === registration.contest_name);

  if (contestNotes.length === 0) return false;

  // マッチング条件をチェック
  return contestNotes.some(note => {
    // player_noでマッチ
    if (registration.player_no && note.player_no &&
        registration.player_no.toString() === note.player_no.toString()) {
      return true;
    }

    // fwj_card_noでマッチ
    if (registration.fwj_card_no && note.fwj_card_no &&
        registration.fwj_card_no.toString() === note.fwj_card_no.toString()) {
      return true;
    }

    // npc_member_noでマッチ
    if (registration.npc_member_no && note.npc_member_no &&
        registration.npc_member_no.toString() === note.npc_member_no.toString()) {
      return true;
    }

    // emailでマッチ
    if (registration.email && note.email &&
        registration.email.toLowerCase() === note.email.toLowerCase()) {
      return true;
    }

    // 正規化したname_jaでマッチ
    if (registration.name_ja && note.name_ja) {
      const normalizedRegName = normalizeNameJa(registration.name_ja);
      const normalizedNoteName = normalizeNameJa(note.name_ja);
      if (normalizedRegName && normalizedNoteName && normalizedRegName === normalizedNoteName) {
        return true;
      }
    }

    return false;
  });
}

// フィルター用の一意値取得
router.get('/filter-options', requireAuth, async (req, res) => {
  try {
    console.log('Loading registration filter options...');
    const allRegistrations = await registrationModel.findAll();
    console.log(`Found ${allRegistrations.length} registrations for filter options`);
    
    // 一意の大会名を取得（開催日の降順で並び替え）
    const contestNamesWithDates = allRegistrations
      .filter(reg => reg.contest_name && reg.contest_name.trim() !== '' && reg.contest_date)
      .map(reg => ({
        name: reg.contest_name,
        date: reg.contest_date
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
    
    // 一意のクラス名を取得
    const classNames = [...new Set(
      allRegistrations
        .map(reg => reg.class)
        .filter(name => name && name.trim() !== '')
    )].sort();
    
    console.log(`Contest names: ${contestNames.length}, Class names: ${classNames.length}`);
    console.log('Contest names (sorted by date desc):', contestNames.slice(0, 5)); // 最初の5個を表示
    
    res.json({ 
      success: true, 
      data: {
        contestNames,
        classNames
      }
    });
  } catch (error) {
    console.error('Registration filter options error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 番号による検索エンドポイント（特記事項用）
router.get('/search/by-number', requireAuth, async (req, res) => {
  try {
    const { contest_name, player_no, fwj_card_no, npc_member_no } = req.query;

    console.log('=== SEARCH BY NUMBER DEBUG ===');
    console.log('Parameters:', { contest_name, player_no, fwj_card_no, npc_member_no });

    if (!contest_name) {
      return res.status(400).json({ success: false, error: '大会名は必須です' });
    }

    if (!player_no && !fwj_card_no && !npc_member_no) {
      return res.status(400).json({ success: false, error: 'いずれかの番号フィールドが必要です' });
    }

    // 全データを取得
    const allRegistrations = await registrationModel.findAll();
    console.log('Total registrations:', allRegistrations.length);

    // 大会名でフィルター
    const contestRegistrations = allRegistrations.filter(reg =>
      reg.contest_name === contest_name && reg.isValid === 'TRUE'
    );
    console.log('Contest registrations:', contestRegistrations.length);

    // 番号で検索（完全一致）
    let foundRecord = null;

    if (player_no) {
      console.log('Searching by player_no:', player_no);
      foundRecord = contestRegistrations.find(reg =>
        reg.player_no && reg.player_no.toString() === player_no.toString()
      );
      console.log('Found by player_no:', !!foundRecord);
    }

    if (!foundRecord && fwj_card_no) {
      console.log('Searching by fwj_card_no:', fwj_card_no);
      foundRecord = contestRegistrations.find(reg =>
        reg.fwj_card_no && reg.fwj_card_no.toString() === fwj_card_no.toString()
      );
      console.log('Found by fwj_card_no:', !!foundRecord);
    }

    if (!foundRecord && npc_member_no) {
      console.log('Searching by npc_member_no:', npc_member_no);
      foundRecord = contestRegistrations.find(reg =>
        reg.npc_member_no && reg.npc_member_no.toString() === npc_member_no.toString()
      );
      console.log('Found by npc_member_no:', !!foundRecord);
    }

    console.log('Final result:', foundRecord ? 'FOUND' : 'NOT FOUND');
    console.log('===============================');

    if (!foundRecord) {
      return res.status(404).json({
        success: false,
        error: '該当する選手が見つかりません'
      });
    }

    res.json({
      success: true,
      data: foundRecord
    });
  } catch (error) {
    console.error('Search by number error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 全登録データ取得（ページング対応）
router.get('/', requireAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      fwj_card_no,
      contest_name,
      class_name,
      violation_only,
      note_exists,
      search,
      startDate,
      endDate,
      sortBy = 'contest_date',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};
    if (fwj_card_no) filters.fwj_card_no = fwj_card_no;
    if (contest_name) filters.contest_name = contest_name;
    if (class_name) filters.class = class_name;
    if (search) filters.search = search;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    // アクティブなSubjectsデータを取得
    const activeSubjects = await subjectModel.findAllActive();
    const violationFwjCards = new Set(activeSubjects.map(subject => subject.fwj_card_no).filter(Boolean));

    // アクティブなNotesデータを取得
    const activeNotes = await noteModel.findAllActive();

    if (violation_only === 'true' || note_exists === 'true') {
      // ポリシー違反認定者または特記事項フィルタが適用されている場合は全データを取得してフィルタリング
      const allResult = await registrationModel.findWithPaging(
        1,
        Number.MAX_SAFE_INTEGER, // 全件取得
        filters,
        sortBy,
        sortOrder
      );

      // フラグを追加してフィルタリング
      let filteredRegistrations = allResult.data.map(registration => ({
        ...registration,
        isViolationSubject: violationFwjCards.has(registration.fwj_card_no),
        hasNote: hasMatchingNote(registration, activeNotes)
      }));

      // violation_onlyフィルタ
      if (violation_only === 'true') {
        filteredRegistrations = filteredRegistrations.filter(registration => registration.isViolationSubject);
      }

      // note_existsフィルタ
      if (note_exists === 'true') {
        filteredRegistrations = filteredRegistrations.filter(registration => registration.hasNote);
      }

      // フィルタ後の総件数を計算
      const filteredTotal = filteredRegistrations.length;
      const pageSize = Math.min(parseInt(limit), 100);
      const totalPages = Math.ceil(filteredTotal / pageSize);
      const currentPage = parseInt(page);

      // 現在のページのデータを取得
      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const pageData = filteredRegistrations.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: pageData,
        pagination: {
          currentPage: currentPage,
          totalPages: totalPages,
          totalCount: filteredTotal,
          hasNextPage: currentPage < totalPages,
          hasPrevPage: currentPage > 1
        }
      });
    } else {
      // 通常のページング処理
      const result = await registrationModel.findWithPaging(
        parseInt(page),
        Math.min(parseInt(limit), 100), // 最大100件に制限
        filters,
        sortBy,
        sortOrder
      );

      // 各登録データにフラグを追加
      const dataWithFlags = result.data.map(registration => ({
        ...registration,
        isViolationSubject: violationFwjCards.has(registration.fwj_card_no),
        hasNote: hasMatchingNote(registration, activeNotes)
      }));

      res.json({
        success: true,
        ...result,
        data: dataWithFlags
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 特定登録データ取得
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const registration = await registrationModel.findById(req.params.id);
    if (!registration) {
      return res.status(404).json({ success: false, error: '登録データが見つかりません' });
    }
    res.json({ success: true, data: registration });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 登録データ作成（管理者のみ）
router.post('/', requireAdmin, async (req, res) => {
  try {
    const result = await registrationModel.createRegistration(req.body);
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 登録データ更新（管理者のみ）
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updatedAt: new Date().toISOString()
    };
    const result = await registrationModel.update(req.params.id, updateData);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 登録データ論理削除（管理者のみ）
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await registrationModel.softDelete(req.params.id);
    if (result.success) {
      res.json({ success: true, message: '登録データを論理削除しました' });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 削除済み登録データ一覧（管理者のみ）
router.get('/deleted/list', requireAdmin, async (req, res) => {
  try {
    const allRegistrations = await registrationModel.findAllIncludingDeleted();
    const deletedRegistrations = allRegistrations.filter(reg => reg.isValid === 'FALSE');
    res.json({ success: true, data: deletedRegistrations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 登録データ復元（管理者のみ）
router.put('/:id/restore', requireAdmin, async (req, res) => {
  try {
    const result = await registrationModel.update(req.params.id, { 
      isValid: 'TRUE',
      restoredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (result.success) {
      res.json({ success: true, message: '登録データを復元しました', data: result.data });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 登録データ完全削除（管理者のみ）
router.delete('/:id/permanent', requireAdmin, async (req, res) => {
  try {
    const result = await registrationModel.delete(req.params.id);
    if (result.success) {
      res.json({ success: true, message: '登録データを完全に削除しました' });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// FWJカード番号別登録データ取得
router.get('/fwj/:fwjCard', requireAuth, async (req, res) => {
  try {
    const registrations = await registrationModel.findByFwjCard(req.params.fwjCard);
    res.json({ 
      success: true, 
      data: registrations
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ファイルインポート（CSV/XLSX対応、認証済みユーザー）
router.post('/import', requireAuth, async (req, res) => {
  try {
    console.log('=== IMPORT REQUEST START ===');
    const { fileData, fileType, contestDate, contestName } = req.body;
    console.log('Import request:', { 
      fileType, 
      contestDate, 
      contestName, 
      fileDataLength: fileData ? fileData.length : 0 
    });
    
    if (!fileData) {
      console.log('ERROR: No file data provided');
      return res.status(400).json({ success: false, error: 'ファイルデータが無効です' });
    }

    if (!contestDate || !contestName) {
      console.log('ERROR: Missing contest date or name');
      return res.status(400).json({ success: false, error: '大会開催日と大会名は必須です' });
    }

    let parsedData = [];

    if (fileType === 'csv') {
      console.log('Processing CSV file...');
      // CSVファイルの処理
      if (!Array.isArray(fileData)) {
        console.log('ERROR: CSV data is not an array');
        return res.status(400).json({ success: false, error: 'CSVデータが無効です' });
      }
      parsedData = fileData;
      console.log('CSV parsed, rows:', parsedData.length);
    } else if (fileType === 'xlsx') {
      console.log('Processing XLSX file...');
      // XLSXファイルの処理
      try {
        console.log('Converting base64 to buffer...');
        // Base64データをBufferに変換
        const buffer = Buffer.from(fileData, 'base64');
        console.log('Buffer created, size:', buffer.length);
        
        // XLSXファイルを直接読み込み（文字コード変換は後で検討）
        console.log('Reading XLSX workbook...');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        console.log('Workbook loaded, sheet names:', workbook.SheetNames);
        
        // "Registrations"で始まるシート名を検索
        const sheetName = workbook.SheetNames.find(name => 
          name.toLowerCase().startsWith('registrations')
        );
        console.log('Found target sheet:', sheetName);
        
        if (!sheetName) {
          console.log('ERROR: No registrations sheet found');
          return res.status(400).json({ 
            success: false, 
            error: '"Registrations"で始まるシート名が見つかりません。利用可能なシート: ' + workbook.SheetNames.join(', ')
          });
        }

        // シートをJSONに変換
        console.log('Converting sheet to JSON...');
        const worksheet = workbook.Sheets[sheetName];
        parsedData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        console.log('Raw sheet data rows:', parsedData.length);
        
        // ヘッダー行を取得
        if (parsedData.length === 0) {
          console.log('ERROR: Sheet has no data');
          return res.status(400).json({ success: false, error: 'シートにデータがありません' });
        }

        let headers = parsedData[0];
        const rows = parsedData.slice(1);
        console.log('Original Headers:', headers);
        console.log('Data rows:', rows.length);

        // ヘッダーを正規化（小文字化）して、FWJカード → npcj_no への読み替えを行う
        headers = headers.map(header => {
          if (!header) return '';
          const normalizedHeader = header.toString().toLowerCase().trim();

          // FWJカード → npcj_no への読み替え
          if (normalizedHeader === 'fwjカード') {
            console.log('Mapping "FWJカード" to "npcj_no"');
            return 'npcj_no';
          }

          return normalizedHeader;
        });
        console.log('Normalized Headers:', headers);

        // オブジェクト形式に変換
        parsedData = rows.map(row => {
          const obj = {};
          headers.forEach((header, index) => {
            obj[header] = row[index] || '';
          });
          return obj;
        }).filter(row => {
          // 空行をフィルタリング
          return Object.values(row).some(value => value && value.toString().trim() !== '');
        });

        console.log('Processed data rows:', parsedData.length);
        console.log('Sample row:', parsedData[0]);

      } catch (xlsxError) {
        console.error('XLSX parsing error:', xlsxError);
        return res.status(400).json({ 
          success: false, 
          error: 'XLSXファイルの解析に失敗しました: ' + xlsxError.message 
        });
      }
    } else {
      console.log('ERROR: Unsupported file type:', fileType);
      return res.status(400).json({ success: false, error: 'サポートされていないファイル形式です' });
    }

    if (parsedData.length === 0) {
      console.log('ERROR: Parsed data is empty');
      return res.status(400).json({ success: false, error: 'データが空です' });
    }

    console.log('Starting batch import...');
    // バッチインポートを実行
    const result = await registrationModel.batchImport(parsedData, contestDate, contestName);
    console.log('Batch import result:', result.success ? 'SUCCESS' : 'FAILED');
    
    if (result.success) {
      console.log('Import completed successfully:', result.data);
      res.json({
        success: true,
        data: {
          total: result.data.total,
          imported: result.data.imported,
          contestDate: result.data.contestDate,
          contestName: result.data.contestName,
          message: `${result.data.imported}件の登録データを正常にインポートしました`
        }
      });
    } else {
      console.log('Import failed:', result.error);
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 大会・日付別登録データ取得
router.get('/contest/:contestName/:contestDate', requireAuth, async (req, res) => {
  try {
    const { contestName, contestDate } = req.params;
    const registrations = await registrationModel.findByContestAndDate(
      decodeURIComponent(contestName),
      decodeURIComponent(contestDate)
    );
    
    res.json({ 
      success: true, 
      data: registrations,
      contestName: decodeURIComponent(contestName),
      contestDate: decodeURIComponent(contestDate)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// NPC Worldwide Membership 加入督促者リストエクスポート
router.get('/export/membership/:contestName', requireAuth, async (req, res) => {
  try {
    const contestName = decodeURIComponent(req.params.contestName);
    const allRegistrations = await registrationModel.findAll();
    
    // 指定された大会の登録データを取得し、membership_statusに値があるものをフィルター
    const targetRegistrations = allRegistrations.filter(reg => 
      reg.contest_name === contestName && 
      reg.npc_member_status && 
      reg.npc_member_status.trim() !== '' &&
      (reg.npc_member_status === 'Not Found' || reg.npc_member_status === 'Expired')
    );

    // emailで重複排除
    const uniqueEmails = new Map();
    targetRegistrations.forEach(reg => {
      if (reg.email && reg.email.trim() !== '' && !uniqueEmails.has(reg.email)) {
        uniqueEmails.set(reg.email, {
          email: reg.email,
          name: reg.name_ja || ''
        });
      }
    });

    const csvData = Array.from(uniqueEmails.values());
    
    res.json({
      success: true,
      data: csvData,
      filename: `メール配信用_${contestName.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_')}.csv`
    });
  } catch (error) {
    console.error('Membership export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ゼッケン番号リストエクスポート
router.get('/export/athlete_numbers/:contestName', requireAuth, async (req, res) => {
  try {
    const contestName = decodeURIComponent(req.params.contestName);
    const allRegistrations = await registrationModel.findAll();
    
    // 指定された大会の登録データを取得
    const targetRegistrations = allRegistrations.filter(reg => 
      reg.contest_name === contestName
    );

    // player_noで重複排除
    const uniqueAthletes = new Map();
    targetRegistrations.forEach(reg => {
      if (reg.player_no && reg.player_no.trim() !== '' && !uniqueAthletes.has(reg.player_no)) {
        uniqueAthletes.set(reg.player_no, {
          'Athlete #': reg.player_no,
          'First Name': reg.first_name || '',
          'Last Name': reg.last_name || '',
          'Member Number': reg.npc_member_no || '',
          'payment': reg.npc_member_status || ''
        });
      }
    });

    const csvData = Array.from(uniqueAthletes.values());
    
    res.json({
      success: true,
      data: csvData,
      filename: `ゼッケン表示用_${contestName.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_')}.csv`
    });
  } catch (error) {
    console.error('Athlete numbers export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;