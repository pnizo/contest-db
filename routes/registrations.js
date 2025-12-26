const express = require('express');
const Registration = require('../models/Registration');
const Subject = require('../models/Subject');
const Note = require('../models/Note');
const Member = require('../models/Member');
const { requireAuth, requireAdmin, checkAuth } = require('../middleware/auth');
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

// ファイルインポート（Muscleware CSV専用、認証済みユーザー）
router.post('/import', requireAuth, async (req, res) => {
  try {
    console.log('=== IMPORT REQUEST START ===');
    const { fileData, fileType, fileFormat, contestDate, contestName } = req.body;
    console.log('Import request:', {
      fileType,
      fileFormat,
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

    // まずファイルを2D配列にパース
    let rawData = [];

    if (fileType === 'csv') {
      console.log('Processing CSV file...');
      // CSVファイルの処理
      if (typeof fileData !== 'string') {
        console.log('ERROR: CSV data is not a string');
        return res.status(400).json({ success: false, error: 'CSVデータが無効です' });
      }

      // CSVテキストを行に分割
      const lines = fileData.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) {
        console.log('ERROR: CSV has insufficient data');
        return res.status(400).json({ success: false, error: 'CSVファイルにデータがありません' });
      }

      // CSVパース（簡易版 - 引用符対応）
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

      rawData = lines.map(line => parseCSVLine(line));
      console.log('CSV parsed to 2D array, rows:', rawData.length);
    } else {
      console.log('ERROR: Unsupported file type');
      return res.status(400).json({ success: false, error: 'CSV形式のみサポートしています' });
    }

    // CSVデータの処理
    if (rawData.length === 0) {
      console.log('ERROR: No data to process');
      return res.status(400).json({ success: false, error: 'データがありません' });
    }

    let headers = rawData[0];
    const rows = rawData.slice(1);
    console.log('Original Headers:', headers);
    console.log('Data rows:', rows.length);

    // ヘッダーを正規化（小文字化）して、形式別の読み替えを行う
    headers = headers.map(header => {
      if (!header) return '';
      const normalizedHeader = header.toString().toLowerCase().trim();

      if (fileFormat === 'muscleware') {
        // Muscleware形式のヘッダーマッピング
        const musclewareMapping = {
          // 基本情報
          'register date': 'register_date',
          'register time': 'register_time',
          'first name': 'first_name',
          'last name': 'last_name',
          'dob': 'date_of_birth',
          'email': 'email',
          'phone': 'phone',
          'member #': 'npc_member_no',
          'country': 'country',

          // クラス情報
          'class name': 'class_name',
          'class code': 'class_code',

          // バックステージパス
          '1 backstage pass (add-on)': 'backstage_pass_1',
          '2 backstage passes (add-on)': 'backstage_pass_2',

          // カスタムフィールド
          'height (cm) (custom)': 'height',
          'weight (kg) (custom)': 'weight',
          'occupation (custom)': 'occupation',
          'instagram (custom)': 'instagram',
          'biography (custom)': 'biography'
        };
        return musclewareMapping[normalizedHeader] || normalizedHeader;
      } else {
        // Standard形式 - 既存のロジック
        if (normalizedHeader === 'fwjカード') {
          console.log('Mapping "FWJカード" to "npcj_no"');
          return 'npcj_no';
        }
        return normalizedHeader;
      }
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

    // Muscleware形式固有の変換処理
    if (fileFormat === 'muscleware') {
      console.log('Applying Muscleware-specific transformations...');

      const errors = [];
      parsedData = parsedData.map((row, index) => {
        // Backstage Pass ロジック
        const pass1 = row.backstage_pass_1 && row.backstage_pass_1.toString().trim().toUpperCase();
        const pass2 = row.backstage_pass_2 && row.backstage_pass_2.toString().trim().toUpperCase();

        const hasPass1 = pass1 === 'Y';
        const hasPass2 = pass2 === 'Y';

        if (hasPass1 && hasPass2) {
          // 両方Yの場合はエラー
          const errorMsg = `Row ${index + 2}: Both backstage passes are set to Y`;
          console.error(errorMsg);
          errors.push(errorMsg);
          row['backstage_pass'] = '';
        } else if (hasPass1) {
          // 1 Backstage Pass のみYの場合
          row['backstage_pass'] = '1';
        } else if (hasPass2) {
          // 2 Backstage Passes のみYの場合
          row['backstage_pass'] = '2';
        } else {
          // 両方空白の場合
          row['backstage_pass'] = '';
        }

        return row;
      });

      if (errors.length > 0) {
        console.error('Backstage pass validation errors:', errors);
        return res.status(400).json({
          success: false,
          error: 'Backstage Passのエラーがあります:\n' + errors.join('\n')
        });
      }

      console.log('Muscleware transformations applied');
    }

    if (parsedData.length === 0) {
      console.log('ERROR: Parsed data is empty');
      return res.status(400).json({ success: false, error: 'データが空です' });
    }

    // Membersシートからデータを取得してemailで補完
    console.log('Fetching Members data for enrichment...');
    try {
      const allMembers = await memberModel.findAll();
      console.log(`Found ${allMembers.length} members in Members sheet`);

      // emailをキーにしたMapを作成（高速検索用）
      const membersByEmail = new Map();
      allMembers.forEach(member => {
        if (member.email && member.email.trim()) {
          const emailKey = member.email.toLowerCase().trim();
          membersByEmail.set(emailKey, member);
        }
      });

      // 各レコードをMembersデータで補完
      let enrichedCount = 0;
      parsedData.forEach(record => {
        if (record.email && record.email.trim()) {
          const emailKey = record.email.toLowerCase().trim();
          const member = membersByEmail.get(emailKey);

          if (member) {
            // Membersのshopify_idをfwj_card_noにセット
            if (member.shopify_id && member.shopify_id.trim()) {
              record.fwj_card_no = member.shopify_id.trim();
            }

            // Membersのfwj_lastnameとfwj_firstnameを連結してname_jaにセット
            const memberFwjLastName = member.fwj_lastname ? member.fwj_lastname.trim() : '';
            const memberFwjFirstName = member.fwj_firstname ? member.fwj_firstname.trim() : '';
            if (memberFwjLastName || memberFwjFirstName) {
              record.name_ja = `${memberFwjLastName} ${memberFwjFirstName}`.trim();
            }

            // Membersのfwj_lastname_kanaとfwj_firstname_kanaを連結してname_ja_kanaにセット
            const memberFwjLastNameKana = member.fwj_lastname_kana ? member.fwj_lastname_kana.trim() : '';
            const memberFwjFirstNameKana = member.fwj_firstname_kana ? member.fwj_firstname_kana.trim() : '';
            if (memberFwjLastNameKana || memberFwjFirstNameKana) {
              record.name_ja_kana = `${memberFwjLastNameKana} ${memberFwjFirstNameKana}`.trim();
            }

            enrichedCount++;
          }
        }

        // name_ja_kanaが未設定の場合、MusclewareのCSVのfirst_nameとlast_nameからWanaKanaで生成
        if (!record.name_ja_kana || record.name_ja_kana.trim() === '') {
          const csvLastName = record.last_name ? record.last_name.trim() : '';
          const csvFirstName = record.first_name ? record.first_name.trim() : '';
          if (csvLastName || csvFirstName) {
            // WanaKanaを使ってローマ字からカタカナに変換
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
      // Members取得エラーは警告のみで処理を続行
      console.log('Continuing import without Members enrichment');
    }

    // ゼッケン番号(player_no)を自動採番
    console.log('Assigning player numbers...');
    try {
      // 1. register_dateとregister_timeでソート
      const sortedData = [...parsedData].sort((a, b) => {
        const dateA = a.register_date || '';
        const dateB = b.register_date || '';
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }
        const timeA = a.register_time || '';
        const timeB = b.register_time || '';
        return timeA.localeCompare(timeB);
      });

      // 2. emailごとに最も早い登録順で番号を割り当て
      const emailToPlayerNo = new Map();
      let nextPlayerNo = 1;

      sortedData.forEach(record => {
        const email = record.email ? record.email.toLowerCase().trim() : '';

        if (email) {
          // emailがある場合：同じemailには同じ番号を割り当て
          if (!emailToPlayerNo.has(email)) {
            emailToPlayerNo.set(email, nextPlayerNo);
            nextPlayerNo++;
          }
        }
        // emailが無い場合は後で個別に処理
      });

      // 3. 元のparsedDataの各レコードにplayer_noを設定
      parsedData.forEach(record => {
        const email = record.email ? record.email.toLowerCase().trim() : '';

        if (email && emailToPlayerNo.has(email)) {
          // emailがあり、既に番号が割り当てられている
          record.player_no = String(emailToPlayerNo.get(email));
        } else {
          // emailが無いレコードには個別に新しい番号を割り当て
          record.player_no = String(nextPlayerNo);
          nextPlayerNo++;
        }
      });

      console.log(`Assigned player numbers to ${parsedData.length} records (unique players: ${emailToPlayerNo.size})`);
    } catch (playerNoError) {
      console.error('Error assigning player numbers:', playerNoError);
      // エラーが発生しても処理を続行（player_noは空のまま）
      console.log('Continuing import without player number assignment');
    }

    console.log('Starting batch import...');
    // バッチインポートを実行
    const result = await registrationModel.batchImport(parsedData, contestDate, contestName, fileFormat);
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