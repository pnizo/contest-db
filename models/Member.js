const { getDb } = require('../lib/db');
const { members, pushSubscriptions } = require('../lib/db/schema');
const { eq, ilike, and, desc, asc, sql, isNotNull, ne } = require('drizzle-orm');

/**
 * Memberモデル - Neon Postgres / Drizzle ORM版
 */
class Member {
  /**
   * DBのcamelCaseをAPI用のsnake_caseに変換
   * @private
   */
  _toSnakeCase(row) {
    if (!row) return null;
    return {
      id: row.id,
      shopify_id: row.shopifyId,
      email: row.email,
      first_name: row.firstName,
      last_name: row.lastName,
      phone: row.phone,
      tags: row.tags,
      address1: row.address1,
      address2: row.address2,
      city: row.city,
      province: row.province,
      zip: row.zip,
      country: row.country,
      fwj_effectivedate: row.fwjEffectiveDate,
      fwj_birthday: row.fwjBirthday,
      fwj_card_no: row.fwjCardNo,
      fwj_nationality: row.fwjNationality,
      fwj_sex: row.fwjSex,
      fwj_firstname: row.fwjFirstName,
      fwj_lastname: row.fwjLastName,
      fwj_kanafirstname: row.fwjKanaFirstName,
      fwj_kanalastname: row.fwjKanaLastName,
      fwj_height: row.fwjHeight,
      fwj_weight: row.fwjWeight,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  }

  /**
   * 全メンバーを取得（emailがnullでないレコードのみ）
   * @returns {Promise<Array>} メンバー配列
   */
  async findAll() {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(members)
        .where(and(
          isNotNull(members.email),
          ne(members.email, '')
        ))
        .orderBy(desc(members.createdAt));

      return rows.map(row => this._toSnakeCase(row));
    } catch (error) {
      console.error('Error in findAll:', error);
      return [];
    }
  }

  async findAllUnfiltered() {
    const db = getDb();
    const rows = await db
      .select()
      .from(members)
      .orderBy(desc(members.createdAt));
    return rows.map(row => this._toSnakeCase(row));
  }

  /**
   * ページング・フィルタリング・ソート付きでメンバーを取得
   */
  async findWithPaging(page = 1, limit = 50, filters = {}, sortBy = 'created_at', sortOrder = 'desc') {
    try {
      const db = getDb();

      // フィルタ条件を構築
      const conditions = [
        isNotNull(members.email),
        ne(members.email, '')
      ];

      if (filters.search) {
        const searchTerm = `%${filters.search}%`;

        // 日本国内番号 (0始まり) → 国際番号 (+81) への変換
        const stripped = filters.search.replace(/[\s\-()]/g, '');
        const phoneSearchTerm = /^0\d+$/.test(stripped)
            ? `%+81${stripped.substring(1)}%`
            : searchTerm;

        conditions.push(
          sql`(
            ${members.shopifyId} ILIKE ${searchTerm} OR
            ${members.email} ILIKE ${searchTerm} OR
            ${members.firstName} ILIKE ${searchTerm} OR
            ${members.lastName} ILIKE ${searchTerm} OR
            ${members.phone} ILIKE ${searchTerm} OR
            ${members.phone} ILIKE ${phoneSearchTerm} OR
            ${members.fwjCardNo} ILIKE ${searchTerm} OR
            ${members.fwjFirstName} ILIKE ${searchTerm} OR
            ${members.fwjLastName} ILIKE ${searchTerm} OR
            ${members.fwjKanaFirstName} ILIKE ${searchTerm} OR
            ${members.fwjKanaLastName} ILIKE ${searchTerm}
          )`
        );
      }

      const whereClause = and(...conditions);

      // ソートカラムをマップ
      const sortColumnMap = {
        created_at: members.createdAt,
        updated_at: members.updatedAt,
        email: members.email,
        shopify_id: members.shopifyId,
        first_name: members.firstName,
        last_name: members.lastName,
        fwj_card_no: members.fwjCardNo,
      };
      const sortColumn = sortColumnMap[sortBy] || members.createdAt;
      const orderFn = sortOrder === 'asc' ? asc : desc;

      // 総件数を取得
      const countResult = await db
        .select({ count: sql`count(*)` })
        .from(members)
        .where(whereClause);
      const total = parseInt(countResult[0].count, 10);

      // データ取得
      const offset = (page - 1) * limit;
      const rows = await db
        .select()
        .from(members)
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(limit)
        .offset(offset);

      // push_subscriptions に登録がある shopify_id を取得
      const shopifyIds = rows.map(r => r.shopifyId).filter(Boolean);
      let pushEnabledIds = new Set();
      if (shopifyIds.length > 0) {
        const pushRows = await db
          .select({ shopifyId: pushSubscriptions.shopifyId })
          .from(pushSubscriptions)
          .where(sql`${pushSubscriptions.shopifyId} IN (${sql.join(shopifyIds.map(id => sql`${id}`), sql`, `)})`);
        pushEnabledIds = new Set(pushRows.map(r => r.shopifyId));
      }

      const data = rows.map(row => ({
        ...this._toSnakeCase(row),
        has_push_subscription: pushEnabledIds.has(row.shopifyId),
      }));
      const totalPages = Math.ceil(total / limit);

      return { data, total, page, limit, totalPages };
    } catch (error) {
      console.error('Error in findWithPaging:', error);
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }
  }

