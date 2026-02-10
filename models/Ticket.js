const { getDb } = require('../lib/db');
const { tickets } = require('../lib/db/schema');
const { eq, ilike, and, desc, asc, sql } = require('drizzle-orm');
const ShopifyService = require('../services/shopify');

/**
 * チケットモデル - Neon Postgres / Drizzle ORM版
 */
class Ticket {
  /**
   * tag1-tag10カラムからタグ配列を構築（null/空文字は除外）
   * @private
   */
  _tagsFromRow(row) {
    const tags = [];
    for (let i = 1; i <= 10; i++) {
      const v = row[`tag${i}`];
      if (v != null && v !== '') tags.push(v);
    }
    return tags;
  }

  /**
   * タグ配列を { tag1, tag2, ..., tag10 } オブジェクトに変換（10個超は切り捨て）
   * @private
   */
  _tagsToColumns(tags) {
    const cols = {};
    const src = (tags || []).filter(t => t && t.trim() !== '');
    for (let i = 1; i <= 10; i++) {
      cols[`tag${i}`] = src[i - 1] || null;
    }
    return cols;
  }

  /**
   * DBのcamelCaseをAPI用のsnake_caseに変換
   * @private
   */
  _toSnakeCase(row) {
    if (!row) return null;
    return {
      id: row.id,
      order_no: row.orderNo,
      order_date: row.orderDate,
      shopify_id: row.shopifyId,
      full_name: row.fullName,
      email: row.email,
      total_price: row.totalPrice,
      financial_status: row.financialStatus,
      fulfillment_status: row.fulfillmentStatus,
      product_name: row.productName,
      variant: row.variant,
      price: row.price,
      line_item_id: row.lineItemId,
      product_id: row.productId,
      item_sub_no: row.itemSubNo,
      is_usable: row.isUsable ? 'TRUE' : 'FALSE',
      owner_shopify_id: row.ownerShopifyId,
      reserved_seat: row.reservedSeat,
      tag1: row.tag1 || '',
      tag2: row.tag2 || '',
      tag3: row.tag3 || '',
      tag4: row.tag4 || '',
      tag5: row.tag5 || '',
      tag6: row.tag6 || '',
      tag7: row.tag7 || '',
      tag8: row.tag8 || '',
      tag9: row.tag9 || '',
      tag10: row.tag10 || '',
      used_at: row.usedAt,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  }

  /**
   * フィルターオプションを取得
   * @returns {Promise<object>} フィルターオプション（商品名、支払いステータス、発送ステータス）
   */
  async getFilterOptions() {
    try {
      const db = getDb();

      // 一意の商品名を取得
      const productNameRows = await db
        .selectDistinct({ productName: tickets.productName })
        .from(tickets)
        .where(sql`${tickets.productName} IS NOT NULL AND ${tickets.productName} != ''`)
        .orderBy(tickets.productName);

      // 一意の支払いステータスを取得
      const financialRows = await db
        .selectDistinct({ financialStatus: tickets.financialStatus })
        .from(tickets)
        .where(sql`${tickets.financialStatus} IS NOT NULL AND ${tickets.financialStatus} != ''`)
        .orderBy(tickets.financialStatus);

      // 一意の発送ステータスを取得
      const fulfillmentRows = await db
        .selectDistinct({ fulfillmentStatus: tickets.fulfillmentStatus })
        .from(tickets)
        .where(sql`${tickets.fulfillmentStatus} IS NOT NULL AND ${tickets.fulfillmentStatus} != ''`)
        .orderBy(tickets.fulfillmentStatus);

      return {
        productNames: productNameRows.map(r => r.productName),
        financialStatuses: financialRows.map(r => r.financialStatus),
        fulfillmentStatuses: fulfillmentRows.map(r => r.fulfillmentStatus),
      };
    } catch (error) {
      console.error('Error getting filter options:', error);
      throw error;
    }
  }

  /**
   * ページング・フィルタリング・ソート付きでチケットを取得
   */
  async findWithPaging(page = 1, limit = 50, filters = {}, sortBy = 'id', sortOrder = 'desc') {
    try {
      const db = getDb();

      // フィルタ条件を構築
      const conditions = [];

      if (filters.product_name) {
        conditions.push(ilike(tickets.productName, `%${filters.product_name}%`));
      }
      if (filters.financial_status) {
        conditions.push(eq(tickets.financialStatus, filters.financial_status));
      }
      if (filters.fulfillment_status) {
        conditions.push(eq(tickets.fulfillmentStatus, filters.fulfillment_status));
      }
      if (filters.valid_only === 'true') {
        conditions.push(eq(tickets.isUsable, true));
      }
      if (filters.shopify_id_filter) {
        const filterValue = filters.shopify_id_filter.toString();
        conditions.push(
          sql`(${tickets.shopifyId} = ${filterValue} OR ${tickets.ownerShopifyId} = ${filterValue})`
        );
      }
      if (filters.search) {
        const searchTerm = `%${filters.search}%`;
        conditions.push(
          sql`(
            ${tickets.fullName} ILIKE ${searchTerm} OR
            ${tickets.email} ILIKE ${searchTerm} OR
            ${tickets.orderNo} ILIKE ${searchTerm} OR
            ${tickets.productName} ILIKE ${searchTerm} OR
            ${tickets.reservedSeat} ILIKE ${searchTerm}
          )`
        );
      }
      if (filters.startDate && filters.endDate) {
        conditions.push(
          sql`${tickets.orderDate}::date >= ${filters.startDate}::date AND ${tickets.orderDate}::date <= ${filters.endDate}::date`
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // ソートカラムをマップ
      // order_dateは文字列型なので、日時型にキャストしてソート
      const sortColumnMap = {
        id: tickets.id,
        order_date: sql`${tickets.orderDate}::timestamp`,
        order_no: tickets.orderNo,
        product_name: tickets.productName,
        full_name: tickets.fullName,
        total_price: tickets.totalPrice,
        price: tickets.price,
      };
      const sortColumn = sortColumnMap[sortBy] || tickets.id;
      const orderFn = sortOrder === 'asc' ? asc : desc;

      // 総件数を取得
      const countResult = await db
        .select({ count: sql`count(*)` })
        .from(tickets)
        .where(whereClause);
      const total = parseInt(countResult[0].count, 10);

      // データ取得
      const offset = (page - 1) * limit;
      let rows = await db
        .select()
        .from(tickets)
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(limit)
        .offset(offset);

      const data = rows.map(row => this._toSnakeCase(row));
      const totalPages = Math.ceil(total / limit);

      return { data, total, page, limit, totalPages };
    } catch (error) {
      console.error('Error in findWithPaging:', error);
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }
  }

  /**
   * IDでチケットを取得
   * @param {number} id - チケットID
   */
  async findById(id) {
    try {
      const db = getDb();
      const rows = await db.select().from(tickets).where(eq(tickets.id, parseInt(id, 10)));

      if (rows.length === 0) {
        return null;
      }

      return this._toSnakeCase(rows[0]);
    } catch (error) {
      console.error('Error in findById:', error);
      return null;
    }
  }

  /**
   * チケットIDで検索（チェックイン用）
   * @param {number} ticketId - 数値ID
   * @returns {Promise<Object|null>} マッチしたチケット、またはnull
   */
  async findByTicketId(ticketId) {
    return this.findById(ticketId);
  }

  /**
   * IDでチケットを更新
   * @param {number} id - チケットID
   * @param {object} data - 更新データ（snake_case）
   */
  async updateById(id, data) {
    try {
      const db = getDb();

      // snake_case → camelCaseへの変換マップ
      const fieldMap = {
        is_usable: 'isUsable',
        owner_shopify_id: 'ownerShopifyId',
        reserved_seat: 'reservedSeat',
        financial_status: 'financialStatus',
        fulfillment_status: 'fulfillmentStatus',
        used_at: 'usedAt',
      };

      const updateData = { updatedAt: new Date() };
      for (const [snakeKey, value] of Object.entries(data)) {
        const camelKey = fieldMap[snakeKey];
        if (camelKey) {
          // is_usable: 'TRUE'/'FALSE' → boolean 変換
          if (snakeKey === 'is_usable') {
            updateData[camelKey] = value === 'TRUE' || value === true;
          } else {
            updateData[camelKey] = value;
          }
        }
      }

      await db.update(tickets).set(updateData).where(eq(tickets.id, parseInt(id, 10)));

      const updated = await this.findById(id);
      return { success: true, data: updated };
    } catch (error) {
      console.error('Error in updateById:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * IDでチケットを削除
   * @param {number} id - チケットID
   */
  async deleteById(id) {
    try {
      const db = getDb();
      await db.delete(tickets).where(eq(tickets.id, parseInt(id, 10)));
      return { success: true };
    } catch (error) {
      console.error('Error in deleteById:', error);
      return { success: false, error: error.message };
    }
  }


  /**
   * 注文番号でチケットを削除
   * @param {string} orderNo - 注文番号
   */
  async deleteByOrderNo(orderNo) {
    try {
      const db = getDb();
      const deleted = await db.delete(tickets).where(eq(tickets.orderNo, orderNo)).returning({ id: tickets.id });
      return { success: true, deleted: deleted.length };
    } catch (error) {
      console.error('Error in deleteByOrderNo:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * チェックイン実行（is_usableをfalseに更新し、used_atに現在時刻を記録）
   * @param {number} id - チケットID
   * @returns {Promise<Object>} 更新結果
   */
  async checkin(id) {
    return this.updateById(id, { is_usable: 'FALSE', used_at: new Date() });
  }

  /**
   * ShopifyからインポートしたデータをDBに書き込む
   * @param {Array<object>} ticketsData - チケットデータ配列
   */
  async importTickets(ticketsData) {
    try {
      const db = getDb();
      const CHUNK_SIZE = 500;

      console.log(`[importTickets] Start: ${ticketsData.length} rows from Shopify`);

      // Phase 1: 既存データを取得（キー: order_no|shopify_id|line_item_id|item_sub_no）
      const existingRows = await db.select().from(tickets);
      const existingMap = new Map();
      existingRows.forEach(ticket => {
        const key = `${ticket.orderNo}|${ticket.shopifyId}|${ticket.lineItemId}|${ticket.itemSubNo}`;
        existingMap.set(key, ticket);
      });

      console.log(`[importTickets] Existing rows in DB: ${existingRows.length}`);

      // Phase 2: INSERT/UPDATE を分類（メモリ内）
      const updateList = [];
      const insertList = [];

      for (const ticketData of ticketsData) {
        const baseData = ticketData.baseData;
        const key = `${baseData.order_no}|${baseData.shopify_id}|${baseData.line_item_id}|${baseData.item_sub_no}`;
        const existing = existingMap.get(key);

        if (existing) {
          updateList.push({ ticketData, existing });
        } else {
          insertList.push(ticketData);
          console.log(`[importTickets] New: key=${key}, product=${baseData.product_name}`);
        }
      }

      console.log(`[importTickets] Classification: update=${updateList.length}, insert=${insertList.length}`);

      // Phase 3: バッチ UPDATE（db.batch()）
      if (updateList.length > 0) {
        const updateQueries = updateList.map(({ ticketData, existing }) => {
          const baseData = ticketData.baseData;
          const isUsable = existing.isUsable === false ? false : (baseData.is_usable !== 'FALSE');
          return db.update(tickets).set({
            totalPrice: baseData.total_price,
            financialStatus: baseData.financial_status,
            fulfillmentStatus: baseData.fulfillment_status,
            isUsable,
            productId: baseData.product_id || '',
            ...this._tagsToColumns(ticketData.tags),
            updatedAt: new Date(),
          }).where(eq(tickets.id, existing.id));
        });

        for (let i = 0; i < updateQueries.length; i += CHUNK_SIZE) {
          const chunk = updateQueries.slice(i, i + CHUNK_SIZE);
          await db.batch(chunk);
        }
        console.log(`[importTickets] Updated: ${updateList.length} rows`);
      }

      // Phase 4: バッチ INSERT（.values([...])）
      if (insertList.length > 0) {
        const insertValues = insertList.map(ticketData => {
          const baseData = ticketData.baseData;
          return {
            orderNo: baseData.order_no,
            orderDate: baseData.order_date,
            shopifyId: baseData.shopify_id,
            fullName: baseData.full_name,
            email: baseData.email,
            totalPrice: baseData.total_price,
            financialStatus: baseData.financial_status,
            fulfillmentStatus: baseData.fulfillment_status,
            productName: baseData.product_name,
            variant: baseData.variant,
            price: baseData.price,
            lineItemId: baseData.line_item_id,
            productId: baseData.product_id || '',
            itemSubNo: parseInt(baseData.item_sub_no, 10) || 0,
            isUsable: baseData.is_usable !== 'FALSE',
            ownerShopifyId: baseData.owner_shopify_id,
            reservedSeat: baseData.reserved_seat || '',
            ...this._tagsToColumns(ticketData.tags),
          };
        });

        for (let i = 0; i < insertValues.length; i += CHUNK_SIZE) {
          const chunk = insertValues.slice(i, i + CHUNK_SIZE);
          await db.insert(tickets).values(chunk);
        }
        console.log(`[importTickets] Inserted: ${insertValues.length} rows`);
      }

      console.log(`[importTickets] Done: total=${ticketsData.length}, updated=${updateList.length}, inserted=${insertList.length}`);
      return { success: true, imported: ticketsData.length };
    } catch (error) {
      console.error('Error importing tickets:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 注文でアップサート処理
   * @param {object} order - Shopify Webhook の order オブジェクト
   * @returns {Promise<Object>} 処理結果
   */
  async upsertByOrder(order) {
    try {
      const db = getDb();
      const orderNo = order.name;

      if (!orderNo) {
        return { success: false, error: 'order.name is required' };
      }

      // Phase 1: order を ticketData 形式に変換
      const shopifyService = new ShopifyService();
      const ticketDataArray = await shopifyService.formatWebhookOrderForTicket(order);

      if (!ticketDataArray || ticketDataArray.length === 0) {
        return { success: true, added: 0, updated: 0, skipped: 0, message: 'No ticket items in order' };
      }

      // SELECT: 対象注文の既存データのみ取得
      const existingRows = await db
        .select()
        .from(tickets)
        .where(eq(tickets.orderNo, orderNo));

      const existingMap = new Map();
      const usableCountByLineItem = new Map();
      existingRows.forEach(ticket => {
        const key = `${ticket.orderNo}|${ticket.shopifyId}|${ticket.lineItemId}|${ticket.itemSubNo}`;
        existingMap.set(key, ticket);
        if (ticket.isUsable === true) {
          usableCountByLineItem.set(ticket.lineItemId, (usableCountByLineItem.get(ticket.lineItemId) || 0) + 1);
        }
      });

      const results = {
        added: 0,
        updated: 0,
        skipped: 0,
      };

      // Phase 2: 分類（メモリ内、DBアクセスなし）
      const skipList = [];
      const updateList = [];
      const insertList = [];

      for (const ticketData of ticketDataArray) {
        const baseData = ticketData.baseData;
        const key = `${baseData.order_no}|${baseData.shopify_id}|${baseData.line_item_id}|${baseData.item_sub_no}`;
        const existing = existingMap.get(key);

        if (existing) {
          if (existing.isUsable === false) {
            skipList.push({ ticketData, existing });
          } else {
            updateList.push({ ticketData, existing });
          }
        } else {
          insertList.push(ticketData);
        }
      }

      console.log(`[upsertByOrder] Order ${orderNo}: ${ticketDataArray.length} tickets - insert: ${insertList.length}, update: ${updateList.length}, skip: ${skipList.length}`);

      results.skipped = skipList.length;

      // Phase 3: isUsable 事前計算（insertList対象）
      const runningUsableCount = new Map(usableCountByLineItem);

      const insertEntries = insertList.map(ticketData => {
        const baseData = ticketData.baseData;
        const lineItemId = baseData.line_item_id;
        const currentQuantity = baseData.current_quantity || 0;
        const currentCount = runningUsableCount.get(lineItemId) || 0;
        const isUsable = currentCount < currentQuantity;

        if (isUsable) {
          runningUsableCount.set(lineItemId, currentCount + 1);
        }

        return { ticketData, isUsable };
      });

      // Phase 4: バッチ UPDATE（db.batch() で 1 HTTP リクエスト）
      if (updateList.length > 0) {
        const updateQueries = updateList.map(({ ticketData, existing }) => {
          const baseData = ticketData.baseData;
          return db.update(tickets).set({
            financialStatus: baseData.financial_status,
            fulfillmentStatus: baseData.fulfillment_status,
            isUsable: baseData.is_usable !== 'FALSE',
            productId: baseData.product_id || '',
            ...this._tagsToColumns(ticketData.tags),
            updatedAt: new Date(),
          }).where(eq(tickets.id, existing.id));
        });

        await db.batch(updateQueries);
        results.updated = updateList.length;
      }

      // Phase 5: バッチ INSERT（.values([...]) で 1 HTTP リクエスト）
      if (insertEntries.length > 0) {
        const insertValues = insertEntries.map(({ ticketData, isUsable }) => {
          const baseData = ticketData.baseData;
          return {
            orderNo: baseData.order_no,
            orderDate: baseData.order_date,
            shopifyId: baseData.shopify_id,
            fullName: baseData.full_name,
            email: baseData.email,
            totalPrice: baseData.total_price,
            financialStatus: baseData.financial_status,
            fulfillmentStatus: baseData.fulfillment_status,
            productName: baseData.product_name,
            variant: baseData.variant,
            price: baseData.price,
            lineItemId: baseData.line_item_id,
            productId: baseData.product_id || '',
            itemSubNo: parseInt(baseData.item_sub_no, 10) || 0,
            isUsable,
            ownerShopifyId: baseData.owner_shopify_id,
            reservedSeat: baseData.reserved_seat || '',
            ...this._tagsToColumns(ticketData.tags),
          };
        });

        const insertResult = await db
          .insert(tickets)
          .values(insertValues)
          .onConflictDoNothing({ target: [tickets.lineItemId, tickets.itemSubNo] })
          .returning({ id: tickets.id });

        results.added = insertResult.length;
        results.skipped += (insertEntries.length - insertResult.length);
      }

      // Phase 6: 結果ログ
      console.log(`[upsertByOrder] Order ${orderNo}: done - added=${results.added}, updated=${results.updated}, skipped=${results.skipped}`);

      return { success: true, ...results };
    } catch (error) {
      console.error('Error in upsertByOrder:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 商品名でチケットを検索（全項目取得）
   * @param {string} productName - 商品名
   * @returns {Promise<Array>} チケット一覧
   */
  async findByProductName(productName) {
    try {
      const db = getDb();

      // 商品名でチケットを取得
      let rows = await db
        .select()
        .from(tickets)
        .where(eq(tickets.productName, productName))
        .orderBy(desc(tickets.id));

      if (rows.length === 0) {
        return [];
      }

      return rows.map(row => this._toSnakeCase(row));
    } catch (error) {
      console.error('Error in findByProductName:', error);
      throw error;
    }
  }

  /**
   * reserved_seat一括更新
   * @param {Array<{id: number, reserved_seat: string}>} csvData - 更新データ
   * @returns {Promise<{total: number, updated: number}>} 更新結果
   */
  async bulkUpdateReservedSeats(csvData) {
    try {
      const db = getDb();
      const CHUNK_SIZE = 500;

      // 有効な行のみフィルタしてクエリを構築
      const updateQueries = [];
      for (const row of csvData) {
        const id = parseInt(row.id, 10);
        if (isNaN(id) || id < 1) {
          continue;
        }

        const reservedSeat = row.reserved_seat || '';
        updateQueries.push(
          db.update(tickets).set({
            reservedSeat,
            updatedAt: new Date(),
          }).where(eq(tickets.id, id))
        );
      }

      // チャンク分割してバッチUPDATE
      for (let i = 0; i < updateQueries.length; i += CHUNK_SIZE) {
        const chunk = updateQueries.slice(i, i + CHUNK_SIZE);
        await db.batch(chunk);
      }

      return { total: csvData.length, updated: updateQueries.length };
    } catch (error) {
      console.error('Error in bulkUpdateReservedSeats:', error);
      throw error;
    }
  }

  async batchUpdate(updates) {
    const db = getDb();
    const CHUNK_SIZE = 500;

    const fieldMap = {
      is_usable: 'isUsable',
      owner_shopify_id: 'ownerShopifyId',
      reserved_seat: 'reservedSeat',
      financial_status: 'financialStatus',
      fulfillment_status: 'fulfillmentStatus',
      full_name: 'fullName',
      product_name: 'productName',
      email: 'email',
      variant: 'variant',
      price: 'price',
      tag1: 'tag1', tag2: 'tag2', tag3: 'tag3', tag4: 'tag4', tag5: 'tag5',
      tag6: 'tag6', tag7: 'tag7', tag8: 'tag8', tag9: 'tag9', tag10: 'tag10',
    };

    console.log(`[Ticket.batchUpdate] Start: ${updates.length} rows`);

    try {
      const updateQueries = updates.map(({ id, data }) => {
        const updateData = { updatedAt: new Date() };
        const mappedFields = [];
        for (const [snakeKey, value] of Object.entries(data)) {
          const camelKey = fieldMap[snakeKey];
          if (camelKey) {
            if (snakeKey === 'is_usable') {
              updateData[camelKey] = value === 'TRUE' || value === true;
            } else {
              updateData[camelKey] = value;
            }
            mappedFields.push(snakeKey);
          }
        }
        console.log(`[Ticket.batchUpdate] id=${id}, fields=[${mappedFields.join(', ')}]`);
        return db.update(tickets).set(updateData).where(eq(tickets.id, parseInt(id)));
      });

      for (let i = 0; i < updateQueries.length; i += CHUNK_SIZE) {
        const chunk = updateQueries.slice(i, i + CHUNK_SIZE);
        await db.batch(chunk);
      }

      console.log(`[Ticket.batchUpdate] Done: updated=${updateQueries.length}`);
      return { success: true, updated: updateQueries.length };
    } catch (error) {
      console.error('Ticket batchUpdate error:', error);
      return { success: false, error: error.message };
    }
  }

  async batchInsertFromCsv(rows) {
    const db = getDb();
    const CHUNK_SIZE = 500;

    const fieldMap = {
      order_no: 'orderNo',
      order_date: 'orderDate',
      shopify_id: 'shopifyId',
      full_name: 'fullName',
      email: 'email',
      total_price: 'totalPrice',
      financial_status: 'financialStatus',
      fulfillment_status: 'fulfillmentStatus',
      product_name: 'productName',
      variant: 'variant',
      price: 'price',
      line_item_id: 'lineItemId',
      product_id: 'productId',
      item_sub_no: 'itemSubNo',
      is_usable: 'isUsable',
      owner_shopify_id: 'ownerShopifyId',
      reserved_seat: 'reservedSeat',
      tag1: 'tag1', tag2: 'tag2', tag3: 'tag3', tag4: 'tag4', tag5: 'tag5',
      tag6: 'tag6', tag7: 'tag7', tag8: 'tag8', tag9: 'tag9', tag10: 'tag10',
    };

    const requiredFields = ['order_no', 'shopify_id', 'full_name', 'email', 'product_name', 'owner_shopify_id'];

    console.log(`[Ticket.batchInsertFromCsv] Start: ${rows.length} rows`);

    try {
      const insertValues = [];
      let skipped = 0;

      for (const row of rows) {
        // 必須フィールドチェック
        const missingFields = requiredFields.filter(f => !row[f] || row[f].toString().trim() === '');
        if (missingFields.length > 0) {
          console.log(`[Ticket.batchInsertFromCsv] Skipped: missing=[${missingFields.join(', ')}], row=${JSON.stringify(row).substring(0, 200)}`);
          skipped++;
          continue;
        }

        const insertData = {};
        for (const [snakeKey, value] of Object.entries(row)) {
          const camelKey = fieldMap[snakeKey];
          if (camelKey) {
            if (snakeKey === 'is_usable') {
              insertData[camelKey] = value === 'TRUE' || value === true;
            } else if (snakeKey === 'item_sub_no') {
              insertData[camelKey] = parseInt(value, 10) || 0;
            } else {
              insertData[camelKey] = value;
            }
          }
        }
        // tags 列（カンマ区切り）→ tag1〜tag10 に展開
        if (row.tags && !insertData.tag1) {
          const tagValues = row.tags.split(',').map(t => t.trim()).filter(t => t !== '');
          for (let i = 1; i <= 10; i++) {
            insertData[`tag${i}`] = tagValues[i - 1] || null;
          }
        }
        // order_date が空の場合は現在時刻を設定
        if (!insertData.orderDate || insertData.orderDate.trim() === '') {
          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          insertData.orderDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        }
        insertValues.push(insertData);
      }

      console.log(`[Ticket.batchInsertFromCsv] Inserting: ${insertValues.length}, skipped: ${skipped}`);

      for (let i = 0; i < insertValues.length; i += CHUNK_SIZE) {
        const chunk = insertValues.slice(i, i + CHUNK_SIZE);
        await db.insert(tickets).values(chunk);
      }

      console.log(`[Ticket.batchInsertFromCsv] Done: inserted=${insertValues.length}, skipped=${skipped}`);
      return { success: true, inserted: insertValues.length, skipped };
    } catch (error) {
      console.error('Ticket batchInsertFromCsv error:', error);
      return { success: false, error: error.message };
    }
  }

}

module.exports = Ticket;
