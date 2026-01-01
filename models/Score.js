const BaseModel = require('./BaseModel');

class Score extends BaseModel {
  constructor() { 
    super('Scores');
  }

  async findByFwjNo(fwjNo) {
    const all = await this.findAll();
    return all.filter(score => score.fwj_card_no === fwjNo);
  }

  async findByContest(contestName) {
    const all = await this.findAll();
    return all.filter(score => 
      score.contest_name && 
      score.contest_name.toLowerCase().includes(contestName.toLowerCase())
    );
  }

  async findByCategory(categoryName) {
    const all = await this.findAll();
    return all.filter(score => 
      score.category_name && 
      score.category_name.toLowerCase().includes(categoryName.toLowerCase())
    );
  }

  async findByPlayerName(playerName) {
    const all = await this.findAll();
    return all.filter(score => 
      score.player_name && 
      score.player_name.toLowerCase().includes(playerName.toLowerCase())
    );
  }

  async findByDateRange(startDate, endDate) {
    const all = await this.findAll();
    return all.filter(score => {
      if (!score.contest_date) return false;
      const scoreDate = new Date(score.contest_date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return scoreDate >= start && scoreDate <= end;
    });
  }

  // 複合キーでの検索
  async findByCompositeKey(fwjNo, contestDate, contestName, categoryName) {
    const all = await this.findAllIncludingDeleted();
    return all.find(score => 
      score.fwj_card_no === fwjNo &&
      score.contest_date === contestDate &&
      score.contest_name === contestName &&
      score.category_name === categoryName
    );
  }

  async validateScore(scoreData) {
    const errors = [];
    
    // 複合キーの検証
    if (!scoreData.fwj_card_no || scoreData.fwj_card_no.trim() === '') {
      errors.push('FWJカード番号は必須です');
    }
    
    if (!scoreData.contest_name || scoreData.contest_name.trim() === '') {
      errors.push('大会名は必須です');
    }
    
    if (!scoreData.category_name || scoreData.category_name.trim() === '') {
      errors.push('カテゴリー名は必須です');
    }
    
    if (!scoreData.contest_date) {
      errors.push('開催日は必須です');
    } else {
      const date = new Date(scoreData.contest_date);
      if (isNaN(date.getTime())) {
        errors.push('有効な開催日を入力してください');
      }
    }

    // 順位関連の検証
    if (scoreData.placing !== undefined && scoreData.placing !== '') {
      const placing = parseInt(scoreData.placing);
      if (isNaN(placing) || placing < 1) {
        errors.push('順位は1以上の整数である必要があります');
      }
    }

    
    if (!scoreData.id) {
      scoreData.id = Date.now().toString();
    }
    
    scoreData.createdAt = scoreData.createdAt || new Date().toISOString();
    scoreData.isValid = scoreData.isValid || 'TRUE';
    scoreData.updatedAt = scoreData.updatedAt || new Date().toISOString();
    scoreData.deletedAt = scoreData.deletedAt || '';
    scoreData.restoredAt = scoreData.restoredAt || '';
    
    return { isValid: errors.length === 0, errors, scoreData };
  }

  async createScore(scoreData) {
    // CSVのnpcj_noをfwj_card_noにマッピング
    if (scoreData.npcj_no && !scoreData.fwj_card_no) {
      scoreData.fwj_card_no = scoreData.npcj_no;
      delete scoreData.npcj_no;
    }
    
    const validation = await this.validateScore(scoreData);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    // 複合キーで削除済みデータを検索
    const existingDeletedScore = await this.findByCompositeKey(
      validation.scoreData.fwj_card_no,
      validation.scoreData.contest_date,
      validation.scoreData.contest_name,
      validation.scoreData.category_name
    );

    if (existingDeletedScore && existingDeletedScore.isValid === 'FALSE') {
      // 削除済みデータを復元
      validation.scoreData.id = existingDeletedScore.id;
      validation.scoreData.isValid = 'TRUE';
      validation.scoreData.updatedAt = new Date().toISOString();
      validation.scoreData.restoredAt = new Date().toISOString();
      
      const result = await this.update(existingDeletedScore.id, validation.scoreData);
      if (result.success) {
        return { success: true, data: result.data, restored: true };
      }
      return result;
    }

    return await this.create(validation.scoreData);
  }

  async softDelete(id) {
    const score = await this.findById(id);
    if (!score) {
      return { success: false, error: '成績が見つかりません' };
    }

    if (score.isValid === 'FALSE') {
      return { success: false, error: '成績は既に削除されています' };
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

    // 全てのヘッダーが必須（FWJ移行対応でfwj_card_noを標準とする）
    const requiredHeaders = [
      'fwj_card_no',
      'contest_date',
      'contest_name', 
      'contest_place',
      'category_name',
      'placing',
      'player_no',
      'player_name'
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

    // NPCJ番号からFWJ番号への移行対応
    if (missingRequired.includes('fwj_card_no')) {
      // fwj_card_noが見つからない場合、npcj_noで代替可能かチェック
      const hasFwjNo = headers.some(header => header.trim() === 'npcj_no');
      if (hasFwjNo) {
        // npcj_noがある場合は、fwj_card_noの不足をリストから除外
        const index = missingRequired.indexOf('fwj_card_no');
        missingRequired.splice(index, 1);
        console.log('Using npcj_no as substitute for fwj_card_no');
      }
    }

    if (missingRequired.length > 0) {
      return {
        isValid: false,
        error: `必須ヘッダーが不足しています: ${missingRequired.join(', ')}\n\n期待される全ヘッダー:\n${requiredHeaders.join(', ')} (npcj_noをfwj_card_noの代替として使用可能)\n\n見つかったヘッダー:\n${headers.join(', ')}`
      };
    }

    return {
      isValid: true,
      warnings: []
    };
  }

  async batchImport(csvData) {
    try {
      console.log(`Starting batch import with ${csvData.length} records`);
      
      // データが配列でない、または空の場合はエラー
      if (!Array.isArray(csvData) || csvData.length === 0) {
        return { success: false, error: 'インポートするデータがありません' };
      }

      // Google Sheets APIを初期化
      await this.ensureInitialized();

      // データがすでに構造化されている場合（オブジェクトの配列）はそのまま使用
      // データの形式を確認
      const firstItem = csvData[0];
      const isStructured = typeof firstItem === 'object' && 
                          !Array.isArray(firstItem) &&
                          ('contest_date' in firstItem || 'fwj_card_no' in firstItem);

      let rows;

      if (isStructured) {
        // 構造化されたデータ（routes/scores.jsから渡される形式）
        console.log('Processing structured data');
        rows = csvData.map(row => {
          const now = new Date().toISOString();
          return [
            Date.now().toString() + Math.random().toString(36).substr(2, 9), // id (unique)
            row.fwj_card_no || '',
            row.contest_date || '',
            row.contest_name || '',
            row.contest_place || '',
            row.category_name || '',
            row.placing || '',
            row.player_no || '',
            row.player_name || '',
            now, // createdAt
            'TRUE', // isValid
            '', // deletedAt
            now, // updatedAt
            '' // restoredAt
          ];
        });
      } else {
        // 従来のCSV形式（ヘッダー検証あり）
        console.log('Processing CSV-style data with header validation');
        const headerValidation = this.validateHeaders(csvData);
        if (!headerValidation.isValid) {
          return {
            success: false,
            error: headerValidation.error
          };
        }

        rows = csvData.map(row => {
          const now = new Date().toISOString();

          // ヘッダーを小文字に変換してアクセス
          const normalizedRow = {};
          for (const key in row) {
            normalizedRow[key.toLowerCase()] = row[key];
          }

          // CSVのnpcj_noをfwj_card_noにマッピング
          const fwjNo = normalizedRow.fwj_card_no || normalizedRow.npcj_no || '';

          return [
            Date.now().toString() + Math.random().toString(36).substr(2, 9), // id (unique)
            fwjNo,
            normalizedRow.contest_date || '',
            normalizedRow.contest_name || '',
            normalizedRow.contest_place || '',
            normalizedRow.category_name || '',
            normalizedRow.placing || '',
            normalizedRow.player_no || '',
            normalizedRow.player_name || '',
            now, // createdAt
            'TRUE', // isValid
            '', // deletedAt
            now, // updatedAt
            '' // restoredAt
          ];
        });
      }

      if (rows.length === 0) {
        return { success: false, error: 'インポートするデータがありません' };
      }

      console.log(`Appending ${rows.length} rows to Google Sheets`);

      // Google Sheets APIを使用してバッチ追記
      const sheets = this.sheetsService.sheets;
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetsService.spreadsheetId,
        range: `${this.sheetName}!A:N`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: rows
        }
      });

      console.log('Import completed successfully');

      return {
        success: true,
        data: {
          total: csvData.length,
          imported: rows.length,
          range: response.data.updates.updatedRange
        }
      };

    } catch (error) {
      console.error('Batch import error:', error);
      return { success: false, error: error.message };
    }
  }

}

module.exports = Score;