const { getDb } = require('../lib/db');
const { tickets, ticketTags } = require('../lib/db/schema');
const { eq, ilike, and, desc, asc, sql, inArray } = require('drizzle-orm');
const ShopifyService = require('../services/shopify');

/**
 * チケットモデル - Neon Postgres / Drizzle ORM版
 */
class Ticket {
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
      item_sub_no: row.itemSubNo,
      is_usable: row.isUsable ? 'TRUE' : 'FALSE',
      owner_shopify_id: row.ownerShopifyId,
      reserved_seat: row.reservedSeat,
      color: row.color,
      used_at: row.usedAt,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      tags: row.tags || [],
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

      // タグを取得
      if (rows.length > 0) {
        const ticketIds = rows.map(r => r.id);
        const tagRows = await db
          .select()
          .from(ticketTags)
          .where(inArray(ticketTags.ticketId, ticketIds))
          .orderBy(ticketTags.sortOrder);

        // タグをチケットにマップ
        const tagMap = new Map();
        tagRows.forEach(t => {
          if (!tagMap.has(t.ticketId)) {
            tagMap.set(t.ticketId, []);
          }
          tagMap.get(t.ticketId).push(t.tag);
        });

        rows = rows.map(row => ({
          ...row,
          tags: tagMap.get(row.id) || [],
        }));
      }

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

      // タグを取得
      const tagRows = await db
        .select()
        .from(ticketTags)
        .where(eq(ticketTags.ticketId, rows[0].id))
        .orderBy(ticketTags.sortOrder);

      const row = {
        ...rows[0],
        tags: tagRows.map(t => t.tag),
      };

