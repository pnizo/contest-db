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
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A:Z`);
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
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A:Z`);
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
      if (filters.npcj_no) {
        allItems = allItems.filter(item => 
          item.npcj_no && item.npcj_no.toLowerCase().includes(filters.npcj_no.toLowerCase())
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
      if (filters.startDate && filters.endDate) {
        allItems = allItems.filter(item => {
          if (!item.contest_date) return false;
          const itemDate = new Date(item.contest_date);
          const start = new Date(filters.startDate);
          const end = new Date(filters.endDate);
          return itemDate >= start && itemDate <= end;
        });
      }

      // ソート処理
      if (sortBy && allItems.length > 0) {
        allItems.sort((a, b) => {
          let aVal = a[sortBy] || '';
          let bVal = b[sortBy] || '';
          
          // 日付の場合は Date オブジェクトに変換
          if (sortBy === 'contest_date') {
            aVal = aVal ? new Date(aVal) : new Date(0);
            bVal = bVal ? new Date(bVal) : new Date(0);
          }
          // 順位の場合は数値に変換
          else if (sortBy === 'placing') {
            aVal = parseInt(aVal) || 999999;
            bVal = parseInt(bVal) || 999999;
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
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A:Z`);
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
      const all = await this.findAll();
      const item = all.find(item => item.id === id);
      
      if (!item) {
        return { success: false, error: 'Item not found' };
      }

      const rowIndex = item._rowIndex - 2;
      await this.getSheetsService().deleteRow(this.sheetName, rowIndex);
      
      return { success: true };
    } catch (error) {
      console.error('Error in delete:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = BaseModel;