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
      score_t: row.scoreT,
      isValid: row.isValid ? 'TRUE' : 'FALSE',
      createdAt: row.createdAt ? row.createdAt.toISOString() : '',
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : '',
    };
  }

  // score_j1〜j5のうち最高点と最低点を除いた3つの合計を算出
  _calculateScoreT(j1, j2, j3, j4, j5) {
    const scores = [j1, j2, j3, j4, j5].filter(s => s != null);
    if (scores.length === 0) return null;
    if (scores.length <= 2) {
      // 2人以下の場合はそのまま合計
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
    const numericSortColumns = ['placing', 'player_no', 'score_j1', 'score_j2', 'score_j3', 'score_j4', 'score_j5', 'score_t'];

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
        isValid: true,
        createdAt: now,
        updatedAt: now,
      };

      // score_t を自動計算
      insertData.scoreT = this._calculateScoreT(
        insertData.scoreJ1, insertData.scoreJ2, insertData.scoreJ3,
        insertData.scoreJ4, insertData.scoreJ5
      );

      const result = await db
        .insert(judges)
        .values(insertData)
        .returning();

      // 同一大会・クラス内の placing を再計算
      await this._recalculatePlacing(insertData.contestName, insertData.className);

      // 再計算後の最新データを返す
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

      // score_j1〜j5のいずれかが更新された場合、score_tを再計算
      const scoreFields = ['score_j1', 'score_j2', 'score_j3', 'score_j4', 'score_j5'];
      const scoresChanged = scoreFields.some(f => data[f] !== undefined);
      if (scoresChanged) {
        const existing = await this.findById(id);
        const mergedScores = {
          j1: updateData.scoreJ1 !== undefined ? updateData.scoreJ1 : (existing.score_j1 != null ? existing.score_j1 : null),
          j2: updateData.scoreJ2 !== undefined ? updateData.scoreJ2 : (existing.score_j2 != null ? existing.score_j2 : null),
          j3: updateData.scoreJ3 !== undefined ? updateData.scoreJ3 : (existing.score_j3 != null ? existing.score_j3 : null),
          j4: updateData.scoreJ4 !== undefined ? updateData.scoreJ4 : (existing.score_j4 != null ? existing.score_j4 : null),
          j5: updateData.scoreJ5 !== undefined ? updateData.scoreJ5 : (existing.score_j5 != null ? existing.score_j5 : null),
        };
        updateData.scoreT = this._calculateScoreT(
          mergedScores.j1, mergedScores.j2, mergedScores.j3,
          mergedScores.j4, mergedScores.j5
        );
      }

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

      // スコアが変更された場合、同一大会・クラス内の placing を再計算
      if (scoresChanged) {
        await this._recalculatePlacing(result[0].contestName, result[0].className);
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
          scoreT: this._calculateScoreT(j1, j2, j3, j4, j5),
          isValid: true,
          createdAt: now,
          updatedAt: now,
        };
      });

      // score_t 昇順でソートして placing を付与（null は最後）
      insertData.sort((a, b) => {
        if (a.scoreT == null && b.scoreT == null) return 0;
        if (a.scoreT == null) return 1;
        if (b.scoreT == null) return -1;
        return a.scoreT - b.scoreT;
      });
      insertData.forEach((row, i) => {
        row.placing = i + 1;
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