      return this._toSnakeCase(row);
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
   * @param {number} maxTags - 最大タグ数（未使用、互換性のため維持）
   */
  async importTickets(ticketsData, maxTags = 0) {
    try {
      const db = getDb();

      // 1. 既存データを取得（キー: order_no|shopify_id|line_item_id|item_sub_no）
      const existingRows = await db.select().from(tickets);
      const existingMap = new Map();
      existingRows.forEach(ticket => {
        const key = `${ticket.orderNo}|${ticket.shopifyId}|${ticket.lineItemId}|${ticket.itemSubNo}`;
        existingMap.set(key, ticket);
      });

      let imported = 0;

      // 2. 各チケットを処理
      for (const ticketData of ticketsData) {
        const baseData = ticketData.baseData;
        const key = `${baseData.order_no}|${baseData.shopify_id}|${baseData.line_item_id}|${baseData.item_sub_no}`;
        const existing = existingMap.get(key);

        if (existing) {
          // 既存データの更新（is_usable=FALSE維持）
          const isUsable = existing.isUsable === false ? false : (baseData.is_usable !== 'FALSE');

          await db
            .update(tickets)
            .set({
              totalPrice: baseData.total_price,
              financialStatus: baseData.financial_status,
              fulfillmentStatus: baseData.fulfillment_status,
              isUsable,
              color: baseData.color || null,
              updatedAt: new Date(),
            })
            .where(eq(tickets.id, existing.id));

          // タグを更新
          await this._updateTags(existing.id, ticketData.tags || []);
        } else {
          // 新規挿入
          const insertResult = await db
            .insert(tickets)
            .values({
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
              itemSubNo: parseInt(baseData.item_sub_no, 10) || 0,
              isUsable: baseData.is_usable !== 'FALSE',
              ownerShopifyId: baseData.owner_shopify_id,
              reservedSeat: baseData.reserved_seat || '',
              color: baseData.color || '',
            })
            .returning({ id: tickets.id });

          // タグを挿入
          if (insertResult[0] && ticketData.tags && ticketData.tags.length > 0) {
            await this._updateTags(insertResult[0].id, ticketData.tags);
          }
        }
        imported++;
      }

      return { success: true, imported };
    } catch (error) {
      console.error('Error importing tickets:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * タグを更新
   * @private
   */
  async _updateTags(ticketId, tags) {
    const db = getDb();

    // 既存タグを削除
    await db.delete(ticketTags).where(eq(ticketTags.ticketId, ticketId));

    // 新しいタグを挿入
    if (tags && tags.length > 0) {
      const tagValues = tags
        .filter(tag => tag && tag.trim() !== '')
        .map((tag, index) => ({
          ticketId,
          tag,
          sortOrder: index,
        }));

      if (tagValues.length > 0) {
        await db.insert(ticketTags).values(tagValues);
      }
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

      // 1. order を ticketData 形式に変換
      const shopifyService = new ShopifyService();
      const ticketDataArray = await shopifyService.formatWebhookOrderForTicket(order);

      if (!ticketDataArray || ticketDataArray.length === 0) {
        return { success: true, added: 0, updated: 0, skipped: 0, message: 'No ticket items in order' };
      }

      // 2. 対象注文の既存データのみ取得
      const existingRows = await db
        .select()
        .from(tickets)
        .where(eq(tickets.orderNo, orderNo));

      const existingMap = new Map();
      // lineItemIdごとのisUsable=TRUEのカウント
      const usableCountByLineItem = new Map();
      existingRows.forEach(ticket => {
        const key = `${ticket.orderNo}|${ticket.shopifyId}|${ticket.lineItemId}|${ticket.itemSubNo}`;
        existingMap.set(key, ticket);
        // isUsable=TRUEのカウント
        if (ticket.isUsable === true) {
          usableCountByLineItem.set(ticket.lineItemId, (usableCountByLineItem.get(ticket.lineItemId) || 0) + 1);
        }
      });

      const results = {
        added: 0,
        updated: 0,
        skipped: 0,
      };

      // 2. 各チケットを処理
      for (const ticketData of ticketDataArray) {
        const baseData = ticketData.baseData;
        const key = `${baseData.order_no}|${baseData.shopify_id}|${baseData.line_item_id}|${baseData.item_sub_no}`;
        const existing = existingMap.get(key);

        console.log(`[upsertByOrder] Processing ticket: key=${key}, is_usable=${baseData.is_usable}, existing=${existing ? `id=${existing.id}, isUsable=${existing.isUsable}` : 'null'}`);

        if (existing) {
          // is_usable=false のレコードは変更しない
          if (existing.isUsable === false) {
            results.skipped++;
            continue;
          }

          // 更新
          const newIsUsable = baseData.is_usable !== 'FALSE';
          console.log(`[upsertByOrder] Updating ticket id=${existing.id}: isUsable ${existing.isUsable} -> ${newIsUsable} (baseData.is_usable="${baseData.is_usable}")`);
          await db
            .update(tickets)
            .set({
              financialStatus: baseData.financial_status,
              fulfillmentStatus: baseData.fulfillment_status,
              isUsable: newIsUsable,
              updatedAt: new Date(),
            })
            .where(eq(tickets.id, existing.id));

          results.updated++;
        } else {
          // 新規追加（競合時は無視 - 同時Webhook対策）
          // lineItemIdの現在のisUsable=TRUEカウントを取得
          const lineItemId = baseData.line_item_id;
          const currentUsableCount = usableCountByLineItem.get(lineItemId) || 0;
          const currentQuantity = baseData.current_quantity || 0;

          // currentQuantityに達するまでTRUEで追加
          const isUsable = currentUsableCount < currentQuantity;
          console.log(`[upsertByOrder] Inserting ticket: lineItemId=${lineItemId}, currentUsableCount=${currentUsableCount}, currentQuantity=${currentQuantity}, isUsable=${isUsable}`);

          const insertResult = await db
            .insert(tickets)
            .values({
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
              lineItemId: lineItemId,
              itemSubNo: parseInt(baseData.item_sub_no, 10) || 0,
              isUsable: isUsable,
              ownerShopifyId: baseData.owner_shopify_id,
              reservedSeat: baseData.reserved_seat || '',
              color: baseData.color || '',
            })
            .onConflictDoNothing({ target: [tickets.lineItemId, tickets.itemSubNo] })
            .returning({ id: tickets.id });

          // 競合で挿入されなかった場合はスキップ
          if (!insertResult[0]) {
            results.skipped++;
            continue;
          }

          // 追加成功したらisUsable=TRUEのカウントをインクリメント
          if (isUsable) {
            usableCountByLineItem.set(lineItemId, currentUsableCount + 1);
          }

          // タグを挿入
          if (ticketData.tags && ticketData.tags.length > 0) {
            await this._updateTags(insertResult[0].id, ticketData.tags);
          }

          results.added++;
        }
      }

      return { success: true, ...results };
    } catch (error) {
      console.error('Error in upsertByOrder:', error);
      return { success: false, error: error.message };
    }
  }

}

module.exports = Ticket;
