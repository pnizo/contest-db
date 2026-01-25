const BaseModel = require('./BaseModel');
const { generateUniqueId, generateTicketId } = require('../utils/generateId');

class Ticket extends BaseModel {
  constructor() {
    super('Tickets');
  }

  /**
   * フィルターオプションを取得
   * @returns {Promise<object>} フィルターオプション（商品名、支払いステータス、発送ステータス）
   */
  async getFilterOptions() {
    try {
      const allTickets = await this.findAll();

      // 一意の商品名を取得
      const productNames = [...new Set(
        allTickets
          .map(ticket => ticket.product_name)
          .filter(name => name && name.trim() !== '')
      )].sort();

      // 一意の支払いステータスを取得
      const financialStatuses = [...new Set(
        allTickets
          .map(ticket => ticket.financial_status)
          .filter(status => status && status.trim() !== '')
      )].sort();

      // 一意の発送ステータスを取得
      const fulfillmentStatuses = [...new Set(
        allTickets
          .map(ticket => ticket.fulfillment_status)
          .filter(status => status && status.trim() !== '')
      )].sort();

      return {
        productNames,
        financialStatuses,
        fulfillmentStatuses
      };
    } catch (error) {
      console.error('Error getting filter options:', error);
      throw error;
    }
  }

  /**
   * ページング・フィルタリング・ソート付きでチケットを取得
   */
  async findWithPaging(page = 1, limit = 50, filters = {}, sortBy = 'order_date', sortOrder = 'desc') {
    try {
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A:AZ`);
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

      // フィルタリング適用
      if (filters.product_name) {
        allItems = allItems.filter(item =>
          item.product_name && item.product_name.toLowerCase().includes(filters.product_name.toLowerCase())
        );
      }
      if (filters.financial_status) {
        allItems = allItems.filter(item =>
          item.financial_status === filters.financial_status
        );
      }
      if (filters.fulfillment_status) {
        allItems = allItems.filter(item =>
          item.fulfillment_status === filters.fulfillment_status
        );
      }
      if (filters.valid_only === 'true') {
        allItems = allItems.filter(item =>
          item.is_usable === 'TRUE'
        );
      }
      if (filters.shopify_id_filter) {
        const filterValue = filters.shopify_id_filter.toString();
        allItems = allItems.filter(item =>
          (item.shopify_id && item.shopify_id.toString() === filterValue) ||
          (item.owner_shopify_id && item.owner_shopify_id.toString() === filterValue)
        );
      }
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        allItems = allItems.filter(item => {
          const searchFields = [
            item.full_name,
            item.email,
            item.order_no,
            item.product_name,
            item.reserved_seat
          ];
          return searchFields.some(field =>
            field && field.toString().toLowerCase().includes(searchTerm)
          );
        });
      }
      if (filters.startDate && filters.endDate) {
        allItems = allItems.filter(item => {
          if (!item.order_date) return false;
          const itemDate = new Date(item.order_date);
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

          // 日付フィールドの場合
          if (sortBy === 'order_date') {
            aVal = aVal ? new Date(aVal) : new Date(0);
            bVal = bVal ? new Date(bVal) : new Date(0);
          }
          // 数値フィールドの場合
          else if (['total_price', 'price'].includes(sortBy)) {
            aVal = aVal === '' || aVal == null ? 0 : parseFloat(aVal) || 0;
            bVal = bVal === '' || bVal == null ? 0 : parseFloat(bVal) || 0;
          }
          // 文字列の場合
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

  /**
   * 行インデックスでチケットを取得
   * @param {number} rowIndex - スプレッドシートの行インデックス
   */
  async findByRowIndex(rowIndex) {
    try {
      await this.ensureInitialized();
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A${rowIndex}:AZ${rowIndex}`);
      
      if (!values || values.length === 0) {
        return null;
      }

      const row = values[0];
      const obj = { _rowIndex: rowIndex };
      this.headers.forEach((header, i) => {
        obj[header] = row[i] || '';
      });

      return obj;
    } catch (error) {
      console.error('Error in findByRowIndex:', error);
      return null;
    }
  }

  /**
   * 行インデックスでチケットを更新
   * @param {number} rowIndex - スプレッドシートの行インデックス
   * @param {object} data - 更新データ
   */
  async updateByRowIndex(rowIndex, data) {
    try {
      await this.ensureInitialized();
      
      // 現在の行データを取得
      const currentData = await this.findByRowIndex(rowIndex);
      if (!currentData) {
        return { success: false, error: 'Ticket not found' };
      }

      // 更新データをマージ
      const updatedRow = this.headers.map(header =>
        data.hasOwnProperty(header) ? data[header] : currentData[header]
      );

      // 列数を計算（A列から始まる）
      const endColumn = String.fromCharCode(64 + this.headers.length);
      await this.getSheetsService().updateValues(
        `${this.sheetName}!A${rowIndex}:${endColumn}${rowIndex}`,
        [updatedRow]
      );

      return { success: true, data: { ...currentData, ...data } };
    } catch (error) {
      console.error('Error in updateByRowIndex:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 行インデックスでチケットを削除
   * @param {number} rowIndex - スプレッドシートの行インデックス
   */
  async deleteByRowIndex(rowIndex) {
    try {
      // Google Sheets APIは0ベースなので、rowIndex - 1が正しい
      await this.getSheetsService().deleteRow(this.sheetName, rowIndex - 1);
      return { success: true };
    } catch (error) {
      console.error('Error in deleteByRowIndex:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Shopifyからインポートしたデータをシートに書き込む
   * @param {Array<object>} tickets - チケットデータ配列
   * @param {number} maxTags - 最大タグ数
   */

  /**
   * マージ用に既存の全チケットデータを取得（is_usable=FALSEも含む）
   * @returns {Promise<Array>} 全チケットデータの配列
   */
  async _getAllTicketsForMerge() {
    try {
      await this.ensureInitialized();
      const values = await this.getSheetsService().getValues(`${this.sheetName}!A:AH`);
      if (!values || values.length === 0) return [];

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
      console.error('Error in _getAllTicketsForMerge:', error);
      return [];
    }
  }

  async importTickets(tickets, maxTags = 0) {
    try {
      // 1. 既存データを取得（is_usable=FALSEも含めて全件）
      const existingData = await this._getAllTicketsForMerge();

      // 2. マッチング用Mapを作成（キー: order_no|shopify_id|line_item_id|item_sub_no）
      const existingMap = new Map();
      existingData.forEach(ticket => {
        const key = `${ticket.order_no}|${ticket.shopify_id}|${ticket.line_item_id}|${ticket.item_sub_no}`;
        existingMap.set(key, ticket);
      });

      // 基本ヘッダー
      const baseHeaders = [
        'id', 'order_no', 'order_date', 'shopify_id', 'full_name', 'email',
        'total_price', 'financial_status', 'fulfillment_status',
        'product_name', 'variant', 'price', 'line_item_id',
        'item_sub_no', 'owner_shopify_id', 'reserved_seat', 'is_usable'
      ];

      // タグヘッダーを追加
      const tagHeaders = [];
      for (let i = 1; i <= maxTags; i++) {
        tagHeaders.push(`tag${i}`);
      }
      const headers = [...baseHeaders, ...tagHeaders];

      // 3. 新しいデータと既存データをマージして行データを生成
      const rows = tickets.map((ticket, index) => {
        const key = `${ticket.baseData.order_no}|${ticket.baseData.shopify_id}|${ticket.baseData.line_item_id}|${ticket.baseData.item_sub_no}`;
        const existing = existingMap.get(key);

        let id, owner_shopify_id, reserved_seat, is_usable;

        if (existing) {
          // 既存データがある場合：指定フィールドを引き継ぎ
          id = existing.id;
          owner_shopify_id = existing.owner_shopify_id || ticket.baseData.owner_shopify_id;
          reserved_seat = existing.reserved_seat || ticket.baseData.reserved_seat;
          // is_usable: 既存がFALSEなら維持、それ以外はShopifyの値
          is_usable = existing.is_usable === 'FALSE' ? 'FALSE' : ticket.baseData.is_usable;
        } else {
          // 新規データ（枝番増加分など）
          id = generateTicketId();
          owner_shopify_id = ticket.baseData.owner_shopify_id;
          reserved_seat = ticket.baseData.reserved_seat;
          is_usable = 'TRUE';  // 新規追加は常にTRUE
        }

        const baseData = [
          id,
          ticket.baseData.order_no,
          ticket.baseData.order_date,
          ticket.baseData.shopify_id,
          ticket.baseData.full_name,
          ticket.baseData.email,
          ticket.baseData.total_price,
          ticket.baseData.financial_status,
          ticket.baseData.fulfillment_status,
          ticket.baseData.product_name,
          ticket.baseData.variant,
          ticket.baseData.price,
          ticket.baseData.line_item_id,
          ticket.baseData.item_sub_no,
          owner_shopify_id,
          reserved_seat,
          is_usable
        ];

        // タグをパディング
        const paddedTags = [...(ticket.tags || [])];
        while (paddedTags.length < maxTags) {
          paddedTags.push('');
        }

        return [...baseData, ...paddedTags];
      });

      // 4. シートに書き込み
      await this.getSheetsService().writeToSheet(this.sheetName, headers, rows);

      // ヘッダーを更新
      this.headers = headers;
      this._initialized = true;

      return { success: true, imported: tickets.length };
    } catch (error) {
      console.error('Error importing tickets:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Webhookからのアップサート処理
   * 既存データがあれば更新、なければ追加
   * @param {Array} ticketDataArray - formatWebhookOrderForTicketから返されたデータ配列
   * @returns {Promise<Object>} 処理結果
   */
  async upsertFromWebhook(ticketDataArray) {
    try {
      await this.ensureInitialized();

      // 1. 既存データを取得（is_usable=FALSEも含めて全件）
      const existingData = await this._getAllTicketsForMerge();
      const existingMap = new Map();
      existingData.forEach(ticket => {
        const key = `${ticket.order_no}|${ticket.shopify_id}|${ticket.line_item_id}|${ticket.item_sub_no}`;
        existingMap.set(key, ticket);
      });

      const results = {
        added: 0,
        updated: 0,
        skipped: 0
      };

      // 2. 各チケットを処理
      for (const ticketData of ticketDataArray) {
        const key = `${ticketData.baseData.order_no}|${ticketData.baseData.shopify_id}|${ticketData.baseData.line_item_id}|${ticketData.baseData.item_sub_no}`;
        const existing = existingMap.get(key);

        if (existing) {
          // 既存データがある場合
          // is_usable=FALSEのレコードは変更しない（手動削除扱い維持）
          if (existing.is_usable === 'FALSE') {
            results.skipped++;
            continue;
          }

          // 更新: financial_status, fulfillment_status のみ更新
          const updateData = {
            financial_status: ticketData.baseData.financial_status,
            fulfillment_status: ticketData.baseData.fulfillment_status,
            // is_usable: Shopifyからの値を反映（currentQuantityに基づく）
            is_usable: ticketData.baseData.is_usable
          };

          await this.updateByRowIndex(existing._rowIndex, updateData);
          results.updated++;
        } else {
          // 新規追加
          await this._appendSingleTicket(ticketData);
          results.added++;
        }
      }

      return { success: true, ...results };
    } catch (error) {
      console.error('Error in upsertFromWebhook:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 単一のチケットを追加
   * @private
   * @param {Object} ticketData - チケットデータ（baseDataとtags）
   */
  async _appendSingleTicket(ticketData) {
    await this.ensureInitialized();

    const id = generateTicketId();
    
    // 基本データを配列に変換
    const rowData = [
      id,
      ticketData.baseData.order_no,
      ticketData.baseData.order_date,
      ticketData.baseData.shopify_id,
      ticketData.baseData.full_name,
      ticketData.baseData.email,
      ticketData.baseData.total_price,
      ticketData.baseData.financial_status,
      ticketData.baseData.fulfillment_status,
      ticketData.baseData.product_name,
      ticketData.baseData.variant,
      ticketData.baseData.price,
      ticketData.baseData.line_item_id,
      ticketData.baseData.item_sub_no,
      ticketData.baseData.owner_shopify_id,
      ticketData.baseData.reserved_seat,
      ticketData.baseData.is_usable
    ];

    // タグを追加（ヘッダーのtag列数に合わせる）
    const tagCount = this.headers.filter(h => h.startsWith('tag')).length;
    const tags = ticketData.tags || [];
    for (let i = 0; i < tagCount; i++) {
      rowData.push(tags[i] || '');
    }

    // シートに追加
    await this.getSheetsService().appendValues(`${this.sheetName}!A:A`, [rowData]);
  }

  /**
   * チケットIDで検索
   * @param {number} ticketId - 数値ID
   * @returns {Promise<Object|null>} マッチしたチケット、またはnull
   */
  async findByTicketId(ticketId) {
    const allTickets = await this._getAllTicketsForMerge();
    const ticketIdStr = ticketId.toString();
    return allTickets.find(ticket =>
      ticket.id && ticket.id.toString() === ticketIdStr
    ) || null;
  }

  /**
   * チェックイン実行（is_usableをFALSEに更新）
   * @param {number} rowIndex - スプレッドシートの行インデックス
   * @returns {Promise<Object>} 更新結果
   */
  async checkin(rowIndex) {
    return this.updateByRowIndex(rowIndex, { is_usable: 'FALSE' });
  }

  /**
   * 注文番号でキャンセル（is_usable=FALSE）
   * @param {string} orderNo - 注文番号（例: #1001）
   * @returns {Promise<Object>} 処理結果
   */
  async cancelByOrderNo(orderNo) {
    try {
      await this.ensureInitialized();

      // 1. 該当する全レコードを取得
      const existingData = await this._getAllTicketsForMerge();
      const targetTickets = existingData.filter(ticket => ticket.order_no === orderNo);

      if (targetTickets.length === 0) {
        return { success: true, cancelled: 0, message: 'No tickets found for this order' };
      }

      // 2. 各レコードのis_usableをFALSEに更新
      let cancelled = 0;
      for (const ticket of targetTickets) {
        if (ticket.is_usable !== 'FALSE') {
          await this.updateByRowIndex(ticket._rowIndex, { is_usable: 'FALSE' });
          cancelled++;
        }
      }

      return { success: true, cancelled, total: targetTickets.length };
    } catch (error) {
      console.error('Error in cancelByOrderNo:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = Ticket;
