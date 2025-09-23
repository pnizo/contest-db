const SheetsService = require('../config/sheets');

class BaseModel {
  constructor(sheetName) {
    this.sheetName = sheetName;
    this.sheetsService = null;
    this.headers = [];
    this._initialized = false;
  }

  getSheetsService() {
    if (!this.sheetsService) {
      this.sheetsService = new SheetsService();
    }
    return this.sheetsService;
  }

  async ensureInitialized() {
    if (!this._initialized) {
      const headerRow = await this.getSheetsService().getValues(`${this.sheetName}!1:1`);
      this.headers = headerRow[0] || [];
      this._initialized = true;
    }
  }

  async initialize() {
    await this.ensureInitialized();
    return this;
  }

  async findAll() {
    try {
      await this.ensureInitialized();
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A:AD`);
      if (values.length === 0) return [];
      
      const headers = values[0];
      const data = values.slice(1);
      
      const allItems = data.map((row, index) => {
        const obj = { _rowIndex: index + 2 };
        headers.forEach((header, i) => {
          obj[header] = row[i] || '';
        });
        return obj;
      });

      return allItems.filter(item => item.isValid !== 'FALSE');
    } catch (error) {
      console.error('Error in findAll:', error);
      return [];
    }
  }

  async findWithPaging(page = 1, limit = 50, filters = {}, sortBy = 'contest_date', sortOrder = 'desc') {
    try {
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A:AD`);
      if (values.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      
      const headers = values[0];
      const data = values.slice(1);
      
      let allItems = data.map((row, index) => {
        const obj = { _rowIndex: index + 2 };
        headers.forEach((header, i) => {
          obj[header] = row[i] || '';
        });
        return obj;
      });

      // 有効なデータのみ
      allItems = allItems.filter(item => item.isValid !== 'FALSE');

      // フィルタリング適用
      if (filters.fwj_no) {
        allItems = allItems.filter(item => 
          item.fwj_no && item.fwj_no.toLowerCase().includes(filters.fwj_no.toLowerCase())
        );
      }
      if (filters.fwj_card_no) {
        allItems = allItems.filter(item => 
          item.fwj_card_no && item.fwj_card_no.toString() === filters.fwj_card_no.toString()
        );
      }
      if (filters.contest_name) {
        allItems = allItems.filter(item => 
          item.contest_name && item.contest_name.toLowerCase().includes(filters.contest_name.toLowerCase())
        );
      }
      if (filters.category_name) {
        allItems = allItems.filter(item => 
          item.category_name && item.category_name.toLowerCase().includes(filters.category_name.toLowerCase())
        );
      }
      if (filters.class_name || filters.class) {
        const className = filters.class_name || filters.class;
        allItems = allItems.filter(item => 
          item.class && item.class.toLowerCase().includes(className.toLowerCase())
        );
      }
      if (filters.country) {
        allItems = allItems.filter(item => 
          item.country && item.country.toLowerCase().includes(filters.country.toLowerCase())
        );
      }
      if (filters.startDate && filters.endDate) {
        allItems = allItems.filter(item => {
          if (!item.contest_date) return false;
          const itemDate = new Date(item.contest_date);
          const start = new Date(filters.startDate);
          const end = new Date(filters.endDate);
          return itemDate >= start && itemDate <= end;
        });
      }
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        allItems = allItems.filter(item => {
          // スコア用の検索フィールド（選手名のみ）
          const scoreFields = [
            item.player_name
          ];
          
          // 登録用の検索フィールド（氏名関連のみ）
          const registrationFields = [
            item.name_ja,
            item.first_name,
            item.last_name
          ];
          
          // どちらかのフィールドセットで検索
          const searchFields = scoreFields.concat(registrationFields);
          
          return searchFields.some(field => 
            field && field.toString().toLowerCase().includes(searchTerm)
          );
        });
      }

      // ソート処理
      if (sortBy && allItems.length > 0) {
        allItems.sort((a, b) => {
          let aVal = a[sortBy] || '';
          let bVal = b[sortBy] || '';
          
          // 数値型フィールドの定義
          const numericFields = [
            'placing',           // 順位（成績・登録共通）
            'player_no',         // 選手番号（登録）
            'fwj_card_no',       // FWJカード番号（成績・登録共通）
            'npc_member_no',     // NPCメンバー番号（登録）
            'score_card',        // スコアカード番号（登録）
            'contest_order',     // 出場順（登録）
            'backstage_pass'     // バックステージパス番号（登録）
          ];
          
          // 日付の場合は Date オブジェクトに変換
          if (sortBy === 'contest_date') {
            aVal = aVal ? new Date(aVal) : new Date(0);
            bVal = bVal ? new Date(bVal) : new Date(0);
          }
          // 数値型フィールドの場合は数値に変換
          else if (numericFields.includes(sortBy)) {
            // 空文字や無効な値の場合は最大値を設定（降順時に最後に表示）
            aVal = aVal === '' || aVal == null ? Number.MAX_SAFE_INTEGER : (parseFloat(aVal) || Number.MAX_SAFE_INTEGER);
            bVal = bVal === '' || bVal == null ? Number.MAX_SAFE_INTEGER : (parseFloat(bVal) || Number.MAX_SAFE_INTEGER);
          }
          // 文字列の場合は小文字で比較
          else {
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();
          }
          
          if (aVal < bVal) {
            return sortOrder === 'asc' ? -1 : 1;
          }
          if (aVal > bVal) {
            return sortOrder === 'asc' ? 1 : -1;
          }
          return 0;
        });
      }

      const total = allItems.length;
      const totalPages = Math.ceil(total / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const pagedData = allItems.slice(startIndex, endIndex);

      return { data: pagedData, total, page, limit, totalPages };
    } catch (error) {
      console.error('Error in findWithPaging:', error);
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }
  }

