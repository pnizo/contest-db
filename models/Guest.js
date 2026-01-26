const { getDb } = require('../lib/db');
const { guests, contests } = require('../lib/db/schema');
const { eq, ilike, and, desc, asc, sql } = require('drizzle-orm');

/**
 * ゲストモデル - Neon Postgres / Drizzle ORM版
 */
class Guest {
  /**
   * DBのcamelCaseをAPI用のsnake_caseに変換
   * @private
   */
  _toSnakeCase(row) {
    if (!row) return null;
    return {
      id: row.id,
      contest_date: row.contestDate,
      contest_name: row.contestName,
      ticket_type: row.ticketType,
      group_type: row.groupType,
      name_ja: row.nameJa,
      pass_type: row.passType,
      company_ja: row.companyJa,
      request_type: row.requestType,
      ticket_count: row.ticketCount,
      is_checked_in: row.isCheckedIn,
      note: row.note,
      email: row.email,
      phone: row.phone,
      contact_person: row.contactPerson,
      is_pre_notified: row.isPreNotified,
      is_post_mailed: row.isPostMailed,
      isValid: row.isValid,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
      restoredAt: row.restoredAt,
    };
  }

  /**
   * 全ゲストを取得（有効なレコードのみ）
   */
  async findAll() {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(guests)
        .where(
          and(
            eq(guests.isValid, true),
            sql`${guests.nameJa} IS NOT NULL AND ${guests.nameJa} != ''`
          )
        );

      return rows.map(row => this._toSnakeCase(row));
    } catch (error) {
      console.error('Error in Guest.findAll:', error);
      return [];
    }
  }

  /**
   * ページング・フィルタリング・ソート付きでゲストを取得
   */
  async findWithPaging(page = 1, limit = 50, filters = {}, sortBy = 'contest_name', sortOrder = 'asc') {
    try {
      const db = getDb();

      // フィルタ条件を構築
      const conditions = [
        eq(guests.isValid, true),
        sql`${guests.nameJa} IS NOT NULL AND ${guests.nameJa} != ''`
      ];

      if (filters.contest_name) {
        conditions.push(ilike(guests.contestName, `%${filters.contest_name}%`));
      }
      if (filters.organization_type) {
        conditions.push(ilike(guests.groupType, `%${filters.organization_type}%`));
      }
      if (filters.pass_type) {
        conditions.push(ilike(guests.passType, `%${filters.pass_type}%`));
      }
      if (filters.representative_name) {
        conditions.push(ilike(guests.nameJa, `%${filters.representative_name}%`));
      }
      if (filters.organization_name) {
        conditions.push(ilike(guests.companyJa, `%${filters.organization_name}%`));
      }
      if (filters.search) {
        const searchTerm = `%${filters.search}%`;
        conditions.push(
          sql`(
            ${guests.nameJa} ILIKE ${searchTerm} OR
            ${guests.companyJa} ILIKE ${searchTerm} OR
            ${guests.contactPerson} ILIKE ${searchTerm} OR
            ${guests.email} ILIKE ${searchTerm}
          )`
        );
      }

      const whereClause = and(...conditions);

      // ソートカラムをマップ
      const sortColumnMap = {
        contest_name: guests.contestName,
        contest_date: guests.contestDate,
        name_ja: guests.nameJa,
        company_ja: guests.companyJa,
        ticket_count: guests.ticketCount,
        pass_type: guests.passType,
        group_type: guests.groupType,
      };
      const sortColumn = sortColumnMap[sortBy] || guests.contestName;
      const orderFn = sortOrder === 'asc' ? asc : desc;

      // 総件数を取得
      const countResult = await db
        .select({ count: sql`count(*)` })
        .from(guests)
        .where(whereClause);
      const total = parseInt(countResult[0].count, 10);

      // データ取得
      const offset = (page - 1) * limit;
      const rows = await db
        .select()
        .from(guests)
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(limit)
        .offset(offset);

      const data = rows.map(row => this._toSnakeCase(row));
      const totalPages = Math.ceil(total / limit);

      return { data, total, page, limit, totalPages };
    } catch (error) {
      console.error('Error in Guest.findWithPaging:', error);
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }
  }

  /**
   * フィルターオプションの取得
   */
  async getFilterOptions() {
    try {
      const db = getDb();

      // Contestsテーブルから大会名を取得（開催日の降順）
      const contestRows = await db
        .select({
          contestName: contests.contestName,
          contestDate: contests.contestDate,
        })
        .from(contests)
        .where(sql`${contests.contestName} IS NOT NULL AND ${contests.contestName} != ''`)
        .orderBy(desc(contests.contestDate));

      // 大会名でグループ化し、各大会の最新の開催日を取得
      const contestMap = new Map();
      contestRows.forEach(item => {
        if (!contestMap.has(item.contestName) || 
            new Date(item.contestDate) > new Date(contestMap.get(item.contestName))) {
          contestMap.set(item.contestName, item.contestDate);
        }
      });

      // 開催日の降順で並び替え
      const contestNames = Array.from(contestMap.entries())
        .sort((a, b) => new Date(b[1]) - new Date(a[1]))
        .map(entry => entry[0]);

      // 組織タイプを取得
      const orgTypeRows = await db
        .selectDistinct({ groupType: guests.groupType })
        .from(guests)
        .where(
          and(
            eq(guests.isValid, true),
            sql`${guests.groupType} IS NOT NULL AND ${guests.groupType} != ''`
          )
        );

      // パスタイプを取得
      const passTypeRows = await db
        .selectDistinct({ passType: guests.passType })
        .from(guests)
        .where(
          and(
            eq(guests.isValid, true),
            sql`${guests.passType} IS NOT NULL AND ${guests.passType} != ''`
          )
        );

      return {
        contestNames,
        organizationTypes: orgTypeRows.map(r => r.groupType),
        passTypes: passTypeRows.map(r => r.passType),
      };
    } catch (error) {
      console.error('Error in getFilterOptions:', error);
      return {
        contestNames: [],
        organizationTypes: [],
        passTypes: [],
      };
    }
  }

  /**
   * IDでゲストを取得
   */
  async findById(id) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(guests)
        .where(eq(guests.id, parseInt(id, 10)));

      if (rows.length === 0) {
        return null;
      }

      return this._toSnakeCase(rows[0]);
    } catch (error) {
      console.error('Error in Guest.findById:', error);
      return null;
    }
  }

  /**
   * 新規作成
   */
  async create(guestData) {
    try {
      const db = getDb();

      const insertResult = await db
        .insert(guests)
        .values({
          contestDate: guestData.contest_date || null,
          contestName: guestData.contest_name || null,
          ticketType: guestData.ticket_type || null,
          groupType: guestData.group_type || null,
          nameJa: guestData.name_ja,
          passType: guestData.pass_type || null,
          companyJa: guestData.company_ja || null,
          requestType: guestData.request_type || null,
          ticketCount: parseInt(guestData.ticket_count, 10) || 0,
          isCheckedIn: guestData.is_checked_in === true || guestData.is_checked_in === 'TRUE',
          note: guestData.note || null,
          email: guestData.email || null,
          phone: guestData.phone || null,
          contactPerson: guestData.contact_person || null,
          isPreNotified: guestData.is_pre_notified === true || guestData.is_pre_notified === 'TRUE',
          isPostMailed: guestData.is_post_mailed === true || guestData.is_post_mailed === 'TRUE',
          isValid: true,
        })
        .returning({ id: guests.id });

      return { 
        success: true, 
        message: 'ゲストレコードを追加しました',
        id: insertResult[0]?.id 
      };
    } catch (error) {
      console.error('Error in Guest.create:', error);
      throw error;
    }
  }

  /**
   * IDで更新
   */
  async update(id, guestData) {
    try {
      const db = getDb();

      const updateData = { updatedAt: new Date() };

      // フィールドマッピング
      const fieldMap = {
        contest_date: 'contestDate',
        contest_name: 'contestName',
        ticket_type: 'ticketType',
        group_type: 'groupType',
        name_ja: 'nameJa',
        pass_type: 'passType',
        company_ja: 'companyJa',
        request_type: 'requestType',
        ticket_count: 'ticketCount',
        is_checked_in: 'isCheckedIn',
        note: 'note',
        email: 'email',
        phone: 'phone',
        contact_person: 'contactPerson',
        is_pre_notified: 'isPreNotified',
        is_post_mailed: 'isPostMailed',
      };

      // Boolean型フィールド
      const booleanFields = ['is_checked_in', 'is_pre_notified', 'is_post_mailed'];

      for (const [snakeKey, value] of Object.entries(guestData)) {
        const camelKey = fieldMap[snakeKey];
        if (camelKey) {
          if (booleanFields.includes(snakeKey)) {
            updateData[camelKey] = value === true || value === 'TRUE' || value === '○';
          } else if (snakeKey === 'ticket_count') {
            updateData[camelKey] = parseInt(value, 10) || 0;
          } else {
            updateData[camelKey] = value;
          }
        }
      }

      await db
        .update(guests)
        .set(updateData)
        .where(eq(guests.id, parseInt(id, 10)));

      return { success: true, message: 'ゲストレコードを更新しました' };
    } catch (error) {
      console.error('Error in Guest.update:', error);
      throw error;
    }
  }

  /**
   * IDで削除（論理削除）
   */
  async deleteById(id) {
    try {
      const db = getDb();
      await db
        .update(guests)
        .set({ 
          isValid: false, 
          deletedAt: new Date(),
          updatedAt: new Date() 
        })
        .where(eq(guests.id, parseInt(id, 10)));

      return { success: true };
    } catch (error) {
      console.error('Error in deleteById:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * チェックイン状態を更新
   */
  async updateCheckinStatus(id, isCheckedIn) {
    try {
      const db = getDb();
      await db
        .update(guests)
        .set({ 
          isCheckedIn, 
          updatedAt: new Date() 
        })
        .where(eq(guests.id, parseInt(id, 10)));

      return { success: true };
    } catch (error) {
      console.error('Error in updateCheckinStatus:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = Guest;
