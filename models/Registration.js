const BaseModel = require('./BaseModel');

class Registration extends BaseModel {
  constructor() {
    super('Registrations');
  }

  async findByContestAndDate(contestName, contestDate) {
    const all = await this.findAll();
    return all.filter(registration => 
      registration.contest_name === contestName && 
      registration.contest_date === contestDate
    );
  }

  async findByFwjCard(fwjCard) {
    const all = await this.findAll();
    return all.filter(registration => registration.fwj_card === fwjCard);
  }

  async findByClass(className) {
    const all = await this.findAll();
    return all.filter(registration => 
      registration.class && 
      registration.class.toLowerCase().includes(className.toLowerCase())
    );
  }

  async validateRegistration(registrationData) {
    const errors = [];
    
    // 必須フィールドの検証
    if (!registrationData.contest_date) {
      errors.push('大会開催日は必須です');
    } else {
      const date = new Date(registrationData.contest_date);
      if (isNaN(date.getTime())) {
        errors.push('有効な大会開催日を入力してください');
      }
    }

    if (!registrationData.contest_name || registrationData.contest_name.trim() === '') {
      errors.push('大会名は必須です');
    }

    if (!registrationData.athlete_number) {
      errors.push('Athlete #は必須です');
    }

    if (!registrationData.name || registrationData.name.trim() === '') {
      errors.push('氏名は必須です');
    }

    if (!registrationData.fwj_card_no) {
      errors.push('FWJカードは必須です');
    }

    // IDの生成
    if (!registrationData.id) {
      registrationData.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }
    
    registrationData.createdAt = registrationData.createdAt || new Date().toISOString();
    registrationData.isValid = registrationData.isValid || 'TRUE';
    registrationData.updatedAt = registrationData.updatedAt || new Date().toISOString();
    registrationData.deletedAt = registrationData.deletedAt || '';
    registrationData.restoredAt = registrationData.restoredAt || '';
    
    return { isValid: errors.length === 0, errors, registrationData };
  }

  async createRegistration(registrationData) {
    const validation = await this.validateRegistration(registrationData);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    return await this.create(validation.registrationData);
  }

  async softDelete(id) {
    const registration = await this.findById(id);
    if (!registration) {
      return { success: false, error: '登録データが見つかりません' };
    }

    if (registration.isValid === 'FALSE') {
      return { success: false, error: '登録データは既に削除されています' };
    }

    const updateData = {
      isValid: 'FALSE',
      deletedAt: new Date().toISOString()
    };

    return await this.update(id, updateData);
  }

  validateHeaders(csvData, fileFormat = 'standard') {
    if (!csvData || csvData.length === 0) {
      return { isValid: false, error: 'データが空です' };
    }

    // Muscleware形式の場合は厳密な検証をスキップ
    if (fileFormat === 'muscleware') {
      return {
        isValid: true,
        warnings: ['Muscleware形式: 一部のフィールドは空になります']
      };
    }

    // Standard形式 - 全てのヘッダーが必須
    const requiredHeaders = [
      'Athlete #',
      '氏名',
      'シメイ',
      'npcj_no',
      'First Name',
      'Last Name',
      'Email Address',
      'Member Number',
      'Country',
      'Age',
      'Class',
      'Class Code',
      'Sort Index',
      'Membership Status',
      'Class 2',
      'Score Card',
      '開催順',
      'Backstage Pass',
      'Height',
      'Weight',
      'Occupation',
      'Biography'
    ];

    // 最初の行からヘッダーを取得
    const firstRow = csvData[0];
    const headers = Object.keys(firstRow);

    console.log('CSV headers found:', headers);
    console.log('Required headers:', requiredHeaders);

    // 必須ヘッダーの検証
    const missingRequired = requiredHeaders.filter(required =>
      !headers.find(header => header.trim().toLowerCase() === required.trim().toLowerCase())
    );

    if (missingRequired.length > 0) {
      return {
        isValid: false,
        error: `必須ヘッダーが不足しています: ${missingRequired.join(', ')}\n\n期待される全ヘッダー:\n${requiredHeaders.join(', ')}\n\n見つかったヘッダー:\n${headers.join(', ')}`
      };
    }

    return {
      isValid: true,
      warnings: []
    };
  }

