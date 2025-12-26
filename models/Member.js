const BaseModel = require('./BaseModel');

class Member extends BaseModel {
  constructor() {
    super('Members');
  }

  // Override findAll to skip isValid filtering since Members sheet doesn't have isValid column
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

      // Return all items with valid email
      return allItems.filter(item => item.email && item.email.trim() !== '');
    } catch (error) {
      console.error('Error in findAll:', error);
      return [];
    }
  }

  // ページング付きで取得
  async findWithPaging(page = 1, limit = 50, filters = {}, sortBy = 'created_at', sortOrder = 'desc') {
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

      // emailが必須：空白のレコードは除外
      allItems = allItems.filter(item => item.email && item.email.trim() !== '');

      // フィルタリング適用
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        allItems = allItems.filter(item => {
          const searchFields = [
            item.shopify_id,
            item.email,
            item.first_name,
            item.last_name,
            item.phone
          ];
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

          // 日付の場合は Date オブジェクトに変換
          if (sortBy === 'created_at' || sortBy === 'updated_at') {
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

  // Shopify IDで検索
  async findByShopifyId(shopifyId) {
    const all = await this.findAll();
    return all.find(member => member.shopify_id === String(shopifyId));
  }

  // 新規作成または更新（Shopifyからの同期用）
  async upsertFromShopify(memberData) {
    try {
      await this.ensureInitialized();
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A:Z`);
      if (values.length === 0) {
        throw new Error('ヘッダー行が見つかりません');
      }

      const headers = values[0];

      // 既存のメンバーを検索
      const existingMember = await this.findByShopifyId(memberData.shopify_id);

      if (existingMember) {
        // 更新
        const rowIndex = existingMember._rowIndex;
        const existingRowIndex = rowIndex - 2;
        const existingRow = values[existingRowIndex + 1];

        const updatedRow = headers.map((header, index) => {
          if (memberData[header] !== undefined) {
            return memberData[header];
          }
          return existingRow?.[index] || '';
        });

        await this.getSheetsService().updateValues(
          `${this.sheetName}!A${rowIndex}:Z${rowIndex}`,
          [updatedRow]
        );

        return { success: true, action: 'updated', message: 'FWJ会員情報を更新しました' };
      } else {
        // 新規作成
        const newRow = headers.map(header => memberData[header] || '');
        await this.getSheetsService().appendValues(`${this.sheetName}!A:Z`, [newRow]);

        return { success: true, action: 'created', message: 'FWJ会員情報を追加しました' };
      }
    } catch (error) {
      console.error('Error in upsertFromShopify:', error);
      throw error;
    }
  }

  // 全てのメンバーをクリアして再同期（オプション）
  async clearAllAndSync(membersData) {
    try {
      await this.ensureInitialized();

      // ヘッダー行を取得
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A1:Z1`);
      if (values.length === 0) {
        throw new Error('ヘッダー行が見つかりません');
      }

      const headers = values[0];

      // シート全体をクリア（ヘッダー以外）
      const allData = await this.getSheetsService().getValues(`${this.sheetName}!A:Z`);
      if (allData.length > 1) {
        await this.getSheetsService().updateValues(
          `${this.sheetName}!A2:Z${allData.length}`,
          [[]] // 空の配列でクリア
        );
      }

      // 新しいデータを追加
      const newRows = membersData.map(memberData =>
        headers.map(header => memberData[header] || '')
      );

      if (newRows.length > 0) {
        await this.getSheetsService().appendValues(`${this.sheetName}!A:Z`, newRows);
      }

      return { success: true, count: newRows.length, message: `${newRows.length}件のFWJ会員情報を同期しました` };
    } catch (error) {
      console.error('Error in clearAllAndSync:', error);
      throw error;
    }
  }
}

module.exports = Member;
