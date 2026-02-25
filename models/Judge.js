const { getDb } = require('../lib/db');
const { judges } = require('../lib/db/schema');
const { eq, and, or, ilike, desc, asc, sql } = require('drizzle-orm');

class Judge {
  constructor() {
    // Drizzle ORM使用
  }

  // DB行データをAPIレスポンス形式に変換
  _toResponse(row) {
    if (!row) return null;
    return {
      id: row.id,
      contest_name: row.contestName || '',
      contest_date: row.contestDate || '',
      class_name: row.className || '',
      player_no: row.playerNo,
      player_name: row.playerName || '',
      placing: row.placing,
      score_j1: row.scoreJ1,
      score_j2: row.scoreJ2,
      score_j3: row.scoreJ3,
      score_j4: row.scoreJ4,
      score_j5: row.scoreJ5,
      score_j6: row.scoreJ6,
      score_j7: row.scoreJ7,
      score_t: row.scoreT,
      isValid: row.isValid ? 'TRUE' : 'FALSE',
      createdAt: row.createdAt ? row.createdAt.toISOString() : '',
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : '',
    };
  }

  // score_j1〜j7の合計を算出
  // excludeMinMax=true: 最高点と最低点を除外（3人以上の場合）
  // excludeMinMax=false: 全スコアの単純合計
  _calculateScoreT(j1, j2, j3, j4, j5, j6, j7, excludeMinMax = false) {
    const scores = [j1, j2, j3, j4, j5, j6, j7].filter(s => s != null);
    if (scores.length === 0) return null;
    if (!excludeMinMax || scores.length <= 2) {
      return scores.reduce((a, b) => a + b, 0);
    }
    // 3人以上：最高点と最低点を1つずつ除外して合計
    scores.sort((a, b) => a - b);
    const middle = scores.slice(1, scores.length - 1);
    return middle.reduce((a, b) => a + b, 0);
  }

  // 同一大会・同一クラス内の全レコードの placing を score_t 昇順で再計算
  async _recalculatePlacing(contestName, className) {
    const db = getDb();

    const rows = await db
      .select({ id: judges.id, scoreT: judges.scoreT })
      .from(judges)
      .where(and(
        eq(judges.contestName, contestName),
        eq(judges.className, className),
        eq(judges.isValid, true)
      ))
      .orderBy(sql`score_t ASC NULLS LAST`);

    for (let i = 0; i < rows.length; i++) {
      await db
        .update(judges)
        .set({ placing: i + 1 })
        .where(eq(judges.id, rows[i].id));
    }
  }

  async findAll(includeInvalid = false) {
    const db = getDb();
    let query = db.select().from(judges);

    if (!includeInvalid) {
      query = query.where(eq(judges.isValid, true));
    }

    const rows = await query.orderBy(desc(judges.createdAt));
    return rows.map(row => this._toResponse(row));
  }

  async findById(id) {
    const db = getDb();
    const rows = await db
      .select()
      .from(judges)
      .where(eq(judges.id, parseInt(id)));

    if (rows.length === 0) return null;
    return this._toResponse(rows[0]);
  }