  async batchImport(csvData, contestDate, contestName, fileFormat = 'standard') {
    try {
      console.log('Starting batch import with sheet name:', this.sheetName);
      await this.ensureInitialized();

      // ヘッダー検証（multiフォーマットの場合はスキップ）
      if (fileFormat !== 'multi') {
        const headerValidation = this.validateHeaders(csvData, fileFormat);
        if (!headerValidation.isValid) {
          return {
            success: false,
            error: headerValidation.error
          };
        }

        // 警告がある場合はログに出力
        if (headerValidation.warnings && headerValidation.warnings.length > 0) {
          console.log('Header warnings:', headerValidation.warnings);
        }
      }

      // CSVデータをスプレッドシート行形式に変換（バッチ処理でAPIリクエスト数を削減）
      const rows = csvData.map(row => {
        const now = new Date().toISOString();
        // 既存IDがあればそれを使用、なければ新規生成
        const id = row.id || (Date.now().toString() + Math.random().toString(36).substr(2, 9));

        // ヘッダーを小文字に変換してアクセス
        const normalizedRow = {};
        for (const key in row) {
          normalizedRow[key.toLowerCase()] = row[key];
        }

        return [
          id, // id (A列)
          contestDate, // contest_date (B列)
          contestName, // contest_name (C列)
          normalizedRow['player_no'] || '', // player_no (D列)
          normalizedRow['name_ja'] || '', // name_ja (E列)
          normalizedRow['name_ja_kana'] || '', // name_ja_kana (F列)
          normalizedRow['fwj_card_no'] || '', // fwj_card_no (G列)
          normalizedRow['first_name']?.trim() || '', // first_name (H列)
          normalizedRow['last_name']?.trim() || '', // last_name (I列)
          normalizedRow['fixed_first_name']?.trim() || '', // fixed_first_name (J列)
          normalizedRow['fixed_last_name']?.trim() || '', // fixed_last_name (K列)
          normalizedRow['email'] || '', // email (L列)
          normalizedRow['phone'] || '', // phone (M列)
          normalizedRow['npc_member_no'] || '', // npc_member_no (N列)
          normalizedRow['country'] || '', // country (O列)
          normalizedRow['age'] || '', // age (P列)
          normalizedRow['class_name'] || '', // class_name (Q列)
          normalizedRow['class_regulation'] || '', // class_regulation (R列)
          normalizedRow['class_code'] || '', // class_code (S列)
          normalizedRow['sort_index'] || '', // sort_index (T列)
          normalizedRow['npc_member_status'] || normalizedRow['membership_status'] || '', // npc_member_status (U列)
          normalizedRow['score_card'] || '', // score_card (V列)
          normalizedRow['contest_order'] || '', // contest_order (W列)
          normalizedRow['backstage_pass'] || '', // backstage_pass (X列)
          normalizedRow['height'] || '', // height (Y列)
          normalizedRow['weight'] || '', // weight (Z列)
          normalizedRow['occupation'] || '', // occupation (AA列)
          normalizedRow['instagram'] || '', // instagram (AB列)
          normalizedRow['biography'] || '', // biography (AC列)
          now, // createdAt (AD列)
          'TRUE', // isValid (AE列)
          '', // deletedAt (AF列)
          now, // updatedAt (AG列)
          '' // restoredAt (AH列)
        ];
      });

      if (rows.length === 0) {
        return { success: false, error: 'インポートするデータがありません' };
      }

      console.log(`Appending ${rows.length} new records to sheet`);

      // バッチサイズを制限してAPI制限を回避
      const batchSize = 100;
      let imported = 0;
      const errors = [];

      // 全レコードを新規追加
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);

        try {
          if (i > 0) {
            console.log(`Waiting 2 seconds before next batch (processed ${i} rows)...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }

          console.log(`Processing batch ${Math.floor(i/batchSize) + 1}, rows ${i + 1}-${Math.min(i + batchSize, rows.length)}`);
          await this.getSheetsService().appendValues(`${this.sheetName}!A:AH`, batch);
          imported += batch.length;

        } catch (batchError) {
          console.error(`Error in batch ${Math.floor(i/batchSize) + 1}:`, batchError);
          errors.push(`Batch ${Math.floor(i/batchSize) + 1}: ${batchError.message}`);

          if (batchError.status === 429) {
            console.log('Rate limit hit, waiting 10 seconds...');
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
        }
      }

      return {
        success: true,
        data: {
          total: csvData.length,
          imported: imported,
          contestDate: contestDate,
          contestName: contestName,
          errors: errors.length > 0 ? errors : undefined
        }
      };

    } catch (error) {
      console.error('Registration batch import error:', error);
      return { success: false, error: error.message };
    }
  }

  async getById(id) {
    try {
      const allRecords = await this.findAll();
      const record = allRecords.find(r => r.id === id);

      if (!record) {
        return { success: false, error: 'レコードが見つかりません' };
      }

      return { success: true, data: record };
    } catch (error) {
      console.error('Get by ID error:', error);
      return { success: false, error: error.message };
    }
  }

  async update(id, updateData) {
    try {
      const allRecords = await this.findAll();
      const recordIndex = allRecords.findIndex(r => r.id === id);

      if (recordIndex === -1) {
        return { success: false, error: 'レコードが見つかりません' };
      }

      const record = allRecords[recordIndex];

      // 更新可能なフィールド
      const updatableFields = [
        'player_no', 'name_ja', 'name_ja_kana', 'fwj_card_no',
        'first_name', 'last_name', 'fixed_first_name', 'fixed_last_name',
        'email', 'phone', 'npc_member_no', 'country', 'age',
        'class_name', 'class_code', 'class_regulation', 'sort_index',
        'npc_member_status', 'score_card', 'contest_order',
        'backstage_pass', 'height', 'weight', 'occupation',
        'instagram', 'biography'
      ];

      // フィールドを更新
      updatableFields.forEach(field => {
        if (updateData.hasOwnProperty(field)) {
          record[field] = updateData[field];
        }
      });

      // updatedAtを更新
      record.updatedAt = new Date().toISOString();

      // Google Sheetsに書き込み
      const rowNumber = recordIndex + 2; // ヘッダー行を考慮
      const values = [[
        record.id,
        record.contest_date,
        record.contest_name,
        record.player_no || '',
        record.name_ja || '',
        record.name_ja_kana || '',
        record.fwj_card_no || '',
        record.first_name || '',
        record.last_name || '',
        record.fixed_first_name || '',
        record.fixed_last_name || '',
        record.email || '',
        record.phone || '',
        record.npc_member_no || '',
        record.country || '',
        record.age || '',
        record.class_name || '',
        record.class_regulation || '',
        record.class_code || '',
        record.sort_index || '',
        record.npc_member_status || '',
        record.score_card || '',
        record.contest_order || '',
        record.backstage_pass || '',
        record.height || '',
        record.weight || '',
        record.occupation || '',
        record.instagram || '',
        record.biography || '',
        record.createdAt,
        record.isValid,
        record.deletedAt || '',
        record.updatedAt,
        record.restoredAt || ''
      ]];

      await this.getSheetsService().updateValues(
        `${this.sheetName}!A${rowNumber}:AH${rowNumber}`,
        values
      );

      return { success: true, data: record };
    } catch (error) {
      console.error('Update error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = Registration;