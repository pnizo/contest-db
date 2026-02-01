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

// POST /import-shopify - OrdersテーブルとMembersテーブルからRegistrationsを作成
router.post('/import-shopify', requireAdmin, async (req, res) => {
  try {
    const { contestDate, contestName } = req.body;

    if (!contestDate || !contestName) {
      return res.status(400).json({
        success: false,
        error: '大会開催日と大会名は必須です'
      });
    }

    console.log(`Starting Shopify import for ${contestName} (${contestDate})`);

    // Ordersテーブルから全データを取得
    const ordersData = await orderModel.findAll();
    console.log(`Loaded ${ordersData.length} order rows from Orders table`);

    if (ordersData.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Ordersテーブルにデータがありません'
      });
    }

    // 既存のRegistrationsデータを取得（player_no引き継ぎ用）
    const existingRegistrations = await registrationModel.findByContestName(contestName);
    console.log(`Found ${existingRegistrations.length} existing registrations for ${contestName}`);

    // player_no引き継ぎ用Map: fwj_card_no → player_no
    const existingPlayerNoMap = new Map();
    existingRegistrations.forEach(reg => {
      if (reg.fwj_card_no && reg.player_no) {
        existingPlayerNoMap.set(String(reg.fwj_card_no), reg.player_no);
      }
    });

    // 新規player_no用: 既存のplayer_no最大値を計算
    let playerNoCounter = 1;
    existingRegistrations.forEach(reg => {
      const pn = parseInt(reg.player_no, 10);
      if (!isNaN(pn) && pn >= playerNoCounter) {
        playerNoCounter = pn + 1;
      }
    });

    // 既存データを削除（インポート前に削除）
    if (existingRegistrations.length > 0) {
      console.log(`Deleting ${existingRegistrations.length} existing registrations...`);
      await registrationModel.deleteByContestName(contestName);
      console.log(`Deleted ${existingRegistrations.length} existing registrations`);
    }

    // Membersの全データを取得
    const allMembers = await memberModel.findAll();
    console.log(`Loaded ${allMembers.length} members from Members table`);

    // shopify_idでMembersをMapに変換（高速ルックアップ用）
    const membersMap = new Map();
    allMembers.forEach(member => {
      if (member.shopify_id) {
        membersMap.set(String(member.shopify_id), member);
      }
    });

    // 変換結果
    const newRegistrations = [];
    const skippedOrders = [];
    const memberNotFoundOrders = [];

    // 新規データ用のplayer_noマップ（同じfwj_card_noには同じplayer_noを付与）
    const newPlayerNoMap = new Map();

    // 各Orderレコードを処理
    for (const order of ordersData) {
      const shopifyId = order.shopify_id;

      if (!shopifyId) {
        skippedOrders.push({ reason: 'shopify_id不明', order: order.order_no || 'unknown' });
        continue;
      }

      // current_quantityが0以下（キャンセル・削除済み）の行をスキップ
      const currentQty = parseInt(order.current_quantity, 10);
      if (isNaN(currentQty) || currentQty <= 0) {
        skippedOrders.push({ reason: 'current_quantity が 0 以下', order: order.order_no || 'unknown' });
        continue;
      }

      // Memberを検索
      const member = membersMap.get(String(shopifyId));

      // class_nameを生成: product_name + " - " + variant（contest_nameを除去）
      const productName = order.product_name || '';
      const variant = order.variant || '';
      let className = variant ? `${productName} - ${variant}` : productName;
      // contest_nameを除去
      if (contestName && className.includes(contestName)) {
        className = className.replace(contestName, '').trim();
        // 先頭や末尾の不要な記号を除去
        className = className.replace(/^[\s\-–—:：]+|[\s\-–—:：]+$/g, '').trim();
      }

      // 年齢を計算（fwj_birthday と contestDate から）
      let age = '';
      if (member && member.fwj_birthday) {
        const calculatedAge = calculateAge(member.fwj_birthday, contestDate);
        if (calculatedAge !== null) {
          age = String(calculatedAge);
        }
      }

      // player_noを決定: 既存データにあれば引き継ぎ、なければ新規発行
      let playerNo = '';
      if (existingPlayerNoMap.has(String(shopifyId))) {
        // 既存データからplayer_noを引き継ぐ
        playerNo = existingPlayerNoMap.get(String(shopifyId));
      } else if (newPlayerNoMap.has(String(shopifyId))) {
        // 同じOrdersの中で既に新規発行済み
        playerNo = newPlayerNoMap.get(String(shopifyId));
      } else {
        // 新規発行
        playerNo = String(playerNoCounter);
        newPlayerNoMap.set(String(shopifyId), playerNo);
        playerNoCounter++;
      }

      // Registrationレコードを生成
      const registration = {
        // Members由来のデータ（memberが見つからない場合は空白）
        name_ja: member ? `${member.fwj_lastname || ''} ${member.fwj_firstname || ''}`.trim() : '',
        name_ja_kana: member ? `${member.fwj_kanalastname || ''} ${member.fwj_kanafirstname || ''}`.trim() : '',
        first_name: member ? (member.first_name || '') : '',
        last_name: member ? (member.last_name || '') : '',
        phone: member ? (member.phone || '') : '',
        height: member ? (member.fwj_height || '') : '',
        weight: member ? (member.fwj_weight || '') : '',
        country: member ? (member.fwj_nationality || '') : '',
        age: age,

        // Orders由来のデータ
        fwj_card_no: shopifyId,
        email: order.email || '',
        class_name: className,
        back_stage_pass: order.back_stage_pass ?? 0,

        // player_no: 決定済みの値を設定
        player_no: playerNo,

        // 空白のフィールド
        sort_index: '',
        score_card: '',
        contest_order: '',
        occupation: '',
        instagram: '',
        biography: ''
      };

      newRegistrations.push(registration);

      // Memberが見つからなかった場合は記録
      if (!member) {
        memberNotFoundOrders.push({
          shopify_id: shopifyId,
          order_no: order.order_no || '',
          email: order.email || ''
        });
      }
    }

    if (newRegistrations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'インポート可能なデータがありませんでした'
      });
    }

    // class_nameでカスタムソート（2段階優先度ソート）
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

    // ソートキーを取得する関数
    function getCustomSortKey(className) {
      // カテゴリー優先度を取得（マッチしない場合は大きな値）
      let categoryIndex = CATEGORY_PRIORITY.length;
      for (let i = 0; i < CATEGORY_PRIORITY.length; i++) {
        if (className.includes(CATEGORY_PRIORITY[i])) {
          categoryIndex = i;
          break;
        }
      }

      // クラス優先度を取得（マッチしない場合は大きな値）
      let classIndex = CLASS_PRIORITY.length;
      for (let i = 0; i < CLASS_PRIORITY.length; i++) {
        if (className.includes(CLASS_PRIORITY[i])) {
          classIndex = i;
          break;
        }
      }

      return { categoryIndex, classIndex, className };
    }

    // 全データを2段階優先度ソート
    newRegistrations.sort((a, b) => {
      const keyA = getCustomSortKey(a.class_name || '');
      const keyB = getCustomSortKey(b.class_name || '');

      const aMatchesBoth = keyA.categoryIndex < CATEGORY_PRIORITY.length && keyA.classIndex < CLASS_PRIORITY.length;
      const bMatchesBoth = keyB.categoryIndex < CATEGORY_PRIORITY.length && keyB.classIndex < CLASS_PRIORITY.length;

      // マッチしたものを先に、マッチしないものを後に
      if (aMatchesBoth && !bMatchesBoth) return -1;
      if (!aMatchesBoth && bMatchesBoth) return 1;

      // 両方マッチした場合: カテゴリー優先度 → クラス優先度 → 辞書順
      if (aMatchesBoth && bMatchesBoth) {
        if (keyA.categoryIndex !== keyB.categoryIndex) {
          return keyA.categoryIndex - keyB.categoryIndex;
        }
        if (keyA.classIndex !== keyB.classIndex) {
          return keyA.classIndex - keyB.classIndex;
        }
      }

      // 同じ優先度、または両方マッチしない場合は辞書順
      return keyA.className.localeCompare(keyB.className, 'ja');
    });

    // 全データにsort_indexを付与（player_noは既に設定済み）
    newRegistrations.forEach((reg, index) => {
      // sort_index: 1から連番で振り直し
      reg.sort_index = String(index + 1);
    });

    // 新規データをbatchImportで追加
    const result = await registrationModel.batchImport(newRegistrations, contestDate, contestName);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    // 結果レスポンス
    const responseData = {
      total: ordersData.length,
      imported: result.data.imported,
      deleted: existingRegistrations.length,
      skipped: skippedOrders.length,
      memberNotFound: memberNotFoundOrders.length,
      contestDate,
      contestName,
      message: `${existingRegistrations.length}件を削除し、${result.data.imported}件をインポートしました`
    };

    // Memberが見つからなかったレコードがある場合は警告メッセージを追加
    if (memberNotFoundOrders.length > 0) {
      responseData.warnings = memberNotFoundOrders.map(o =>
        `shopify_id: ${o.shopify_id} (注文: ${o.order_no}, email: ${o.email}) - Memberが見つからないため、Members由来の項目は空白です`
      );
    }

    console.log(`Shopify import completed: deleted ${existingRegistrations.length}, imported ${result.data.imported}, skipped ${skippedOrders.length}, member not found ${memberNotFoundOrders.length}`);

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

    // バッチ更新用の配列を構築
    const updates = [];
    let skipped = 0;

    for (const row of csvData) {
      const id = row.id;
      if (!id) {
        skipped++;
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

    res.json({
      success: true,
      data: {
        totalRows: csvData.length,
        updated,
        skipped,
        fields: fields,
        message: `${updated}件を更新しました（${skipped}件スキップ）`
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