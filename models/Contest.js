const BaseModel = require('./BaseModel');
const { generateUniqueId } = require('../utils/generateId');

class Contest extends BaseModel {
  constructor() {
    super('Contests');
  }

  // Override findAll to skip isValid filtering since Contests sheet doesn't have isValid column
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

      // Don't filter by isValid for Contests sheet - return all items with valid contest_name
      return allItems.filter(item => item.contest_name && item.contest_name.trim() !== '');
    } catch (error) {
      console.error('Error in findAll:', error);
      return [];
    }
  }

  // ページング付きで取得
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

      // contest_nameが必須：空白のレコードは除外
      allItems = allItems.filter(item => item.contest_name && item.contest_name.trim() !== '');

      // フィルタリング適用
      if (filters.contest_name) {
        allItems = allItems.filter(item =>
          item.contest_name && item.contest_name.toLowerCase().includes(filters.contest_name.toLowerCase())
        );
      }
      if (filters.contest_place) {
        allItems = allItems.filter(item =>
          item.contest_place && item.contest_place.toLowerCase().includes(filters.contest_place.toLowerCase())
        );
      }
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        allItems = allItems.filter(item => {
          const searchFields = [
            item.contest_name,
            item.contest_place
          ];
          return searchFields.some(field =>
            field && field.toString().toLowerCase().includes(searchTerm)
          );
        });
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
          } else {
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

  async findByName(contestName) {
    const all = await this.findAll();
    return all.find(contest => contest.contest_name === contestName);
  }

  async findByRowIndex(rowIndex) {
    try {
      const allContests = await this.findAll();
      return allContests.find(contest => contest._rowIndex === rowIndex) || null;
    } catch (error) {
      console.error('Error in Contest.findByRowIndex:', error);
      return null;
    }
  }

  async findByDateRange(startDate, endDate) {
    const all = await this.findAll();
    return all.filter(contest => {
      if (!contest.contest_date) return false;
      const contestDate = new Date(contest.contest_date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return contestDate >= start && contestDate <= end;
    });
  }

  // 開催日順にソートされたコンテスト一覧を取得
  async findAllSorted(order = 'desc') {
    const all = await this.findAll();
    return all.sort((a, b) => {
      const dateA = new Date(a.contest_date);
      const dateB = new Date(b.contest_date);
      return order === 'desc' ? dateB - dateA : dateA - dateB;
    });
  }

  // 今日以降のコンテストを取得
  async findUpcoming() {
    const all = await this.findAll();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return all
      .filter(contest => {
        if (!contest.contest_date) return false;
        const contestDate = new Date(contest.contest_date);
        return contestDate >= today;
      })
      .sort((a, b) => new Date(a.contest_date) - new Date(b.contest_date));
  }

  // 新規作成
  async create(contestData) {
    try {
      await this.ensureInitialized();
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A:AD`);
      if (values.length === 0) {
        throw new Error('ヘッダー行が見つかりません');
      }

      const headers = values[0];

      // IDが存在しない場合は生成
      if (!contestData.id) {
        contestData.id = generateUniqueId();
      }

      // 有効なフィールドのみを含む行データを作成
      const newRow = headers.map(header => contestData[header] || '');

      // 新しい行を追加
      await this.getSheetsService().appendValues(`${this.sheetName}!A:AD`, [newRow]);

      return { success: true, message: '大会情報を追加しました' };
    } catch (error) {
      console.error('Error in Contest.create:', error);
      throw error;
    }
  }

  // 更新
  async update(rowIndex, contestData) {
    try {
      await this.ensureInitialized();
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A:AD`);
      if (values.length === 0) {
        throw new Error('ヘッダー行が見つかりません');
      }

      const headers = values[0];
      
      // 既存の行データを取得（行インデックスは1から始まるが、配列は0から始まるので調整）
      const existingRowIndex = rowIndex - 2; // ヘッダー行を除く
      const existingRow = values[existingRowIndex + 1]; // +1 for header row

      // 更新する行データを作成（既存値を保持し、提供された値で上書き）
      const updatedRow = headers.map((header, index) => {
        if (contestData[header] !== undefined) {
          return contestData[header];
        }
        // 既存の値を保持
        return existingRow?.[index] || '';
      });

      // 行を更新
      await this.getSheetsService().updateValues(
        `${this.sheetName}!A${rowIndex}:AD${rowIndex}`,
        [updatedRow]
      );

      return { success: true, message: '大会情報を更新しました' };
    } catch (error) {
      console.error('Error in Contest.update:', error);
      throw error;
    }
  }

  // 開催地一覧を取得
  async getPlaces() {
    try {
      const allContests = await this.findAll();
      const places = [...new Set(allContests.map(c => c.contest_place).filter(Boolean))];
      return places.sort();
    } catch (error) {
      console.error('Error in getPlaces:', error);
      return [];
    }
  }
}

module.exports = Contest;