  /**
   * Shopify IDでメンバーを検索
   * @param {string} shopifyId - Shopify顧客ID
   * @returns {Promise<Object|null>} メンバー、またはnull
   */
  async findByShopifyId(shopifyId) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(members)
        .where(eq(members.shopifyId, String(shopifyId)));

      if (rows.length === 0) {
        return null;
      }

      return this._toSnakeCase(rows[0]);
    } catch (error) {
      console.error('Error in findByShopifyId:', error);
      return null;
    }
  }

  /**
   * Emailでメンバーを検索
   * @param {string} email - メールアドレス
   * @returns {Promise<Object|null>} メンバー、またはnull
   */
  async findByEmail(email) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(members)
        .where(eq(members.email, email));

      if (rows.length === 0) {
        return null;
      }

      return this._toSnakeCase(rows[0]);
    } catch (error) {
      console.error('Error in findByEmail:', error);
      return null;
    }
  }

  /**
   * FWJカード番号でメンバーを検索
   * @param {string} cardNo - FWJカード番号
   * @returns {Promise<Object|null>} メンバー、またはnull
   */
  async findByFwjCardNo(cardNo) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(members)
        .where(eq(members.fwjCardNo, cardNo));

      if (rows.length === 0) {
        return null;
      }

      return this._toSnakeCase(rows[0]);
    } catch (error) {
      console.error('Error in findByFwjCardNo:', error);
      return null;
    }
  }

  /**
   * Shopifyからのアップサート（新規作成または更新）
   * @param {object} memberData - メンバーデータ（snake_case）
   * @returns {Promise<Object>} 処理結果
   */
  async upsertFromShopify(membersDataArray) {
    try {
      const db = getDb();
      const CHUNK_SIZE = 500;

      // Phase 1: 全入力データを insertData 形式に変換
      const allData = membersDataArray.map(memberData => ({
        shopifyId: memberData.shopify_id,
        email: memberData.email,
        firstName: memberData.first_name || null,
        lastName: memberData.last_name || null,
        phone: memberData.phone || null,
        tags: memberData.tags || null,
        address1: memberData.address1 || null,
        address2: memberData.address2 || null,
        city: memberData.city || null,
        province: memberData.province || null,
        zip: memberData.zip || null,
        country: memberData.country || null,
        fwjEffectiveDate: memberData.fwj_effectivedate || null,
        fwjBirthday: memberData.fwj_birthday || null,
        fwjCardNo: memberData.fwj_card_no || null,
        fwjNationality: memberData.fwj_nationality || null,
        fwjSex: memberData.fwj_sex || null,
        fwjFirstName: memberData.fwj_firstname || null,
        fwjLastName: memberData.fwj_lastname || null,
        fwjKanaFirstName: memberData.fwj_kanafirstname || null,
        fwjKanaLastName: memberData.fwj_kanalastname || null,
        fwjHeight: memberData.fwj_height || null,
        fwjWeight: memberData.fwj_weight || null,
      }));

      // Phase 2: 既存データをMapに（shopifyId → row）
      const existingRows = await db.select().from(members);
      const existingMap = new Map();
      existingRows.forEach(row => {
        if (row.shopifyId) {
          existingMap.set(row.shopifyId, row);
        }
      });

      // Phase 3: INSERT/UPDATE を分類
      const updateList = [];
      const insertList = [];

      for (const data of allData) {
        const existing = existingMap.get(data.shopifyId);
        if (existing) {
          updateList.push({ data, existing });
        } else {
          insertList.push(data);
        }
      }

      // Phase 4: バッチ UPDATE（db.batch()）
      if (updateList.length > 0) {
        const updateQueries = updateList.map(({ data, existing }) =>
          db.update(members).set({
            ...data,
            updatedAt: new Date(),
          }).where(eq(members.id, existing.id))
        );

        for (let i = 0; i < updateQueries.length; i += CHUNK_SIZE) {
          const chunk = updateQueries.slice(i, i + CHUNK_SIZE);
          await db.batch(chunk);
        }
      }

      // Phase 5: バッチ INSERT（.values([...])）
      if (insertList.length > 0) {
        for (let i = 0; i < insertList.length; i += CHUNK_SIZE) {
          const chunk = insertList.slice(i, i + CHUNK_SIZE);
          await db.insert(members).values(chunk);
        }
      }

      return {
        success: true,
        created: insertList.length,
        updated: updateList.length,
        message: `FWJ会員情報を同期しました（新規: ${insertList.length}件、更新: ${updateList.length}件）`,
      };
    } catch (error) {
      console.error('Error in upsertFromShopify:', error);
      throw error;
    }
  }

  /**
   * 全てのメンバーをクリアして再同期
   * @param {Array<object>} membersData - メンバーデータ配列（snake_case）
   * @returns {Promise<Object>} 処理結果
   */
  async clearAllAndSync(membersData) {
    try {
      const db = getDb();

      // 全削除
      await db.delete(members);

      // 一括挿入
      if (membersData.length > 0) {
        const insertRows = membersData.map(m => ({
          shopifyId: m.shopify_id,
          email: m.email,
          firstName: m.first_name || null,
          lastName: m.last_name || null,
          phone: m.phone || null,
          tags: m.tags || null,
          address1: m.address1 || null,
          address2: m.address2 || null,
          city: m.city || null,
          province: m.province || null,
          zip: m.zip || null,
          country: m.country || null,
          fwjEffectiveDate: m.fwj_effectivedate || null,
          fwjBirthday: m.fwj_birthday || null,
          fwjCardNo: m.fwj_card_no || null,
          fwjNationality: m.fwj_nationality || null,
          fwjSex: m.fwj_sex || null,
          fwjFirstName: m.fwj_firstname || null,
          fwjLastName: m.fwj_lastname || null,
          fwjKanaFirstName: m.fwj_kanafirstname || null,
          fwjKanaLastName: m.fwj_kanalastname || null,
          fwjHeight: m.fwj_height || null,
          fwjWeight: m.fwj_weight || null,
        }));

        // バッチ挿入（500件ずつ）
        const batchSize = 500;
        for (let i = 0; i < insertRows.length; i += batchSize) {
          const batch = insertRows.slice(i, i + batchSize);
          await db.insert(members).values(batch);
        }
      }

      return { success: true, count: membersData.length, message: `${membersData.length}件のFWJ会員情報を同期しました` };
    } catch (error) {
      console.error('Error in clearAllAndSync:', error);
      throw error;
    }
  }
}

module.exports = Member;
