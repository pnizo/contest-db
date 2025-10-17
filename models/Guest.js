const BaseModel = require('./BaseModel');

class Guest extends BaseModel {
  constructor() {
    super('【FWJ2025】マスターシート', 'guest');
  }

  // 有効なフィールドのみを取得（代表者氏名が必須）
  async findAll() {
    try {
      await this.ensureInitialized();
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A:Z`);
      if (values.length === 0) return [];

      const headers = values[0];
      const data = values.slice(1);

      // 有効なフィールドのマッピング
      const validFields = [
        '大会名',
        '団体/個人',
        '付与パス',
        '代表者氏名',
        '団体名（企業名）',
        '連絡先メールアドレス',
        '緊急電話番号',
        '社内担当者名',
        '申請種別',
        '合計付与枚数',
        '事前案内メール',
        'Check-In',
        '開催後メール',
        '備考欄（同伴者氏名など）'
      ];

      const allItems = data.map((row, index) => {
        const obj = { _rowIndex: index + 2 };
        headers.forEach((header, i) => {
          // 有効なフィールドのみを含める
          if (validFields.includes(header)) {
            obj[header] = row[i] || '';
          }
        });
        return obj;
      });

      // 代表者氏名が必須：空白のレコードは除外
      return allItems.filter(item => item['代表者氏名'] && item['代表者氏名'].trim() !== '');
    } catch (error) {
      console.error('Error in Guest.findAll:', error);
      return [];
    }
  }

  // ページング付きで取得
  async findWithPaging(page = 1, limit = 50, filters = {}, sortBy = '大会名', sortOrder = 'asc') {
    try {
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A:Z`);
      if (values.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }

      const headers = values[0];
      const data = values.slice(1);

      // 有効なフィールドのマッピング
      const validFields = [
        '大会名',
        '団体/個人',
        '付与パス',
        '代表者氏名',
        '団体名（企業名）',
        '連絡先メールアドレス',
        '緊急電話番号',
        '社内担当者名',
        '申請種別',
        '合計付与枚数',
        '事前案内メール',
        'Check-In',
        '開催後メール',
        '備考欄（同伴者氏名など）'
      ];

      let allItems = data.map((row, index) => {
        const obj = { _rowIndex: index + 2 };
        headers.forEach((header, i) => {
          if (validFields.includes(header)) {
            obj[header] = row[i] || '';
          }
        });
        return obj;
      });

      // 代表者氏名が必須：空白のレコードは除外
      allItems = allItems.filter(item => item['代表者氏名'] && item['代表者氏名'].trim() !== '');

      // フィルタリング適用
      if (filters.contest_name) {
        allItems = allItems.filter(item =>
          item['大会名'] && item['大会名'].toLowerCase().includes(filters.contest_name.toLowerCase())
        );
      }
      if (filters.organization_type) {
        allItems = allItems.filter(item =>
          item['団体/個人'] && item['団体/個人'].toLowerCase().includes(filters.organization_type.toLowerCase())
        );
      }
      if (filters.pass_type) {
        allItems = allItems.filter(item =>
          item['付与パス'] && item['付与パス'].toLowerCase().includes(filters.pass_type.toLowerCase())
        );
      }
      if (filters.representative_name) {
        allItems = allItems.filter(item =>
          item['代表者氏名'] && item['代表者氏名'].toLowerCase().includes(filters.representative_name.toLowerCase())
        );
      }
      if (filters.organization_name) {
        allItems = allItems.filter(item =>
          item['団体名（企業名）'] && item['団体名（企業名）'].toLowerCase().includes(filters.organization_name.toLowerCase())
        );
      }
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        allItems = allItems.filter(item => {
          const searchFields = [
            item['代表者氏名'],
            item['団体名（企業名）'],
            item['社内担当者名'],
            item['連絡先メールアドレス']
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

          // 数値型フィールドの定義
          const numericFields = ['合計付与枚数'];

          // 数値型フィールドの場合は数値に変換
          if (numericFields.includes(sortBy)) {
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
      console.error('Error in Guest.findWithPaging:', error);
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }
  }

  // フィルターオプションの取得
  async getFilterOptions() {
    try {
      const allGuests = await this.findAll();

      const contestNames = [...new Set(allGuests.map(g => g['大会名']).filter(Boolean))];
      const organizationTypes = [...new Set(allGuests.map(g => g['団体/個人']).filter(Boolean))];
      const passTypes = [...new Set(allGuests.map(g => g['付与パス']).filter(Boolean))];

      return {
        contestNames,
        organizationTypes,
        passTypes
      };
    } catch (error) {
      console.error('Error in getFilterOptions:', error);
      return {
        contestNames: [],
        organizationTypes: [],
        passTypes: []
      };
    }
  }

  // 新規作成
  async create(guestData) {
    try {
      await this.ensureInitialized();
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A:Z`);
      if (values.length === 0) {
        throw new Error('ヘッダー行が見つかりません');
      }

      const headers = values[0];

      // Boolean型フィールドのリスト
      const booleanFields = ['事前案内メール', 'Check-In', '開催後メール'];

      // 有効なフィールドのみを含む行データを作成
      const newRow = headers.map(header => {
        const value = guestData[header] || '';

        // Boolean型フィールドの場合、文字列をブール値に変換
        if (booleanFields.includes(header)) {
          if (value === 'TRUE' || value === true || value === '○') {
            return true;
          } else if (value === 'FALSE' || value === false || value === '') {
            return false;
          }
        }

        return value;
      });

      // 新しい行を追加
      await this.getSheetsService().appendValues(`${this.sheetName}!A:Z`, [newRow]);

      return { success: true, message: 'ゲストレコードを追加しました' };
    } catch (error) {
      console.error('Error in Guest.create:', error);
      throw error;
    }
  }

  // 更新
  async update(rowIndex, guestData) {
    try {
      await this.ensureInitialized();
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A:Z`);
      if (values.length === 0) {
        throw new Error('ヘッダー行が見つかりません');
      }

      const headers = values[0];

      // Boolean型フィールドのリスト
      const booleanFields = ['事前案内メール', 'Check-In', '開催後メール'];

      // 更新する行データを作成
      const updatedRow = headers.map(header => {
        if (guestData[header] !== undefined) {
          // Boolean型フィールドの場合、文字列をブール値に変換
          if (booleanFields.includes(header)) {
            const value = guestData[header];
            if (value === 'TRUE' || value === true || value === '○') {
              return true;
            } else if (value === 'FALSE' || value === false || value === '') {
              return false;
            }
            return value;
          }
          return guestData[header];
        }
        return '';
      });

      // 行を更新
      await this.getSheetsService().updateValues(
        `${this.sheetName}!A${rowIndex}:Z${rowIndex}`,
        [updatedRow]
      );

      return { success: true, message: 'ゲストレコードを更新しました' };
    } catch (error) {
      console.error('Error in Guest.update:', error);
      throw error;
    }
  }

  // 行インデックスで単一レコード取得
  async findByRowIndex(rowIndex) {
    try {
      const allGuests = await this.findAll();
      return allGuests.find(guest => guest._rowIndex === rowIndex) || null;
    } catch (error) {
      console.error('Error in Guest.findByRowIndex:', error);
      return null;
    }
  }
}

module.exports = Guest;
