const express = require('express');
const Registration = require('../models/Registration');
const Subject = require('../models/Subject');
const Note = require('../models/Note');
const Member = require('../models/Member');
const { requireAuth, requireAdmin, checkAuth } = require('../middleware/auth');
const { parseFlexibleDate, formatToISODate, calculateAge } = require('../utils/dateUtils');
const wanakana = require('wanakana');
const router = express.Router();

const registrationModel = new Registration();
const subjectModel = new Subject();
const noteModel = new Note();
const memberModel = new Member();

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

// 4ファイルCSVインポート（認証済みユーザー）
router.post('/import-multi', requireAuth, async (req, res) => {
  try {
    console.log('=== MULTI-FILE IMPORT REQUEST START ===');
    const { filesData, contestDate, contestName } = req.body;

    // バリデーション: contest情報
    if (!contestDate || !contestName) {
      console.log('ERROR: Missing contest date or name');
      return res.status(400).json({ success: false, error: '大会開催日と大会名は必須です' });
    }

    // バリデーション: 4つのファイルすべてが必須
    if (!filesData || Object.keys(filesData).length === 0) {
      console.log('ERROR: No files provided');
      return res.status(400).json({ success: false, error: '4つのCSVファイルをすべて選択してください' });
    }

    const requiredFiles = ['registrations', 'athleteList', 'order', 'exceptions'];
    const missingFiles = requiredFiles.filter(file => !filesData[file]);

    if (missingFiles.length > 0) {
      const fileNames = {
        registrations: 'registrations.csv',
        athleteList: 'athlete_list.csv',
        order: 'order.csv',
        exceptions: 'exceptions.csv'
      };
      const missingFileNames = missingFiles.map(f => fileNames[f]).join(', ');
      console.log('ERROR: Missing required files:', missingFileNames);
      return res.status(400).json({
        success: false,
        error: `以下のファイルが不足しています: ${missingFileNames}`
      });
    }

    console.log('Files received:', Object.keys(filesData));

    // CSV解析ヘルパー関数
    const parseCSVLine = (line) => {
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
    };

    const parseCSVString = (csvString) => {
      const lines = csvString.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) {
        throw new Error('CSVファイルにデータがありません');
      }
      return lines.map(line => parseCSVLine(line));
    };

    const csvToObjects = (rawData) => {
      const headers = rawData[0].map(h => h.toString().toLowerCase().trim());
      const rows = rawData.slice(1);
      return rows.map(row => {
        const obj = {};
        headers.forEach((header, index) => {
          obj[header] = row[index] || '';
        });
        return obj;
      }).filter(row => Object.values(row).some(v => v && v.toString().trim() !== ''));
    };

    // 各CSVをパース
    let registrationsData = [];
    let athleteListData = [];
    let orderData = [];
    let exceptionsData = [];

    try {
      if (filesData.registrations) {
        const rawData = parseCSVString(filesData.registrations);
        registrationsData = csvToObjects(rawData);
        console.log(`Parsed Registrations.csv: ${registrationsData.length} rows`);
      }

      if (filesData.athleteList) {
        const rawData = parseCSVString(filesData.athleteList);
        athleteListData = csvToObjects(rawData);
        console.log(`Parsed athlete_list.csv: ${athleteListData.length} rows`);
      }

      if (filesData.order) {
        const rawData = parseCSVString(filesData.order);
        orderData = csvToObjects(rawData);
        console.log(`Parsed order.csv: ${orderData.length} rows`);
      }

      if (filesData.exceptions) {
        const rawData = parseCSVString(filesData.exceptions);
        exceptionsData = csvToObjects(rawData);
        console.log(`Parsed exceptions.csv: ${exceptionsData.length} rows`);
      }
    } catch (parseError) {
      console.error('CSV parsing error:', parseError);
      return res.status(400).json({ success: false, error: `CSV解析エラー: ${parseError.message}` });
    }

    // データマージ処理
    console.log('Merging CSV data...');
    console.log(`DEBUG: registrationsData.length = ${registrationsData.length}`);
    console.log(`DEBUG: athleteListData.length = ${athleteListData.length}`);
    const allRecords = []; // 配列を使用して重複を許可
    const errors = [];

    // Step 1: Registrations.csvから基本レコード作成（必須）
    // 重複を許可するため、全ての行をそのまま追加
    console.log('Creating base records from Registrations.csv...');
    registrationsData.forEach((reg, index) => {
      const athleteNo = reg['athlete #'];
      if (!athleteNo) {
        console.warn(`Registrations.csv row ${index + 2}: Missing Athlete #`);
        return;
      }

      allRecords.push({
        player_no: athleteNo, // Athlete #をそのままplayer_noに使用
        first_name: reg['first name'] || '',
        last_name: reg['last name'] || '',
        email: reg['email address'] || '',
        npc_member_no: reg['member number'] || '',
        country: reg['country'] || '',
        age: reg['age'] || '',
        class_name: reg['class'] || '',
        class_code: reg['class code'] || '',
        class_regulation: '',
        sort_index: reg['sort index'] || '',
        phone: '',
        backstage_pass: '',
        height: '',
        weight: '',
        occupation: '',
        instagram: '',
        biography: '',
        npc_member_status: '',
        score_card: '',
        contest_order: ''
      });
    });

    // Step 2: athlete_list.csvから詳細情報をマージ（同じAthlete #の全レコードに適用）
    athleteListData.forEach((athlete, index) => {
      const athleteNo = athlete['athlete #'];
      if (!athleteNo) {
        console.warn(`athlete_list.csv row ${index + 2}: Missing Athlete #`);
        return;
      }

      // 同じAthlete #を持つ全てのレコードを検索
      const matchingRecords = allRecords.filter(record => record.player_no === athleteNo);

      if (matchingRecords.length === 0) {
        console.warn(`Warning: Athlete ${athleteNo} not found in existing registrations, skipping`);
        return; // 既存レコードがない場合はスキップ
      }

      // Backstage Pass処理
      const pass1 = athlete['1 backstage pass']?.toUpperCase() === 'Y';
      const pass2 = athlete['2 backstage passes']?.toUpperCase() === 'Y';

      if (pass1 && pass2) {
        const errorMsg = `選手 ${athleteNo}: バックステージパスが両方Yになっています`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }

      // 同じAthlete #を持つ全てのレコードに情報をマージ
      matchingRecords.forEach(record => {
        if (pass1) {
          record.backstage_pass = '1';
        } else if (pass2) {
          record.backstage_pass = '2';
        }

        // 既存の値がある場合は上書きしない、空の場合のみ更新
        if (athlete['phone number']) record.phone = athlete['phone number'];
        if (athlete['height']) record.height = athlete['height'];
        if (athlete['weight']) record.weight = athlete['weight'];
        if (athlete['occupation']) record.occupation = athlete['occupation'];
        if (athlete['instagram']) record.instagram = athlete['instagram'];
        if (athlete['biography']) record.biography = athlete['biography'];
      });
    });

    // Backstage Passエラーがあれば中断
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join('\n') });
    }

    // Step 3: order.csvからclass_regulation, score_card, contest_orderをマージ
    const orderMap = new Map();
    orderData.forEach(o => {
      orderMap.set(o['class_code'], {
        class_regulation: o['class_regulation'] || '',
        score_card: o['score_card'] || '',
        contest_order: o['contest_order'] || ''
      });
    });

    allRecords.forEach((record) => {
      const orderInfo = orderMap.get(record.class_code);
      if (orderInfo) {
        record.class_regulation = orderInfo.class_regulation;
        record.score_card = orderInfo.score_card;
        record.contest_order = orderInfo.contest_order;
      }
    });

    // Step 4: exceptions.csvからmember_numberとstatusを優先上書き（同じAthlete #の全レコードに適用）
    exceptionsData.forEach((exc) => {
      const athleteNo = exc['athlete #'];
      if (!athleteNo) {
        console.warn(`exceptions.csv: Missing Athlete #`);
        return;
      }

      // 同じAthlete #を持つ全てのレコードを検索
      const matchingRecords = allRecords.filter(record => record.player_no === athleteNo);

      if (matchingRecords.length === 0) {
        console.warn(`Warning: Athlete ${athleteNo} not found in existing registrations, skipping`);
        return; // 既存レコードがない場合はスキップ
      }

      // 同じAthlete #を持つ全てのレコードに情報を適用
      matchingRecords.forEach(record => {
        // 既存レコードを優先上書き
        if (exc['member number']) {
          record.npc_member_no = exc['member number'];
        }
        if (exc['membership status']) {
          record.npc_member_status = exc['membership status'];
        }

        // オプション上書き
        if (exc['country']) record.country = exc['country'];
        if (exc['phone number']) record.phone = exc['phone number'];
      });
    });

    // Step 5: Membersシートから日本語名を補完
    console.log('Fetching Members data for enrichment...');
    try {
      const allMembers = await memberModel.findAll();
      console.log(`Found ${allMembers.length} members in Members sheet`);

      const membersByEmail = new Map();
      allMembers.forEach(member => {
        if (member.email && member.email.trim()) {
          const emailKey = member.email.toLowerCase().trim();
          membersByEmail.set(emailKey, member);
        }
      });

      let enrichedCount = 0;
      allRecords.forEach(record => {
        if (record.email && record.email.trim()) {
          const emailKey = record.email.toLowerCase().trim();
          const member = membersByEmail.get(emailKey);

          if (member) {
            if (member.shopify_id && member.shopify_id.trim()) {
              record.fwj_card_no = member.shopify_id.trim();
            }

            const memberFwjLastName = member.fwj_lastname ? member.fwj_lastname.trim() : '';
            const memberFwjFirstName = member.fwj_firstname ? member.fwj_firstname.trim() : '';
            if (memberFwjLastName || memberFwjFirstName) {
              record.name_ja = `${memberFwjLastName} ${memberFwjFirstName}`.trim();
            }

            const memberFwjLastNameKana = member.fwj_kanalastname ? member.fwj_kanalastname.trim() : '';
            const memberFwjFirstNameKana = member.fwj_kanafirstname ? member.fwj_kanafirstname.trim() : '';
            if (memberFwjLastNameKana || memberFwjFirstNameKana) {
              record.name_ja_kana = `${memberFwjLastNameKana} ${memberFwjFirstNameKana}`.trim();
            }

            enrichedCount++;
          }
        }

        // name_ja_kanaが未設定の場合、WanaKanaで生成
        if (!record.name_ja_kana || record.name_ja_kana.trim() === '') {
          const csvLastName = record.last_name ? record.last_name.trim() : '';
          const csvFirstName = record.first_name ? record.first_name.trim() : '';
          if (csvLastName || csvFirstName) {
            const lastNameKana = csvLastName ? wanakana.toKatakana(csvLastName) : '';
            const firstNameKana = csvFirstName ? wanakana.toKatakana(csvFirstName) : '';
            if (lastNameKana || firstNameKana) {
              record.name_ja_kana = `${lastNameKana} ${firstNameKana}`.trim();
            }
          }
        }
      });

      console.log(`Enriched ${enrichedCount} records with Members data`);
    } catch (memberError) {
      console.error('Error fetching Members data:', memberError);
      console.log('Continuing import without Members enrichment');
    }

    // 配列をそのまま使用（重複を含む全てのレコード）
    const mergedData = allRecords;
    console.log(`Total merged records: ${mergedData.length}`);

    if (mergedData.length === 0) {
      return res.status(400).json({ success: false, error: 'インポート可能なデータがありません' });
    }

    // バッチインポート実行
    console.log('Starting batch import...');
    const result = await registrationModel.batchImport(mergedData, contestDate, contestName, 'multi');
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

    // contest_dateを取得（最初のレコードから）
    const contestDate = targetRegistrations.length > 0 ? targetRegistrations[0].contest_date : '';

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

    // ファイル名: (contest_date)_(contest_name)_(用途名).csv
    const sanitizedContestName = contestName.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_');
    const filename = contestDate
      ? `${contestDate}_${sanitizedContestName}_メール配信用.csv`
      : `${sanitizedContestName}_メール配信用.csv`;

    res.json({
      success: true,
      data: csvData,
      filename
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
          'Weight': reg.weight || '',
          'Member Number': reg.npc_member_no || '',
          'payment': reg.npc_member_status || ''
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
      'fixed_first_name': reg.fixed_first_name || '',
      'fixed_last_name': reg.fixed_last_name || '',
      'email': reg.email || '',
      'phone': reg.phone || '',
      'npc_member_no': reg.npc_member_no || '',
      'country': reg.country || '',
      'age': reg.age || '',
      'class_name': reg.class_name || '',
      'class_regulation': reg.class_regulation || '',
      'class_code': reg.class_code || '',
      'sort_index': reg.sort_index || '',
      'npc_member_status': reg.npc_member_status || '',
      'score_card': reg.score_card || '',
      'contest_order': reg.contest_order || '',
      'backstage_pass': reg.backstage_pass || '',
      'height': reg.height || '',
      'weight': reg.weight || '',
      'occupation': reg.occupation || '',
      'instagram': reg.instagram || '',
      'biography': reg.biography || '',
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

module.exports = router;