  async findAllIncludingDeleted() {
    try {
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A:AD`);
      if (values.length === 0) return [];
      
      const headers = values[0];
      const data = values.slice(1);
      
      return data.map((row, index) => {
        const obj = { _rowIndex: index + 2 };
        headers.forEach((header, i) => {
          obj[header] = row[i] || '';
        });
        return obj;
      });
    } catch (error) {
      console.error('Error in findAllIncludingDeleted:', error);
      return [];
    }
  }

  async findById(id) {
    const all = await this.findAll();
    return all.find(item => item.id === id);
  }

  async create(data) {
    try {
      await this.ensureInitialized();
      if (this.headers.length === 0) {
        await this.initialize();
      }

      const row = this.headers.map(header => data[header] || '');
      await this.getSheetsService().appendValues(`${this.sheetName}!A:Z`, [row]);
      
      return { success: true, data };
    } catch (error) {
      console.error('Error in create:', error);
      return { success: false, error: error.message };
    }
  }

  async update(id, data) {
    try {
      await this.ensureInitialized();
      if (this.headers.length === 0) {
        await this.initialize();
      }

      const all = await this.findAllIncludingDeleted();
      const item = all.find(item => item.id === id);
      
      if (!item) {
        return { success: false, error: 'Item not found' };
      }

      const rowIndex = item._rowIndex;
      const updatedRow = this.headers.map(header => 
        data.hasOwnProperty(header) ? data[header] : item[header]
      );

      await this.getSheetsService().updateValues(
        `${this.sheetName}!A${rowIndex}:Z${rowIndex}`,
        [updatedRow]
      );

      return { success: true, data: { ...item, ...data } };
    } catch (error) {
      console.error('Error in update:', error);
      return { success: false, error: error.message };
    }
  }

  async delete(id) {
    try {
      await this.ensureInitialized();
      const all = await this.findAllIncludingDeleted();
      const item = all.find(item => item.id === id);
      
      if (!item) {
        return { success: false, error: 'Item not found' };
      }

      // Google Sheets APIは0ベースなので、_rowIndex - 1が正しい
      const rowIndex = item._rowIndex - 1;
      await this.getSheetsService().deleteRow(this.sheetName, rowIndex);
      
      return { success: true };
    } catch (error) {
      console.error('Error in delete:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = BaseModel;