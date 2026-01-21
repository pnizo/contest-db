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

  async batchImport(csvData, contestDate, contestName) {
    try {
      console.log('Starting batch import with sheet name:', this.sheetName);
      await this.ensureInitialized();

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
          normalizedRow['country'] || '', // country (L列)
          normalizedRow['age'] || '', // age (M列)
          normalizedRow['class_name'] || '', // class_name (N列)
          normalizedRow['sort_index'] || '', // sort_index (O列)
          normalizedRow['score_card'] || '', // score_card (P列)
          normalizedRow['contest_order'] || '', // contest_order (Q列)
          normalizedRow['height'] || '', // height (R列)
          normalizedRow['weight'] || '', // weight (S列)
          normalizedRow['occupation'] || '', // occupation (T列)
          normalizedRow['instagram'] || '', // instagram (U列)
          normalizedRow['biography'] || '', // biography (V列)
          now, // createdAt (W列)
          'TRUE', // isValid (X列)
          '', // deletedAt (Y列)
          now, // updatedAt (Z列)
          '' // restoredAt (AA列)
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
          await this.getSheetsService().appendValues(`${this.sheetName}!A:AA`, batch);
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
        'first_name', 'last_name',
        'email', 'phone', 'country', 'age',
        'class_name', 'sort_index', 'score_card', 'contest_order',
        'height', 'weight', 'occupation',
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
        record.email || '',
        record.phone || '',
        record.country || '',
        record.age || '',
        record.class_name || '',
        record.sort_index || '',
        record.score_card || '',
        record.contest_order || '',
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
        `${this.sheetName}!A${rowNumber}:AA${rowNumber}`,
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