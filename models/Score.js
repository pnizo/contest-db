const BaseModel = require('./BaseModel');

class Score extends BaseModel {
  constructor() {
    super('Scores');
  }

  async findByNpcjNo(npcjNo) {
    const all = await this.findAll();
    return all.filter(score => score.npcj_no === npcjNo);
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
  async findByCompositeKey(npcjNo, contestDate, contestName, categoryName) {
    const all = await this.findAllIncludingDeleted();
    return all.find(score => 
      score.npcj_no === npcjNo &&
      score.contest_date === contestDate &&
      score.contest_name === contestName &&
      score.category_name === categoryName
    );
  }

  async validateScore(scoreData) {
    const errors = [];
    
    // 複合キーの検証
    if (!scoreData.npcj_no || scoreData.npcj_no.trim() === '') {
      errors.push('NPCJ番号は必須です');
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
    const validation = await this.validateScore(scoreData);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    // 複合キーで削除済みデータを検索
    const existingDeletedScore = await this.findByCompositeKey(
      validation.scoreData.npcj_no,
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

  async batchImport(csvData) {
    try {
      // CSVデータをスプレッドシート行形式に変換
      const rows = csvData.map(row => {
        const now = new Date().toISOString();
        return [
          Date.now().toString() + Math.random().toString(36).substr(2, 9), // id (unique)
          row.npcj_no || '',
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

      if (rows.length === 0) {
        return { success: false, error: 'インポートするデータがありません' };
      }

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