const { getDb } = require('../lib/db');
const { orders, orderExportMeta } = require('../lib/db/schema');
const { eq, ilike, and, desc, asc, sql } = require('drizzle-orm');

/**
 * Orderモデル - Neon Postgres / Drizzle ORM版
 */
class Order {
  /**
   * 行データからタグ配列を抽出
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
   * タグ配列を tag1-tag10 カラムオブジェクトに変換
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
      quantity: row.quantity,
      current_quantity: row.currentQuantity,
      price: row.price,
      line_item_id: row.lineItemId,
      back_stage_pass: row.backStagePass ?? 0,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      tags: this._tagsFromRow(row),
    };
  }

  /**
   * 全注文を取得
   * @returns {Promise<Array>} 注文配列
   */
  async findAll() {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(orders)
        .orderBy(desc(orders.createdAt));

      return rows.map(row => this._toSnakeCase(row));
    } catch (error) {
      console.error('Error in findAll:', error);
      return [];
    }
  }

  /**
   * ページング・フィルタリング・ソート付きで注文を取得
   */
  async findWithPaging(page = 1, limit = 50, filters = {}, sortBy = 'order_date', sortOrder = 'desc') {
    try {
      const db = getDb();

      // フィルタ条件を構築
      const conditions = [];

      if (filters.product_name) {
        conditions.push(ilike(orders.productName, `%${filters.product_name}%`));
      }
      if (filters.financial_status) {
        conditions.push(eq(orders.financialStatus, filters.financial_status));
      }
      if (filters.fulfillment_status) {
        conditions.push(eq(orders.fulfillmentStatus, filters.fulfillment_status));
      }
      if (filters.search) {
        const searchTerm = `%${filters.search}%`;
        conditions.push(
          sql`(
            ${orders.fullName} ILIKE ${searchTerm} OR
            ${orders.email} ILIKE ${searchTerm} OR
            ${orders.orderNo} ILIKE ${searchTerm} OR
            ${orders.productName} ILIKE ${searchTerm}
          )`
        );
      }
      if (filters.startDate && filters.endDate) {
        conditions.push(
          sql`${orders.orderDate}::date >= ${filters.startDate}::date AND ${orders.orderDate}::date <= ${filters.endDate}::date`
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // ソートカラムをマップ
      const sortColumnMap = {
        order_date: orders.orderDate,
        order_no: orders.orderNo,
        product_name: orders.productName,
        full_name: orders.fullName,
        total_price: orders.totalPrice,
        price: orders.price,
      };
      const sortColumn = sortColumnMap[sortBy] || orders.orderDate;
      const orderFn = sortOrder === 'asc' ? asc : desc;

      // 総件数を取得
      const countResult = await db
        .select({ count: sql`count(*)` })
        .from(orders)
        .where(whereClause);
      const total = parseInt(countResult[0].count, 10);

      // データ取得
      const offset = (page - 1) * limit;
      const rows = await db
        .select()
        .from(orders)
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
   * 注文番号で検索
   * @param {string} orderNo - 注文番号
   * @returns {Promise<Array>} 該当する注文の配列（ラインアイテムごとにレコードがあるため配列）
   */
  async findByOrderNo(orderNo) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(orders)
        .where(eq(orders.orderNo, orderNo));

      return rows.map(row => this._toSnakeCase(row));
    } catch (error) {
      console.error('Error in findByOrderNo:', error);
      return [];
    }
  }

  /**
   * LineItemIDで検索
   * @param {string} lineItemId - LineItem ID
   * @returns {Promise<Object|null>} 注文、またはnull
   */
  async findByLineItemId(lineItemId) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(orders)
        .where(eq(orders.lineItemId, lineItemId));

      if (rows.length === 0) {
        return null;
      }

      return this._toSnakeCase(rows[0]);
    } catch (error) {
      console.error('Error in findByLineItemId:', error);
      return null;
    }
  }

  /**
   * IDで注文を取得
   * @param {number} id - 注文ID
   * @returns {Promise<Object|null>} 注文、またはnull
   */
  async findById(id) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(orders)
        .where(eq(orders.id, parseInt(id, 10)));

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
   * current_quantityを更新
   * @param {string} lineItemId - LineItem ID
   * @param {number} newQuantity - 新しい数量
   * @returns {Promise<Object>} 処理結果
   */
  async updateCurrentQuantity(lineItemId, newQuantity) {
    try {
      const db = getDb();

      await db
        .update(orders)
        .set({
          currentQuantity: newQuantity,
          updatedAt: new Date(),
        })
        .where(eq(orders.lineItemId, lineItemId));

      return { success: true, lineItemId, newQuantity };
    } catch (error) {
      console.error('Error in updateCurrentQuantity:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Shopifyからエクスポートしたデータを保存
   * @param {Array<object>} orderRows - 注文データ配列 { baseData, tags }
   * @returns {Promise<Object>} 処理結果
   */
  async exportFromShopify(orderRows) {
    try {
      const db = getDb();

      // 全レコードの values を配列に変換
      const allValues = orderRows.map(orderData => {
        const baseData = orderData.baseData;
        return {
          orderNo: baseData[0],        // order_no
          orderDate: baseData[1],       // order_date
          shopifyId: baseData[2],       // shopify_id
          fullName: baseData[3],        // full_name
          email: baseData[4],           // email
          totalPrice: baseData[5],      // total_price
          financialStatus: baseData[6], // financial_status
          fulfillmentStatus: baseData[7], // fulfillment_status
          productName: baseData[8],     // product_name
          variant: baseData[9],         // variant
          quantity: parseInt(baseData[10], 10) || 0, // quantity
          currentQuantity: parseInt(baseData[11], 10) || 0, // current_quantity
          price: baseData[12],          // price
          lineItemId: baseData[13],     // line_item_id
          backStagePass: parseInt(baseData[14], 10) || 0, // back_stage_pass
          ...this._tagsToColumns(orderData.tags),
        };
      });

      // チャンク分割してバッチINSERT（PostgreSQLパラメータ上限対策）
      const CHUNK_SIZE = 500;
      for (let i = 0; i < allValues.length; i += CHUNK_SIZE) {
        const chunk = allValues.slice(i, i + CHUNK_SIZE);
        await db.insert(orders).values(chunk);
      }

      return { success: true, imported: allValues.length };
    } catch (error) {
      console.error('Error in exportFromShopify:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 全削除して一括追加
   * @param {Array<object>} orderRows - 注文データ配列 { baseData, tags }
   * @returns {Promise<Object>} 処理結果
   */
  async clearAndImport(orderRows) {
    try {
      const db = getDb();

      // 全削除
      await db.delete(orders);

      // 一括追加
      const result = await this.exportFromShopify(orderRows);

      return result;
    } catch (error) {
      console.error('Error in clearAndImport:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * フィルターオプションを取得
   * @returns {Promise<object>} フィルターオプション
   */
  async getFilterOptions() {
    try {
      const db = getDb();

      // 一意の商品名を取得
      const productNameRows = await db
        .selectDistinct({ productName: orders.productName })
        .from(orders)
        .where(sql`${orders.productName} IS NOT NULL AND ${orders.productName} != ''`)
        .orderBy(orders.productName);

      // 一意の支払いステータスを取得
      const financialRows = await db
        .selectDistinct({ financialStatus: orders.financialStatus })
        .from(orders)
        .where(sql`${orders.financialStatus} IS NOT NULL AND ${orders.financialStatus} != ''`)
        .orderBy(orders.financialStatus);

      // 一意の発送ステータスを取得
      const fulfillmentRows = await db
        .selectDistinct({ fulfillmentStatus: orders.fulfillmentStatus })
        .from(orders)
        .where(sql`${orders.fulfillmentStatus} IS NOT NULL AND ${orders.fulfillmentStatus} != ''`)
        .orderBy(orders.fulfillmentStatus);

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
   * エクスポートメタデータを保存
   * @param {Object} meta - メタデータ { searchTags, paidOnly, orderCount, rowCount }
   * @returns {Promise<Object>} 処理結果
   */
  async saveExportMeta(meta) {
    try {
      const db = getDb();

      await db.insert(orderExportMeta).values({
        searchTags: JSON.stringify(meta.searchTags || []),
        paidOnly: meta.paidOnly !== false,
        exportedAt: new Date(),
        orderCount: meta.orderCount || 0,
        rowCount: meta.rowCount || 0,
      });

      return { success: true };
    } catch (error) {
      console.error('Error in saveExportMeta:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 最新のエクスポートメタデータを取得
   * @returns {Promise<Object|null>} 最新のメタデータ、またはnull
   */
  async getLatestExportMeta() {
    try {
      const db = getDb();

      const rows = await db
        .select()
        .from(orderExportMeta)
        .orderBy(desc(orderExportMeta.exportedAt))
        .limit(1);

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      return {
        id: row.id,
        searchTags: row.searchTags ? JSON.parse(row.searchTags) : [],
        paidOnly: row.paidOnly,
        exportedAt: row.exportedAt,
        orderCount: row.orderCount,
        rowCount: row.rowCount,
      };
    } catch (error) {
      console.error('Error in getLatestExportMeta:', error);
      return null;
    }
  }

  /**
   * 現在のDBデータとメタデータを取得
   * @returns {Promise<Object>} 現在のデータ状況
   */
  async getCurrentStatus() {
    try {
      const db = getDb();

      // 現在の注文件数を取得
      const countResult = await db
        .select({ count: sql`count(*)` })
        .from(orders);
      const totalOrders = parseInt(countResult[0].count, 10);

      // 最新のエクスポートメタデータを取得（存在する場合）
      let latestMeta = await this.getLatestExportMeta();

      // メタデータがない場合、ordersテーブルから情報を取得
      if (!latestMeta && totalOrders > 0) {
        // 最新の作成日時を取得
        const latestOrderResult = await db
          .select({ createdAt: orders.createdAt })
          .from(orders)
          .orderBy(desc(orders.createdAt))
          .limit(1);

        // ユニークなタグを取得（tag1-tag10 の UNION）
        const uniqueTagsResult = await db.execute(sql`
          SELECT DISTINCT tag FROM (
            SELECT tag1 AS tag FROM orders WHERE tag1 IS NOT NULL AND tag1 != ''
            UNION SELECT tag2 FROM orders WHERE tag2 IS NOT NULL AND tag2 != ''
            UNION SELECT tag3 FROM orders WHERE tag3 IS NOT NULL AND tag3 != ''
            UNION SELECT tag4 FROM orders WHERE tag4 IS NOT NULL AND tag4 != ''
            UNION SELECT tag5 FROM orders WHERE tag5 IS NOT NULL AND tag5 != ''
            UNION SELECT tag6 FROM orders WHERE tag6 IS NOT NULL AND tag6 != ''
            UNION SELECT tag7 FROM orders WHERE tag7 IS NOT NULL AND tag7 != ''
            UNION SELECT tag8 FROM orders WHERE tag8 IS NOT NULL AND tag8 != ''
            UNION SELECT tag9 FROM orders WHERE tag9 IS NOT NULL AND tag9 != ''
            UNION SELECT tag10 FROM orders WHERE tag10 IS NOT NULL AND tag10 != ''
          ) t ORDER BY tag
        `);

        latestMeta = {
          id: null,
          searchTags: uniqueTagsResult.rows.map(r => r.tag),
          paidOnly: true,
          exportedAt: latestOrderResult[0]?.createdAt || null,
          orderCount: totalOrders,
          rowCount: totalOrders,
        };
      }

      return {
        success: true,
        totalOrders,
        latestExport: latestMeta,
      };
    } catch (error) {
      console.error('Error in getCurrentStatus:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = Order;
