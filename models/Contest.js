const { getDb } = require('../lib/db');
const { contests } = require('../lib/db/schema');
const { eq, ilike, and, desc, asc, sql, gte, lte } = require('drizzle-orm');

/**
 * コンテストモデル - Neon Postgres / Drizzle ORM版
 */
class Contest {
  /**
   * DBのcamelCaseをAPI用のsnake_caseに変換
   * @private
   */
  _toSnakeCase(row) {
    if (!row) return null;
    return {
      id: row.id,
      contest_name: row.contestName,
      contest_date: row.contestDate,
      contest_place: row.contestPlace,
      is_ready: row.isReady,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  }

  /**
   * 全コンテストを取得
   */
  async findAll() {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(contests)
        .where(sql`${contests.contestName} IS NOT NULL AND ${contests.contestName} != ''`);

      return rows.map(row => this._toSnakeCase(row));
    } catch (error) {
      console.error('Error in findAll:', error);
      return [];
    }
  }

  /**
   * ページング・フィルタリング・ソート付きでコンテストを取得
   */
  async findWithPaging(page = 1, limit = 50, filters = {}, sortBy = 'contest_date', sortOrder = 'desc') {
    try {
      const db = getDb();

      // フィルタ条件を構築
      const conditions = [
        sql`${contests.contestName} IS NOT NULL AND ${contests.contestName} != ''`
      ];

      if (filters.contest_name) {
        conditions.push(ilike(contests.contestName, `%${filters.contest_name}%`));
      }
      if (filters.contest_place) {
        conditions.push(ilike(contests.contestPlace, `%${filters.contest_place}%`));
      }
      if (filters.search) {
        const searchTerm = `%${filters.search}%`;
        conditions.push(
          sql`(
            ${contests.contestName} ILIKE ${searchTerm} OR
            ${contests.contestPlace} ILIKE ${searchTerm}
          )`
        );
      }
      if (filters.startDate && filters.endDate) {
        conditions.push(gte(contests.contestDate, filters.startDate));
        conditions.push(lte(contests.contestDate, filters.endDate));
      }

      const whereClause = and(...conditions);

      // ソートカラムをマップ
      const sortColumnMap = {
        contest_date: contests.contestDate,
        contest_name: contests.contestName,
        contest_place: contests.contestPlace,
      };
      const sortColumn = sortColumnMap[sortBy] || contests.contestDate;
      const orderFn = sortOrder === 'asc' ? asc : desc;

      // 総件数を取得
      const countResult = await db
        .select({ count: sql`count(*)` })
        .from(contests)
        .where(whereClause);
      const total = parseInt(countResult[0].count, 10);

      // データ取得
      const offset = (page - 1) * limit;
      const rows = await db
        .select()
        .from(contests)
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
   * コンテスト名で検索
   */
  async findByName(contestName) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(contests)
        .where(eq(contests.contestName, contestName));

      if (rows.length === 0) {
        return null;
      }

      return this._toSnakeCase(rows[0]);
    } catch (error) {
      console.error('Error in findByName:', error);
      return null;
    }
  }

  /**
   * IDでコンテストを取得
   */
  async findById(id) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(contests)
        .where(eq(contests.id, parseInt(id, 10)));

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
   * 日付範囲でコンテストを検索
   */
  async findByDateRange(startDate, endDate) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(contests)
        .where(
          and(
            gte(contests.contestDate, startDate),
            lte(contests.contestDate, endDate),
            sql`${contests.contestName} IS NOT NULL AND ${contests.contestName} != ''`
          )
        )
        .orderBy(desc(contests.contestDate));

      return rows.map(row => this._toSnakeCase(row));
    } catch (error) {
      console.error('Error in findByDateRange:', error);
      return [];
    }
  }

  /**
   * 開催日順にソートされたコンテスト一覧を取得
   */
  async findAllSorted(order = 'desc') {
    try {
      const db = getDb();
      const orderFn = order === 'asc' ? asc : desc;
      const rows = await db
        .select()
        .from(contests)
        .where(sql`${contests.contestName} IS NOT NULL AND ${contests.contestName} != ''`)
        .orderBy(orderFn(contests.contestDate));

      return rows.map(row => this._toSnakeCase(row));
    } catch (error) {
      console.error('Error in findAllSorted:', error);
      return [];
    }
  }

  /**
   * 今日以降のコンテストを取得
   */
  async findUpcoming() {
    try {
      const db = getDb();
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD形式

      const rows = await db
        .select()
        .from(contests)
        .where(
          and(
            gte(contests.contestDate, today),
            sql`${contests.contestName} IS NOT NULL AND ${contests.contestName} != ''`
          )
        )
        .orderBy(asc(contests.contestDate));

      return rows.map(row => this._toSnakeCase(row));
    } catch (error) {
      console.error('Error in findUpcoming:', error);
      return [];
    }
  }

  /**
   * 新規作成
   */
  async create(contestData) {
    try {
      const db = getDb();

      const insertResult = await db
        .insert(contests)
        .values({
          contestName: contestData.contest_name,
          contestDate: contestData.contest_date,
          contestPlace: contestData.contest_place || '',
          isReady: contestData.is_ready === true || contestData.is_ready === 'true',
        })
        .returning({ id: contests.id });

      return { 
        success: true, 
        message: '大会情報を追加しました',
        id: insertResult[0]?.id 
      };
    } catch (error) {
      console.error('Error in Contest.create:', error);
      throw error;
    }
  }

  /**
   * IDで更新
   */
  async update(id, contestData) {
    try {
      const db = getDb();

      const updateData = { updatedAt: new Date() };

      if (contestData.contest_name !== undefined) {
        updateData.contestName = contestData.contest_name;
      }
      if (contestData.contest_date !== undefined) {
        updateData.contestDate = contestData.contest_date;
      }
      if (contestData.contest_place !== undefined) {
        updateData.contestPlace = contestData.contest_place;
      }
      if (contestData.is_ready !== undefined) {
        updateData.isReady = contestData.is_ready === true || contestData.is_ready === 'true';
      }

      await db
        .update(contests)
        .set(updateData)
        .where(eq(contests.id, parseInt(id, 10)));

      return { success: true, message: '大会情報を更新しました' };
    } catch (error) {
      console.error('Error in Contest.update:', error);
      throw error;
    }
  }

  /**
   * IDで削除
   */
  async deleteById(id) {
    try {
      const db = getDb();
      await db.delete(contests).where(eq(contests.id, parseInt(id, 10)));
      return { success: true };
    } catch (error) {
      console.error('Error in deleteById:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 開催地一覧を取得
   */
  async getPlaces() {
    try {
      const db = getDb();
      const rows = await db
        .selectDistinct({ contestPlace: contests.contestPlace })
        .from(contests)
        .where(sql`${contests.contestPlace} IS NOT NULL AND ${contests.contestPlace} != ''`)
        .orderBy(contests.contestPlace);

      return rows.map(r => r.contestPlace);
    } catch (error) {
      console.error('Error in getPlaces:', error);
      return [];
    }
  }
}

module.exports = Contest;
