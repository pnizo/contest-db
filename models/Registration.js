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
          normalizedRow['email'] || '', // email (J列)
          normalizedRow['phone'] || '', // phone (K列)
          normalizedRow['npc_member_no'] || '', // npc_member_no (L列)
          normalizedRow['country'] || '', // country (M列)
          normalizedRow['age'] || '', // age (N列)
          normalizedRow['class_name'] || '', // class_name (O列)
          normalizedRow['class_code'] || '', // class_code (P列)
          normalizedRow['sort_index'] || '', // sort_index (Q列)
          normalizedRow['npc_member_status'] || normalizedRow['membership_status'] || '', // npc_member_status (R列)
          normalizedRow['score_card'] || '', // score_card (S列)
          normalizedRow['contest_order'] || '', // contest_order (T列)
          normalizedRow['backstage_pass'] || '', // backstage_pass (U列)
          normalizedRow['height'] || '', // height (V列)
          normalizedRow['weight'] || '', // weight (W列)
          normalizedRow['occupation'] || '', // occupation (X列)
          normalizedRow['instagram'] || '', // instagram (Y列)
          normalizedRow['biography'] || '', // biography (Z列)
          now, // createdAt (AA列)
          'TRUE', // isValid (AB列)
          '', // deletedAt (AC列)
          now, // updatedAt (AD列)
          '' // restoredAt (AE列)
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
          await this.getSheetsService().appendValues(`${this.sheetName}!A:AE`, batch);
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
}

module.exports = Registration;