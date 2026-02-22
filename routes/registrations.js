const express = require('express');
const Registration = require('../models/Registration');
const Subject = require('../models/Subject');
const Note = require('../models/Note');
const Member = require('../models/Member');
const Order = require('../models/Order');
const { requireAuth, requireAdmin, checkAuth } = require('../middleware/auth');
const { parseFlexibleDate, formatToISODate, calculateAge } = require('../utils/dateUtils');
const wanakana = require('wanakana');
const router = express.Router();

const registrationModel = new Registration();
const subjectModel = new Subject();
const noteModel = new Note();
const memberModel = new Member();
const orderModel = new Order();

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
    
    // 一意のクラス名を取得（カテゴリー + "-" + 最初の1ワードまで）
    const classNames = [...new Set(
      allRegistrations
        .map(reg => {
          if (!reg.class_name || reg.class_name.trim() === '') return null;

          // class_name を "-" で分割
          const parts = reg.class_name.split('-');
          if (parts.length < 2) return reg.class_name; // "-" がない場合はそのまま

          // カテゴリー部分（最初のパート）
          const category = parts[0].trim();

          // 2番目のパート（"-" の後）から最初の1ワードを取得
          const afterDash = parts.slice(1).join('-').trim();
          const firstWord = afterDash.split(/\s+/)[0];

          return `${category} - ${firstWord}`;
        })
        .filter(name => name !== null)
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
    const { contest_name, player_no, fwj_card_no } = req.query;

    console.log('=== SEARCH BY NUMBER DEBUG ===');
    console.log('Parameters:', { contest_name, player_no, fwj_card_no });

    if (!contest_name) {
      return res.status(400).json({ success: false, error: '大会名は必須です' });
    }

    if (!player_no && !fwj_card_no) {
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
      sortBy = 'id',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};
    if (fwj_card_no) filters.fwj_card_no = fwj_card_no;
    if (contest_name) filters.contest_name = contest_name;
    if (class_name) filters.class_name = class_name;
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

// 登録データ作成
router.post('/', requireAuth, async (req, res) => {
  try {
    const data = { ...req.body };

    // sort_index が未指定の場合、同一大会の既存最大値+1をセット
    if (!data.sort_index && data.contest_name) {
      const existing = await registrationModel.findByContestName(data.contest_name);
      let maxSortIndex = 0;
      existing.forEach(reg => {
        const si = parseInt(reg.sort_index, 10);
        if (!isNaN(si) && si > maxSortIndex) {
          maxSortIndex = si;
        }
      });
      data.sort_index = String(maxSortIndex + 1);
    }

    const result = await registrationModel.createRegistration(data);
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 登録データ更新
router.put('/:id', requireAuth, async (req, res) => {
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

// 登録データ論理削除
router.delete('/:id', requireAuth, async (req, res) => {
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

// ゼッケン番号リストエクスポート
router.get('/export/athlete_numbers/:contestName', requireAuth, async (req, res) => {
  try {
    const contestName = decodeURIComponent(req.params.contestName);
    const allRegistrations = await registrationModel.findAll();

    // 指定された大会の登録データを取得
    const targetRegistrations = allRegistrations.filter(reg =>
      reg.contest_name === contestName
    );

    // contest_dateを取得（最初のレコードから）
    const contestDate = targetRegistrations.length > 0 ? targetRegistrations[0].contest_date : '';

    // player_noで重複排除
    const uniqueAthletes = new Map();
    targetRegistrations.forEach(reg => {
      if (reg.player_no && reg.player_no.trim() !== '' && !uniqueAthletes.has(reg.player_no)) {
        uniqueAthletes.set(reg.player_no, {
          'Athlete #': reg.player_no,
          'First Name': reg.first_name || '',
          'Last Name': reg.last_name || '',
          'email': reg.email || '',
          'shopify_id': reg.fwj_card_no || '',
          'Age': reg.age || '',
          'Height': reg.height || '',
          'Weight': reg.weight || ''
        });
      }
    });

    const csvData = Array.from(uniqueAthletes.values());

    // ファイル名: (contest_date)_(contest_name)_(用途名).csv
    const sanitizedContestName = contestName.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_');
    const filename = contestDate
      ? `${contestDate}_${sanitizedContestName}_ゼッケン表示用.csv`
      : `${sanitizedContestName}_ゼッケン表示用.csv`;

    res.json({
      success: true,
      data: csvData,
      filename
    });
  } catch (error) {
    console.error('Athlete numbers export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 全項目エクスポート
router.get('/export/all_fields/:contestName', requireAuth, async (req, res) => {
  try {
    const contestName = decodeURIComponent(req.params.contestName);
    const allRegistrations = await registrationModel.findAll();

    // 指定された大会の登録データを取得
    const targetRegistrations = allRegistrations.filter(reg =>
      reg.contest_name === contestName
    );

    // contest_dateを取得（最初のレコードから）
    const contestDate = targetRegistrations.length > 0 ? targetRegistrations[0].contest_date : '';

    // 全項目をエクスポート用に整形
    const csvData = targetRegistrations.map(reg => ({
      'id': reg.id || '',
      'contest_date': reg.contest_date || '',
      'contest_name': reg.contest_name || '',
      'player_no': reg.player_no || '',
      'name_ja': reg.name_ja || '',
      'name_ja_kana': reg.name_ja_kana || '',
      'fwj_card_no': reg.fwj_card_no || '',
      'first_name': reg.first_name || '',
      'last_name': reg.last_name || '',
      'email': reg.email || '',
      'phone': reg.phone || '',
      'country': reg.country || '',
      'age': reg.age || '',
      'class_name': reg.class_name || '',
      'sort_index': reg.sort_index || '',
      'score_card': reg.score_card || '',
      'contest_order': reg.contest_order || '',
      'height': reg.height || '',
      'weight': reg.weight || '',
      'occupation': reg.occupation || '',
      'instagram': reg.instagram || '',
      'biography': reg.biography || '',
      'back_stage_pass': reg.back_stage_pass ?? 0,
      'is_member': reg.is_member ?? false,
      'createdAt': reg.createdAt || '',
      'isValid': reg.isValid || '',
      'deletedAt': reg.deletedAt || '',
      'updatedAt': reg.updatedAt || '',
      'restoredAt': reg.restoredAt || ''
    }));

    // ファイル名: (contest_date)_(contest_name)_全項目.csv
    const sanitizedContestName = contestName.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_');
    const filename = contestDate
      ? `${contestDate}_${sanitizedContestName}_全項目.csv`
      : `${sanitizedContestName}_全項目.csv`;

    res.json({
      success: true,
      data: csvData,
      filename
    });
  } catch (error) {
    console.error('All fields export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id - 特定のRegistrationを取得
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await registrationModel.getById(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Get registration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Registrationを更新
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const result = await registrationModel.update(id, updateData);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Update registration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /assign-player-numbers - ゼッケン番号採番
router.post('/assign-player-numbers', requireAuth, async (req, res) => {
  try {
    const { contestName, mode } = req.body;

    if (!contestName) {
      return res.status(400).json({ success: false, error: '大会名は必須です' });
    }

    if (!mode || !['keep', 'reassign'].includes(mode)) {
      return res.status(400).json({ success: false, error: '採番モードが不正です' });
    }

    console.log(`Starting player number assignment for ${contestName} (mode: ${mode})`);

    // 全有効レコードを取得
    const registrations = await registrationModel.findByContestName(contestName);

    if (registrations.length === 0) {
      return res.json({
        success: true,
        data: { assigned: 0, skipped: 0, total: 0, contestName, message: '対象レコードがありません' }
      });
    }

    // sort_index 順にソート（数値比較）
    registrations.sort((a, b) => {
      const ai = parseInt(a.sort_index, 10) || 99999;
      const bi = parseInt(b.sort_index, 10) || 99999;
      return ai - bi;
    });

    const updates = [];
    // fwj_card_no → 割り当て済み player_no のマップ（同一人物に同じ番号を付与）
    const cardToPlayerNo = new Map();

    if (mode === 'reassign') {
      // fwj_card_no があるレコードのみ採番し直し、空のレコードは既存値を保持
      let counter = 1;
      for (const reg of registrations) {
        if (!reg.fwj_card_no || reg.fwj_card_no.trim() === '') {
          continue;
        }

        const cardNo = reg.fwj_card_no.trim();
        let playerNo;
        if (cardToPlayerNo.has(cardNo)) {
          playerNo = cardToPlayerNo.get(cardNo);
        } else {
          playerNo = String(counter);
          cardToPlayerNo.set(cardNo, playerNo);
          counter++;
        }
        updates.push({ id: reg.id, data: { player_no: playerNo } });
      }
    } else {
      // keep: player_no が空かつ fwj_card_no があるレコードのみ採番
      // まず既存の fwj_card_no → player_no マッピングを収集
      for (const reg of registrations) {
        if (reg.fwj_card_no && reg.fwj_card_no.trim() !== '' && reg.player_no && reg.player_no.trim() !== '') {
          cardToPlayerNo.set(reg.fwj_card_no.trim(), reg.player_no.trim());
        }
      }

      // 既存の最大値を取得
      let maxNo = 0;
      registrations.forEach(reg => {
        const pn = parseInt(reg.player_no, 10);
        if (!isNaN(pn) && pn > maxNo) {
          maxNo = pn;
        }
      });

      let counter = maxNo + 1;
      for (const reg of registrations) {
        if (reg.player_no && reg.player_no.trim() !== '') continue;
        if (!reg.fwj_card_no || reg.fwj_card_no.trim() === '') continue;

        const cardNo = reg.fwj_card_no.trim();
        let playerNo;
        if (cardToPlayerNo.has(cardNo)) {
          playerNo = cardToPlayerNo.get(cardNo);
        } else {
          playerNo = String(counter);
          cardToPlayerNo.set(cardNo, playerNo);
          counter++;
        }
        updates.push({ id: reg.id, data: { player_no: playerNo } });
      }
    }

    if (updates.length > 0) {
      const result = await registrationModel.batchUpdate(updates);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
    }

    const skippedCount = registrations.filter(r => !r.fwj_card_no || r.fwj_card_no.trim() === '').length;

    const message = mode === 'reassign'
      ? `${updates.length}件のゼッケン番号を振り直しました` + (skippedCount > 0 ? `（FWJカード番号なし${skippedCount}件は保持）` : '')
      : `${updates.length}件にゼッケン番号を新規採番しました（既存${registrations.length - updates.length - skippedCount}件は保持）` + (skippedCount > 0 ? `（FWJカード番号なし${skippedCount}件はスキップ）` : '');

    console.log(`Player number assignment completed: ${updates.length} updated, ${skippedCount} skipped (mode: ${mode})`);

    res.json({
      success: true,
      data: {
        assigned: updates.length,
        skipped: skippedCount,
        total: registrations.length,
        contestName,
        message
      }
    });

  } catch (error) {
    console.error('Assign player numbers error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// POST /import-shopify - OrdersテーブルとMembersテーブルからRegistrationsを作成（UPSERT方式）
router.post('/import-shopify', requireAdmin, async (req, res) => {
  try {
    const { contestDate, contestName } = req.body;

    if (!contestDate || !contestName) {
      return res.status(400).json({
        success: false,
        error: '大会開催日と大会名は必須です'
      });
    }

    console.log(`Starting Shopify import (UPSERT) for ${contestName} (${contestDate})`);

    // 1. Orders・既存Registrations・Members を取得
    const ordersData = await orderModel.findAll();
    console.log(`Loaded ${ordersData.length} order rows from Orders table`);

    // ソフトデリート済みを含む全レコードを取得（UPSERTマッチング用）
    const allExistingRegistrations = await registrationModel.findByContestNameAll(contestName);
    // 有効なレコードのみ
    const activeRegistrations = allExistingRegistrations.filter(r => r.isValid !== 'FALSE');
    console.log(`Found ${allExistingRegistrations.length} existing registrations (${activeRegistrations.length} active) for ${contestName}`);

    const allMembers = await memberModel.findAllUnfiltered();
    console.log(`Loaded ${allMembers.length} members from Members table`);

    // shopify_idでMembersをMapに変換（高速ルックアップ用）
    const membersMap = new Map();
    allMembers.forEach(member => {
      if (member.shopify_id) {
        membersMap.set(String(member.shopify_id), member);
      }
    });

    // 2. Orders を走査して「有効注文マップ」「返金注文セット」を構築
    // key = fwjCardNo::className
    const shopifyOrderStatus = new Map(); // key → 'valid' | 'refunded'
    const validOrderData = new Map(); // key → order (有効注文のデータ保持用)

    for (const order of ordersData) {
      if (!order.shopify_id) continue;
      const className = order.variant || '';
      const key = `${order.shopify_id}::${className}`;

      if (order.financial_status === '返金済み' || (parseInt(order.current_quantity, 10) || 0) <= 0) {
        if (!shopifyOrderStatus.has(key)) {
          shopifyOrderStatus.set(key, 'refunded');
        }
      } else {
        shopifyOrderStatus.set(key, 'valid'); // valid は refunded を上書き
        validOrderData.set(key, order);
      }
    }

    console.log(`Order status map: ${shopifyOrderStatus.size} entries, ${validOrderData.size} valid orders`);

    // 3. 既存レコードを (fwjCardNo::className) → record のマップ化
    // fwjCardNo が空/null のレコードはマップに含めない（手動エントリーとして保護）
    const existingMap = new Map();
    for (const reg of activeRegistrations) {
      if (reg.fwj_card_no) {
        const key = `${reg.fwj_card_no}::${reg.class_name || ''}`;
        existingMap.set(key, reg);
      }
    }

    // 4. 各有効注文について UPDATE / INSERT を判定
    const updates = [];      // { id, data } の配列
    const inserts = [];       // batchImport 用の配列
    const deleteIds = []; // DELETE 対象の ID 配列
    const processedKeys = new Set(); // UPDATE 済みキーを記録
    const skippedOrders = [];
    const memberNotFoundOrders = [];

    for (const [key, order] of validOrderData) {
      const shopifyId = order.shopify_id;
      const className = order.variant || '';

      // Member を検索
      const member = membersMap.get(String(shopifyId));

      // 年齢を計算
      let age = '';
      if (member && member.fwj_birthday) {
        const calculatedAge = calculateAge(member.fwj_birthday, contestDate);
        if (calculatedAge !== null) {
          age = String(calculatedAge);
        }
      }

      // 共通フィールドデータを構築（player_noは採番機能で別途設定）
      const regData = {
        name_ja: member
          ? `${member.fwj_lastname || ''} ${member.fwj_firstname || ''}`.trim()
          : (order.full_name || ''),
        name_ja_kana: member ? `${member.fwj_kanalastname || ''} ${member.fwj_kanafirstname || ''}`.trim() : '',
        first_name: member ? (member.fwj_firstname || '') : '',
        last_name: member ? (member.fwj_lastname || '') : '',
        phone: member ? (member.phone || '') : '',
        height: member ? (member.fwj_height || '') : '',
        weight: member ? (member.fwj_weight || '') : '',
        country: member ? (member.fwj_nationality || '') : '',
        age: age,
        fwj_card_no: shopifyId,
        email: order.email || '',
        class_name: className,
        back_stage_pass: order.back_stage_pass ?? 0,
        is_member: !!member,
        sort_index: '',
        score_card: '',
        contest_order: '',
        occupation: order.occupation || '',
        instagram: '',
        biography: order.biography || '',
      };

      // 既存レコードにマッチ → UPDATE（player_noは変更しない）
      if (existingMap.has(key)) {
        const existing = existingMap.get(key);
        updates.push({ id: existing.id, data: regData });
        processedKeys.add(key);
      } else {
        // 新規 → INSERT（player_noは空白）
        inserts.push({ ...regData, player_no: '' });
      }

      // Member が見つからなかった場合は記録
      if (!member) {
        memberNotFoundOrders.push({
          shopify_id: shopifyId,
          order_no: order.order_no || '',
          email: order.email || ''
        });
      }
    }

    // 5. 返金注文に対応する既存レコードをソフトデリート候補に追加
    for (const [key, existingReg] of existingMap) {
      // UPDATE 済み → スキップ
      if (processedKeys.has(key)) continue;
      // Orders に返金/キャンセルとして存在するもの → ソフトデリート
      const status = shopifyOrderStatus.get(key);
      if (status === 'refunded') {
        deleteIds.push(existingReg.id);
      }
      // Orders に存在しない = 手動エントリー等 → 何もしない
    }

    // 手動エントリー数（fwjCardNo が空 or Orders に存在しないレコード）
    const preservedCount = activeRegistrations.filter(r => {
      if (!r.fwj_card_no) return true;
      const key = `${r.fwj_card_no}::${r.class_name || ''}`;
      return !processedKeys.has(key) && !deleteIds.includes(r.id);
    }).length;

    // Orders からスキップされた行を集計
    for (const order of ordersData) {
      if (!order.shopify_id) {
        skippedOrders.push({ reason: 'shopify_id不明', order: order.order_no || 'unknown' });
      }
    }

    console.log(`UPSERT plan: ${inserts.length} inserts, ${updates.length} updates, ${deleteIds.length} deletes, ${preservedCount} preserved`);

    // 6. DB操作を実行
    // INSERT
    let insertedCount = 0;
    if (inserts.length > 0) {
      const importResult = await registrationModel.batchImport(inserts, contestDate, contestName);
      if (!importResult.success) {
        return res.status(400).json({ success: false, error: importResult.error });
      }
      insertedCount = importResult.data.imported;
    }

    // UPDATE
    let updatedCount = 0;
    if (updates.length > 0) {
      const updateResult = await registrationModel.batchUpdate(updates);
      if (!updateResult.success) {
        return res.status(400).json({ success: false, error: updateResult.error });
      }
      updatedCount = updateResult.updated || updates.length;
    }

    // DELETE（返金/キャンセル済み注文）
    let deletedCount = 0;
    if (deleteIds.length > 0) {
      const deleteResult = await registrationModel.batchDelete(deleteIds);
      if (!deleteResult.success) {
        return res.status(400).json({ success: false, error: '削除に失敗しました' });
      }
      deletedCount = deleteResult.deleted;
    }

    // 7. sort_index 再計算: 全有効レコードを取得してソート
    const allActiveRegs = await registrationModel.findByContestName(contestName);

    // カテゴリー辞書（優先度順）
    const CATEGORY_PRIORITY = [
      'Family Physique', 'ファミリーフィジーク',
      'Kid\s Physique', 'キッズフィジーク',
      'Favorite Athlete', 'フェイバリットアスリート',
      'Women\'s Athlete Model', 'ウィメンズアスリートモデル',
      'Bikini Model', 'ビキニモデル',
      'Bikini', 'ビキニ',
      'Wellness', 'ウェルネス',
      'Figure', 'フィギュア',
      'Men\'s Fitness Model', 'メンズフィットネスモデル',
      'Men\'s Athlete Model', 'メンズアスリートモデル',
      'Men\'s Physique', 'メンズフィジーク',
      'Classic Physique', 'クラシックフィジーク',
      'Bodybuilding', 'ボディビルディング'
    ];

    // クラス辞書（優先度順）
    const CLASS_PRIORITY = [
      'First Challenge', 'ファーストチャレンジ',
      'Beginner', 'ビギナー',
      'Teen', 'ティーン',
      'Junior', 'ジュニア',
      'Masters', 'マスターズ',
      'Lean', 'リーン',
      'Plus', 'プラス',
      'Open', 'オープン',
      'Lightweight', 'ライトウェイト',
      'Heavyweight', 'ヘビーウェイト'
    ];

    function getCustomSortKey(className) {
      let categoryIndex = CATEGORY_PRIORITY.length;
      for (let i = 0; i < CATEGORY_PRIORITY.length; i++) {
        if (className.includes(CATEGORY_PRIORITY[i])) {
          categoryIndex = i;
          break;
        }
      }
      let classIndex = CLASS_PRIORITY.length;
      for (let i = 0; i < CLASS_PRIORITY.length; i++) {
        if (className.includes(CLASS_PRIORITY[i])) {
          classIndex = i;
          break;
        }
      }
      return { categoryIndex, classIndex, className };
    }

    allActiveRegs.sort((a, b) => {
      const keyA = getCustomSortKey(a.class_name || '');
      const keyB = getCustomSortKey(b.class_name || '');

      const aMatchesBoth = keyA.categoryIndex < CATEGORY_PRIORITY.length && keyA.classIndex < CLASS_PRIORITY.length;
      const bMatchesBoth = keyB.categoryIndex < CATEGORY_PRIORITY.length && keyB.classIndex < CLASS_PRIORITY.length;

      if (aMatchesBoth && !bMatchesBoth) return -1;
      if (!aMatchesBoth && bMatchesBoth) return 1;

      if (aMatchesBoth && bMatchesBoth) {
        if (keyA.categoryIndex !== keyB.categoryIndex) {
          return keyA.categoryIndex - keyB.categoryIndex;
        }
        if (keyA.classIndex !== keyB.classIndex) {
          return keyA.classIndex - keyB.classIndex;
        }
      }

      return keyA.className.localeCompare(keyB.className, 'ja');
    });

    // sort_index を振り直し
    const sortIndexUpdates = allActiveRegs.map((reg, index) => ({
      id: reg.id,
      data: { sort_index: String(index + 1) }
    }));
    if (sortIndexUpdates.length > 0) {
      await registrationModel.batchUpdate(sortIndexUpdates);
    }

    // 結果レスポンス
    const total = insertedCount + updatedCount + deletedCount + preservedCount;
    const message = `${insertedCount}件を新規追加、${updatedCount}件を更新、${deletedCount}件を削除しました`
      + (preservedCount > 0 ? `（手動エントリー${preservedCount}件は保持）` : '');

    const responseData = {
      total,
      inserted: insertedCount,
      updated: updatedCount,
      deleted: deletedCount,
      preserved: preservedCount,
      skipped: skippedOrders.length,
      memberNotFound: memberNotFoundOrders.length,
      contestDate,
      contestName,
      message
    };

    if (memberNotFoundOrders.length > 0) {
      responseData.warnings = memberNotFoundOrders.map(o =>
        `shopify_id: ${o.shopify_id} (注文: ${o.order_no}, email: ${o.email}) - Memberが見つからないため、Members由来の項目は空白です`
      );
    }

    console.log(`Shopify import (UPSERT) completed: inserted ${insertedCount}, updated ${updatedCount}, deleted ${deletedCount}, preserved ${preservedCount}, skipped ${skippedOrders.length}`);

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Shopify import error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /import-csv - CSVインポート（選択した項目のみ更新）
router.post('/import-csv', requireAdmin, async (req, res) => {
  try {
    const { csvData, fields } = req.body;

    // バリデーション
    if (!csvData || !Array.isArray(csvData) || csvData.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'CSVデータが必要です'
      });
    }

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'インポートする項目を1つ以上選択してください'
      });
    }

    // 許可フィールドのホワイトリストチェック
    const ALLOWED_IMPORT_FIELDS = [
      'name_ja', 'name_ja_kana', 'first_name', 'last_name',
      'country', 'age', 'class_name', 'height', 'weight',
      'occupation', 'biography', 'back_stage_pass'
    ];

    const invalidFields = fields.filter(f => !ALLOWED_IMPORT_FIELDS.includes(f));
    if (invalidFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `許可されていないフィールドが含まれています: ${invalidFields.join(', ')}`
      });
    }

    // id列の存在チェック
    if (!('id' in csvData[0])) {
      return res.status(400).json({
        success: false,
        error: 'CSVにid列が必要です'
      });
    }

    console.log(`Starting CSV import: ${csvData.length} rows, fields: ${fields.join(', ')}`);

    // バッチ更新用・新規挿入用の配列を構築
    const updates = [];
    const inserts = [];
    let skipped = 0;

    for (const row of csvData) {
      const id = row.id;

      // id空白 → 新規INSERTとして収集
      if (!id) {
        // contest_date, contest_name が行に含まれているか確認
        if (!row.contest_date || !row.contest_name) {
          skipped++;
          continue;
        }
        inserts.push(row);
        continue;
      }

      // 選択されたフィールドのみ更新データとして抽出
      const updateData = {};
      fields.forEach(field => {
        if (field in row) {
          updateData[field] = row[field];
        }
      });

      if (Object.keys(updateData).length === 0) {
        skipped++;
        continue;
      }

      updates.push({ id, data: updateData });
    }

    // バッチUPDATE実行
    let updated = 0;
    if (updates.length > 0) {
      const result = await registrationModel.batchUpdate(updates);
      if (result.success) {
        updated = result.updated;
      } else {
        return res.status(500).json({ success: false, error: result.error });
      }
    }

    // 新規レコードINSERT実行
    let inserted = 0;
    if (inserts.length > 0) {
      // contest_date/contest_name でグループ化してbatchImport
      const groupedByContest = {};
      for (const row of inserts) {
        const key = `${row.contest_date}||${row.contest_name}`;
        if (!groupedByContest[key]) {
          groupedByContest[key] = { contestDate: row.contest_date, contestName: row.contest_name, rows: [] };
        }
        groupedByContest[key].rows.push(row);
      }

      for (const group of Object.values(groupedByContest)) {
        const result = await registrationModel.batchImport(group.rows, group.contestDate, group.contestName);
        if (result.success) {
          inserted += result.data.imported;
        } else {
          return res.status(500).json({ success: false, error: result.error });
        }
      }
    }

    const messageParts = [];
    if (updated > 0) messageParts.push(`${updated}件を更新`);
    if (inserted > 0) messageParts.push(`${inserted}件を新規追加`);
    if (skipped > 0) messageParts.push(`${skipped}件スキップ`);

    res.json({
      success: true,
      data: {
        totalRows: csvData.length,
        updated,
        inserted,
        skipped,
        fields: fields,
        message: messageParts.join('、') + 'しました'
      }
    });

  } catch (error) {
    console.error('CSV import error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /import-contest-order - 開催順CSVインポート
router.post('/import-contest-order', requireAdmin, async (req, res) => {
  try {
    const { contestName, csvData } = req.body;

    // バリデーション
    if (!contestName) {
      return res.status(400).json({
        success: false,
        error: '大会名は必須です'
      });
    }

    if (!csvData || !Array.isArray(csvData) || csvData.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'CSVデータが必要です'
      });
    }

    console.log(`Starting contest order import for ${contestName}`);

    // 既存のRegistrationsデータを取得（isValid='TRUE'のみ）
    const existingRegistrations = await registrationModel.findAll();
    const targetRegistrations = existingRegistrations.filter(
      reg => reg.contest_name === contestName && reg.isValid === 'TRUE'
    );

    if (targetRegistrations.length === 0) {
      return res.status(400).json({
        success: false,
        error: `大会「${contestName}」の登録データが見つかりません`
      });
    }

    // CSVのclass_nameから大会名を除去し、文字を正規化する関数
    const normalizeClassName = (className, contestName) => {
      if (!className) return '';
      let normalized = className.trim();

      // 大会名が先頭にある場合は除去
      if (normalized.startsWith(contestName)) {
        normalized = normalized.substring(contestName.length);
        // 区切り文字（" - ", " ", "-" など）を除去
        normalized = normalized.replace(/^[\s\-–—]+/, '').trim();
      }

      // 文字の正規化: 全角チルダ→半角チルダ、全角ハイフン類→半角ハイフン
      normalized = normalized
        .replace(/～/g, '~')           // 全角チルダ → 半角チルダ
        .replace(/[－ー―]/g, '-')      // 全角ハイフン類 → 半角ハイフン
        .replace(/\s+/g, ' ');         // 連続スペースを単一スペースに

      return normalized;
    };

    // CSVからclass_name → {score_card, contest_order}のマップを作成
    // 大会名を除去した正規化されたclass_nameをキーとして使用
    const csvMap = new Map();
    csvData.forEach(row => {
      const rawClassName = row.class_name?.trim();
      if (rawClassName) {
        const normalizedClassName = normalizeClassName(rawClassName, contestName);
        csvMap.set(normalizedClassName, {
          score_card: row.score_card || '',
          contest_order: row.contest_order || ''
        });
      }
    });

    // バッチ更新用の配列を構築
    const updates = [];
    let updated = 0;
    let cleared = 0;

    for (const reg of targetRegistrations) {
      const className = reg.class_name?.trim() || '';
      // 既存レコードのclass_nameも正規化してマッチング
      const normalizedRegClassName = normalizeClassName(className, contestName);
      const csvEntry = csvMap.get(normalizedRegClassName);

      let updateData;
      if (csvEntry) {
        // CSVにマッチ: 値を更新
        updateData = {
          score_card: csvEntry.score_card,
          contest_order: csvEntry.contest_order
        };
        updated++;
      } else {
        // マッチしない: 空欄にリセット
        updateData = {
          score_card: '',
          contest_order: ''
        };
        cleared++;
      }

      updates.push({ id: reg.id, data: updateData });
    }

    // バッチUPDATE実行
    if (updates.length > 0) {
      const result = await registrationModel.batchUpdate(updates);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }
    }

    res.json({
      success: true,
      data: {
        contestName,
        totalRecords: targetRegistrations.length,
        updated,
        cleared,
        csvRows: csvData.length,
        message: `${updated}件を更新、${cleared}件をクリアしました`
      }
    });

  } catch (error) {
    console.error('Contest order import error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;