  async findWithPaging(page = 1, limit = 50, filters = {}, sortBy = 'created_at', sortOrder = 'desc') {
    const db = getDb();

    let conditions = [];

    // showInvalid フィルター
    if (!filters.showInvalid) {
      conditions.push(eq(judges.isValid, true));
    }

    // フィルター条件
    if (filters.contest_name) {
      conditions.push(eq(judges.contestName, filters.contest_name));
    }
    if (filters.class_name) {
      conditions.push(eq(judges.className, filters.class_name));
    }
    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(judges.playerName, searchTerm),
          sql`${judges.playerNo}::text ILIKE ${searchTerm}`
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 総数を取得
    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(judges)
      .where(whereClause);

    const total = parseInt(countResult[0].count);

    // 数値ソートが必要なカラム
    const numericSortColumns = ['placing', 'player_no', 'score_j1', 'score_j2', 'score_j3', 'score_j4', 'score_j5', 'score_j6', 'score_j7', 'score_t'];

    // ソート式を構築
    let orderByExpr;
    if (numericSortColumns.includes(sortBy)) {
      const columnMap = {
        'placing': '"placing"',
        'player_no': 'player_no',
        'score_j1': 'score_j1',
        'score_j2': 'score_j2',
        'score_j3': 'score_j3',
        'score_j4': 'score_j4',
        'score_j5': 'score_j5',
        'score_j6': 'score_j6',
        'score_j7': 'score_j7',
        'score_t': 'score_t',
      };
      const columnName = columnMap[sortBy] || sortBy;
      if (sortOrder === 'asc') {
        orderByExpr = sql`${sql.raw(columnName)} ASC NULLS LAST`;
      } else {
        orderByExpr = sql`${sql.raw(columnName)} DESC NULLS LAST`;
      }
    } else {
      const sortColumnMap = {
        'contest_name': judges.contestName,
        'contest_date': judges.contestDate,
        'class_name': judges.className,
        'player_name': judges.playerName,
        'created_at': judges.createdAt,
      };
      const sortColumn = sortColumnMap[sortBy] || judges.createdAt;
      const orderFn = sortOrder === 'asc' ? asc : desc;
      orderByExpr = orderFn(sortColumn);
    }

    // データを取得
    const rows = await db
      .select()
      .from(judges)
      .where(whereClause)
      .orderBy(orderByExpr)
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      data: rows.map(row => this._toResponse(row)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data) {
    const db = getDb();

    try {
      const now = new Date();
      const insertData = {
        contestName: data.contest_name,
        contestDate: data.contest_date || null,
        className: data.class_name,
        playerNo: parseInt(data.player_no),
        playerName: data.player_name || null,
        placing: 0,
        scoreJ1: data.score_j1 != null && data.score_j1 !== '' ? parseInt(data.score_j1) : null,
        scoreJ2: data.score_j2 != null && data.score_j2 !== '' ? parseInt(data.score_j2) : null,
        scoreJ3: data.score_j3 != null && data.score_j3 !== '' ? parseInt(data.score_j3) : null,
        scoreJ4: data.score_j4 != null && data.score_j4 !== '' ? parseInt(data.score_j4) : null,
        scoreJ5: data.score_j5 != null && data.score_j5 !== '' ? parseInt(data.score_j5) : null,
        scoreJ6: data.score_j6 != null && data.score_j6 !== '' ? parseInt(data.score_j6) : null,
        scoreJ7: data.score_j7 != null && data.score_j7 !== '' ? parseInt(data.score_j7) : null,
        scoreT: null,
        isValid: true,
        createdAt: now,
        updatedAt: now,
      };

      const result = await db
        .insert(judges)
        .values(insertData)
        .returning();

      return { success: true, data: await this.findById(result[0].id) };
    } catch (error) {
      console.error('Judge create error:', error);
      return { success: false, error: error.message };
    }
  }

  async update(id, data) {
    const db = getDb();

    try {
      const updateData = {
        updatedAt: new Date(),
      };

      if (data.contest_name !== undefined) updateData.contestName = data.contest_name;
      if (data.contest_date !== undefined) updateData.contestDate = data.contest_date || null;
      if (data.class_name !== undefined) updateData.className = data.class_name;
      if (data.player_no !== undefined) updateData.playerNo = parseInt(data.player_no);
      if (data.player_name !== undefined) updateData.playerName = data.player_name || null;
      if (data.score_j1 !== undefined) updateData.scoreJ1 = data.score_j1 != null && data.score_j1 !== '' ? parseInt(data.score_j1) : null;
      if (data.score_j2 !== undefined) updateData.scoreJ2 = data.score_j2 != null && data.score_j2 !== '' ? parseInt(data.score_j2) : null;
      if (data.score_j3 !== undefined) updateData.scoreJ3 = data.score_j3 != null && data.score_j3 !== '' ? parseInt(data.score_j3) : null;
      if (data.score_j4 !== undefined) updateData.scoreJ4 = data.score_j4 != null && data.score_j4 !== '' ? parseInt(data.score_j4) : null;
      if (data.score_j5 !== undefined) updateData.scoreJ5 = data.score_j5 != null && data.score_j5 !== '' ? parseInt(data.score_j5) : null;
      if (data.score_j6 !== undefined) updateData.scoreJ6 = data.score_j6 != null && data.score_j6 !== '' ? parseInt(data.score_j6) : null;
      if (data.score_j7 !== undefined) updateData.scoreJ7 = data.score_j7 != null && data.score_j7 !== '' ? parseInt(data.score_j7) : null;

      if (data.isValid !== undefined) {
        updateData.isValid = data.isValid === 'TRUE' || data.isValid === true;
      }

      const result = await db
        .update(judges)
        .set(updateData)
        .where(eq(judges.id, parseInt(id)))
        .returning();

      if (result.length === 0) {
        return { success: false, error: '審判採点データが見つかりません' };
      }

      return { success: true, data: await this.findById(parseInt(id)) };
    } catch (error) {
      console.error('Judge update error:', error);
      return { success: false, error: error.message };
    }
  }

  async softDelete(id) {
    const judge = await this.findById(id);
    if (!judge) {
      return { success: false, error: '審判採点データが見つかりません' };
    }

    if (judge.isValid === 'FALSE') {
      return { success: false, error: '審判採点データは既に削除されています' };
    }

    return await this.update(id, { isValid: 'FALSE' });
  }

  async restore(id) {
    const judge = await this.findById(id);
    if (!judge) {
      return { success: false, error: '審判採点データが見つかりません' };
    }

    return await this.update(id, { isValid: 'TRUE' });
  }

  async delete(id) {
    const db = getDb();

    try {
      const result = await db
        .delete(judges)
        .where(eq(judges.id, parseInt(id)))
        .returning();

      if (result.length === 0) {
        return { success: false, error: '審判採点データが見つかりません' };
      }

      return { success: true };
    } catch (error) {
      console.error('Judge delete error:', error);
      return { success: false, error: error.message };
    }
  }

  async batchImport(csvData, contestName, contestDate, className) {
    try {
      console.log(`Starting judges batch import: ${csvData.length} records for ${contestName} / ${className}`);

      if (!Array.isArray(csvData) || csvData.length === 0) {
        return { success: false, error: 'インポートするデータがありません' };
      }

      const db = getDb();
      const now = new Date();

      // 同じ contest_name + class_name の既存データを削除
      await db
        .delete(judges)
        .where(and(
          eq(judges.contestName, contestName),
          eq(judges.className, className)
        ));

      console.log(`Deleted existing data for ${contestName} / ${className}`);

      // バルクインサート用のデータを準備（score_t を計算）
      const insertData = csvData.map(row => {
        const j1 = row.score_j1 != null && row.score_j1 !== '' ? parseInt(row.score_j1) : null;
        const j2 = row.score_j2 != null && row.score_j2 !== '' ? parseInt(row.score_j2) : null;
        const j3 = row.score_j3 != null && row.score_j3 !== '' ? parseInt(row.score_j3) : null;
        const j4 = row.score_j4 != null && row.score_j4 !== '' ? parseInt(row.score_j4) : null;
        const j5 = row.score_j5 != null && row.score_j5 !== '' ? parseInt(row.score_j5) : null;
        const j6 = row.score_j6 != null && row.score_j6 !== '' ? parseInt(row.score_j6) : null;
        const j7 = row.score_j7 != null && row.score_j7 !== '' ? parseInt(row.score_j7) : null;
        return {
          contestName: contestName,
          contestDate: contestDate || null,
          className: className,
          playerNo: parseInt(row.player_no) || 0,
          playerName: row.player_name || null,
          placing: 0,
          scoreJ1: j1,
          scoreJ2: j2,
          scoreJ3: j3,
          scoreJ4: j4,
          scoreJ5: j5,
          scoreJ6: j6,
          scoreJ7: j7,
          scoreT: null,
          isValid: true,
          createdAt: now,
          updatedAt: now,
        };
      });

      // バルクインサート
      await db.insert(judges).values(insertData);

      console.log('Judges import completed successfully');

      return {
        success: true,
        data: {
          total: csvData.length,
          imported: insertData.length,
        }
      };

    } catch (error) {
      console.error('Judges batch import error:', error);
      return { success: false, error: error.message };
    }
  }

  async importFromRegistrations(registrations, contestName, contestDate) {
    try {
      console.log(`Starting judges import from registrations: ${registrations.length} records for ${contestName}`);

      if (!Array.isArray(registrations) || registrations.length === 0) {
        return { success: false, error: 'インポートするデータがありません' };
      }

      const db = getDb();
      const now = new Date();

      // 同じ contest_name の既存データを全て削除（クラスをまたいで上書き）
      await db
        .delete(judges)
        .where(eq(judges.contestName, contestName));

      console.log(`Deleted existing judges data for ${contestName}`);

      // Registrations を judges 行に変換
      const insertData = registrations.map(reg => ({
        contestName: contestName,
        contestDate: contestDate || null,
        className: reg.class_name || '',
        playerNo: parseInt(reg.player_no) || 0,
        playerName: reg.name_ja || null,
        placing: 0,
        scoreJ1: null,
        scoreJ2: null,
        scoreJ3: null,
        scoreJ4: null,
        scoreJ5: null,
        scoreJ6: null,
        scoreJ7: null,
        scoreT: null,
        isValid: true,
        createdAt: now,
        updatedAt: now,
      }));

      // バルクインサート
      await db.insert(judges).values(insertData);

      console.log('Judges import from registrations completed successfully');

      return {
        success: true,
        data: {
          total: registrations.length,
          imported: insertData.length,
        }
      };
    } catch (error) {
      console.error('Judges import from registrations error:', error);
      return { success: false, error: error.message };
    }
  }

  async getFilterOptions() {
    const db = getDb();

    const allJudges = await db
      .select()
      .from(judges)
      .where(eq(judges.isValid, true));

    const contestNames = [...new Set(
      allJudges
        .map(j => j.contestName)
        .filter(name => name && name.trim() !== '')
    )].sort();

    // 大会名→最新の開催日マッピング
    const contestDates = {};
    allJudges.forEach(j => {
      if (j.contestName && j.contestDate) {
        if (!contestDates[j.contestName] || j.contestDate > contestDates[j.contestName]) {
          contestDates[j.contestName] = j.contestDate;
        }
      }
    });

    const classNames = [...new Set(
      allJudges
        .map(j => j.className)
        .filter(name => name && name.trim() !== '')
    )].sort();

    return { contestNames, contestDates, classNames };
  }

  async recalculateScores(contestName, className, excludeMinMax = true) {
    const db = getDb();

    // 対象の全有効レコードを一括取得
    const conditions = [
      eq(judges.contestName, contestName),
      eq(judges.isValid, true)
    ];
    if (className) {
      conditions.push(eq(judges.className, className));
    }

    const rows = await db
      .select()
      .from(judges)
      .where(and(...conditions));

    // メモリ上で score_t を計算し、クラスごとにグループ化
    const classMap = new Map();
    const now = new Date();

    for (const row of rows) {
      const scoreT = this._calculateScoreT(
        row.scoreJ1, row.scoreJ2, row.scoreJ3,
        row.scoreJ4, row.scoreJ5, row.scoreJ6, row.scoreJ7,
        excludeMinMax
      );
      const entry = { id: row.id, scoreT };

      if (!classMap.has(row.className)) {
        classMap.set(row.className, []);
      }
      classMap.get(row.className).push(entry);
    }

    // クラスごとに placing をメモリ上で算出し、一括更新
    for (const [, entries] of classMap) {
      entries.sort((a, b) => {
        if (a.scoreT == null && b.scoreT == null) return 0;
        if (a.scoreT == null) return 1;
        if (b.scoreT == null) return -1;
        return a.scoreT - b.scoreT;
      });

      for (let i = 0; i < entries.length; i++) {
        await db
          .update(judges)
          .set({ scoreT: entries[i].scoreT, placing: i + 1, updatedAt: now })
          .where(eq(judges.id, entries[i].id));
      }
    }

    return { updatedCount: rows.length, classCount: classMap.size };
  }

  async findForExport(filters = {}) {
    const db = getDb();

    let conditions = [eq(judges.isValid, true)];

    if (filters.contest_name) {
      conditions.push(eq(judges.contestName, filters.contest_name));
    }
    if (filters.contest_date) {
      conditions.push(eq(judges.contestDate, filters.contest_date));
    }
    if (filters.class_name) {
      conditions.push(eq(judges.className, filters.class_name));
    }

    const rows = await db
      .select()
      .from(judges)
      .where(and(...conditions))
      .orderBy(asc(judges.placing));

    return rows.map(row => this._toResponse(row));
  }
}

module.exports = Judge;
