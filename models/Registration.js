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

  validateHeaders(csvData) {
    if (!csvData || csvData.length === 0) {
      return { isValid: false, error: 'データが空です' };
    }

    // 全てのヘッダーが必須
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

  async batchImport(csvData, contestDate, contestName) {
    try {
      console.log('Starting batch import with sheet name:', this.sheetName);
      await this.ensureInitialized();

      // ヘッダー検証
      const headerValidation = this.validateHeaders(csvData);
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

      // CSVデータをスプレッドシート行形式に変換（バッチ処理でAPIリクエスト数を削減）
      const rows = csvData.map(row => {
        const now = new Date().toISOString();
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);

        // ヘッダーを小文字に変換してアクセス
        const normalizedRow = {};
        for (const key in row) {
          normalizedRow[key.toLowerCase()] = row[key];
        }

        return [
          id, // id (A列)
          contestDate, // contest_date (B列)
          contestName, // contest_name (C列)
          normalizedRow['athlete #'] || '', // player_no (D列)
          normalizedRow['氏名'] || '', // name_ja (E列)
          normalizedRow['シメイ'] || '', // name_ja_kana (F列)
          normalizedRow['npcj_no'] || '', // fwj_card_no (G列)
          normalizedRow['first name']?.trim() || '', // first_name (H列)
          normalizedRow['last name']?.trim() || '', // last_name (I列)
          normalizedRow['email address'] || '', // email (J列)
          normalizedRow['member number'] || '', // npc_member_no (K列)
          normalizedRow['country'] || '', // country (L列)
          normalizedRow['age'] || '', // age (M列)
          normalizedRow['class'] || '', // class (N列)
          normalizedRow['class code'] || '', // class_code (O列)
          normalizedRow['sort index'] || '', // sort_index (P列)
          normalizedRow['membership status'] || '', // npc_member_status (Q列)
          normalizedRow['class 2'] || '', // class_2 (R列)
          normalizedRow['score card'] || '', // score_card (S列)
          normalizedRow['開催順'] || '', // contest_order (T列)
          normalizedRow['backstage pass'] || '', // backstage_pass (U列)
          normalizedRow['height'] || '', // height (V列)
          normalizedRow['weight'] || '', // weight (W列)
          normalizedRow['occupation'] || '', // occupation (X列)
          normalizedRow['biography'] || '', // biography (Y列)
          now, // createdAt (Z列)
          'TRUE', // isValid (AA列)
          '', // deletedAt (AB列)
          now, // updatedAt (AC列)
          '' // restoredAt (AD列)
        ];
      });

      if (rows.length === 0) {
        return { success: false, error: 'インポートするデータがありません' };
      }

      // バッチサイズを制限してAPI制限を回避
      const batchSize = 100; // 一度に処理する行数を制限
      let imported = 0;
      const errors = [];

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        
        try {
          // レート制限を避けるため、バッチ間に遅延を追加
          if (i > 0) {
            console.log(`Waiting 2 seconds before next batch (processed ${i} rows)...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          console.log(`Processing batch ${Math.floor(i/batchSize) + 1}, rows ${i + 1}-${Math.min(i + batchSize, rows.length)}`);
          await this.getSheetsService().appendValues(`${this.sheetName}!A:AD`, batch);
          imported += batch.length;
          
        } catch (batchError) {
          console.error(`Error in batch ${Math.floor(i/batchSize) + 1}:`, batchError);
          errors.push(`Batch ${Math.floor(i/batchSize) + 1}: ${batchError.message}`);
          
          // レート制限エラーの場合はより長く待機
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