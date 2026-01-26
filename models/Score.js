const { getDb } = require('../lib/db');
const { scores } = require('../lib/db/schema');
const { eq, and, or, ilike, gte, lte, desc, asc, sql } = require('drizzle-orm');

class Score {
  constructor() {
    // Drizzle ORM使用
  }

  // DB行データをAPIレスポンス形式に変換
  _toResponse(row) {
    if (!row) return null;
    return {
      id: row.id,
      fwj_card_no: row.fwjCardNo || '',
      contest_date: row.contestDate || '',
      contest_name: row.contestName || '',
      contest_place: row.contestPlace || '',
      category_name: row.categoryName || '',
      placing: row.placing || '',
      player_no: row.playerNo || '',
      player_name: row.playerName || '',
      isValid: row.isValid ? 'TRUE' : 'FALSE',
      createdAt: row.createdAt ? row.createdAt.toISOString() : '',
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : '',
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : '',
      restoredAt: row.restoredAt ? row.restoredAt.toISOString() : '',
    };
  }

  async findAll() {
    const db = getDb();
    const rows = await db
      .select()
      .from(scores)
      .where(eq(scores.isValid, true))
      .orderBy(desc(scores.contestDate));

    return rows.map(row => this._toResponse(row));
  }

  async findAllIncludingDeleted() {
    const db = getDb();
    const rows = await db
      .select()
      .from(scores)
      .orderBy(desc(scores.contestDate));

    return rows.map(row => this._toResponse(row));
  }

  async findById(id) {
    const db = getDb();
    const rows = await db
      .select()
      .from(scores)
      .where(eq(scores.id, parseInt(id)));

    if (rows.length === 0) return null;
    return this._toResponse(rows[0]);
  }

  async findByFwjNo(fwjNo) {
    const db = getDb();
    const rows = await db
      .select()
      .from(scores)
      .where(and(
        eq(scores.fwjCardNo, fwjNo),
        eq(scores.isValid, true)
      ))
      .orderBy(desc(scores.contestDate));

    return rows.map(row => this._toResponse(row));
  }

  async findByContest(contestName) {
    const db = getDb();
    const rows = await db
      .select()
      .from(scores)
      .where(and(
        ilike(scores.contestName, `%${contestName}%`),
        eq(scores.isValid, true)
      ))
      .orderBy(desc(scores.contestDate));

    return rows.map(row => this._toResponse(row));
  }

  async findByCategory(categoryName) {
    const db = getDb();
    const rows = await db
      .select()
      .from(scores)
      .where(and(
        ilike(scores.categoryName, `%${categoryName}%`),
        eq(scores.isValid, true)
      ))
      .orderBy(desc(scores.contestDate));

    return rows.map(row => this._toResponse(row));
  }

  async findByPlayerName(playerName) {
    const db = getDb();
    const rows = await db
      .select()
      .from(scores)
      .where(and(
        ilike(scores.playerName, `%${playerName}%`),
        eq(scores.isValid, true)
      ))
      .orderBy(desc(scores.contestDate));

    return rows.map(row => this._toResponse(row));
  }

  async findByDateRange(startDate, endDate) {
    const db = getDb();
    const rows = await db
      .select()
      .from(scores)
      .where(and(
        gte(scores.contestDate, startDate),
        lte(scores.contestDate, endDate),
        eq(scores.isValid, true)
      ))
      .orderBy(desc(scores.contestDate));

    return rows.map(row => this._toResponse(row));
  }

  // 複合キーでの検索
  async findByCompositeKey(fwjNo, contestDate, contestName, categoryName) {
    const db = getDb();
    const rows = await db
      .select()
      .from(scores)
      .where(and(
        eq(scores.fwjCardNo, fwjNo),
        eq(scores.contestDate, contestDate),
        eq(scores.contestName, contestName),
        eq(scores.categoryName, categoryName)
      ));

    if (rows.length === 0) return null;
    return this._toResponse(rows[0]);
  }

  async findWithPaging(page = 1, limit = 50, filters = {}, sortBy = 'contest_date', sortOrder = 'desc') {
    const db = getDb();

    let conditions = [eq(scores.isValid, true)];

    // フィルター条件
    if (filters.fwj_card_no) {
      conditions.push(eq(scores.fwjCardNo, filters.fwj_card_no));
    }
    if (filters.contest_name) {
      conditions.push(eq(scores.contestName, filters.contest_name));
    }
    if (filters.category_name) {
      conditions.push(eq(scores.categoryName, filters.category_name));
    }
    if (filters.startDate) {
      conditions.push(gte(scores.contestDate, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(scores.contestDate, filters.endDate));
    }
    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(scores.playerName, searchTerm),
          ilike(scores.contestName, searchTerm),
          ilike(scores.categoryName, searchTerm),
          ilike(scores.fwjCardNo, searchTerm)
        )
      );
    }

    // 総数を取得
    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(scores)
      .where(and(...conditions));

    const total = parseInt(countResult[0].count);

    // 数値ソートが必要なカラム
    const numericSortColumns = ['placing', 'player_no'];

    // ソート式を構築
    let orderByExpr;
    if (numericSortColumns.includes(sortBy)) {
      // 数値としてソート（NULLや空文字は最後に）
      // "placing"は予約語なのでクォートが必要
      const columnName = sortBy === 'placing' ? '"placing"' : 'player_no';
      if (sortOrder === 'asc') {
        orderByExpr = sql`NULLIF(${sql.raw(columnName)}, '')::INTEGER ASC NULLS LAST`;
      } else {
        orderByExpr = sql`NULLIF(${sql.raw(columnName)}, '')::INTEGER DESC NULLS LAST`;
      }
    } else {
      // 通常のソート
      const sortColumnMap = {
        'contest_date': scores.contestDate,
        'contest_name': scores.contestName,
        'category_name': scores.categoryName,
        'player_name': scores.playerName,
        'fwj_card_no': scores.fwjCardNo,
      };
      const sortColumn = sortColumnMap[sortBy] || scores.contestDate;
      const orderFn = sortOrder === 'asc' ? asc : desc;
      orderByExpr = orderFn(sortColumn);
    }

    // データを取得
    const rows = await db
      .select()
      .from(scores)
      .where(and(...conditions))
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

  async validateScore(scoreData) {
    const errors = [];

    // 複合キーの検証
    if (!scoreData.fwj_card_no || scoreData.fwj_card_no.trim() === '') {
      errors.push('FWJカード番号は必須です');
    }

    if (!scoreData.contest_name || scoreData.contest_name.trim() === '') {
      errors.push('大会名は必須です');
    }

    if (!scoreData.category_name || scoreData.category_name.trim() === '') {
      errors.push('カテゴリー名は必須です');
    }

    if (!scoreData.contest_date) {
      errors.push('開催日は必須です');
    } else {
      const date = new Date(scoreData.contest_date);
      if (isNaN(date.getTime())) {
        errors.push('有効な開催日を入力してください');
      }
    }

    // 順位関連の検証
    if (scoreData.placing !== undefined && scoreData.placing !== '') {
      const placing = parseInt(scoreData.placing);
      if (isNaN(placing) || placing < 1) {
        errors.push('順位は1以上の整数である必要があります');
      }
    }

    return { isValid: errors.length === 0, errors, scoreData };
  }

  async createScore(scoreData) {
    // CSVのnpcj_noをfwj_card_noにマッピング
    if (scoreData.npcj_no && !scoreData.fwj_card_no) {
      scoreData.fwj_card_no = scoreData.npcj_no;
      delete scoreData.npcj_no;
    }

    const validation = await this.validateScore(scoreData);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    // 複合キーで削除済みデータを検索
    const existingDeletedScore = await this.findByCompositeKey(
      validation.scoreData.fwj_card_no,
      validation.scoreData.contest_date,
      validation.scoreData.contest_name,
      validation.scoreData.category_name
    );

    if (existingDeletedScore && existingDeletedScore.isValid === 'FALSE') {
      // 削除済みデータを復元
      const result = await this.update(existingDeletedScore.id, {
        ...validation.scoreData,
        isValid: 'TRUE',
        restoredAt: new Date().toISOString()
      });
      if (result.success) {
        return { success: true, data: result.data, restored: true };
      }
      return result;
    }

    return await this.create(validation.scoreData);
  }

  async create(data) {
    const db = getDb();

    try {
      const now = new Date();
      const insertData = {
        fwjCardNo: data.fwj_card_no,
        contestDate: data.contest_date,
        contestName: data.contest_name,
        contestPlace: data.contest_place || null,
        categoryName: data.category_name,
        placing: data.placing || null,
        playerNo: data.player_no || null,
        playerName: data.player_name || null,
        isValid: true,
        createdAt: now,
        updatedAt: now,
      };

      const result = await db
        .insert(scores)
        .values(insertData)
        .returning();

      return { success: true, data: this._toResponse(result[0]) };
    } catch (error) {
      console.error('Score create error:', error);
      return { success: false, error: error.message };
    }
  }

  async update(id, data) {
    const db = getDb();

    try {
      const updateData = {
        updatedAt: new Date(),
      };

      if (data.fwj_card_no !== undefined) updateData.fwjCardNo = data.fwj_card_no;
      if (data.contest_date !== undefined) updateData.contestDate = data.contest_date;
      if (data.contest_name !== undefined) updateData.contestName = data.contest_name;
      if (data.contest_place !== undefined) updateData.contestPlace = data.contest_place || null;
      if (data.category_name !== undefined) updateData.categoryName = data.category_name;
      if (data.placing !== undefined) updateData.placing = data.placing || null;
      if (data.player_no !== undefined) updateData.playerNo = data.player_no || null;
      if (data.player_name !== undefined) updateData.playerName = data.player_name || null;

      if (data.isValid !== undefined) {
        updateData.isValid = data.isValid === 'TRUE' || data.isValid === true;
      }
      if (data.deletedAt !== undefined) {
        updateData.deletedAt = data.deletedAt ? new Date(data.deletedAt) : null;
      }
      if (data.restoredAt !== undefined) {
        updateData.restoredAt = data.restoredAt ? new Date(data.restoredAt) : null;
      }

      const result = await db
        .update(scores)
        .set(updateData)
        .where(eq(scores.id, parseInt(id)))
        .returning();

      if (result.length === 0) {
        return { success: false, error: '成績が見つかりません' };
      }

      return { success: true, data: this._toResponse(result[0]) };
    } catch (error) {
      console.error('Score update error:', error);
      return { success: false, error: error.message };
    }
  }

  async softDelete(id) {
    const score = await this.findById(id);
    if (!score) {
      return { success: false, error: '成績が見つかりません' };
    }

    if (score.isValid === 'FALSE') {
      return { success: false, error: '成績は既に削除されています' };
    }

    return await this.update(id, {
      isValid: 'FALSE',
      deletedAt: new Date().toISOString()
    });
  }

  async delete(id) {
    const db = getDb();

    try {
      const result = await db
        .delete(scores)
        .where(eq(scores.id, parseInt(id)))
        .returning();

      if (result.length === 0) {
        return { success: false, error: '成績が見つかりません' };
      }

      return { success: true };
    } catch (error) {
      console.error('Score delete error:', error);
      return { success: false, error: error.message };
    }
  }

  validateHeaders(csvData) {
    if (!csvData || csvData.length === 0) {
      return { isValid: false, error: 'データが空です' };
    }

    const requiredHeaders = [
      'fwj_card_no',
      'contest_date',
      'contest_name',
      'contest_place',
      'category_name',
      'placing',
      'player_no',
      'player_name'
    ];

    const firstRow = csvData[0];
    const headers = Object.keys(firstRow);

    console.log('CSV headers found:', headers);
    console.log('Required headers:', requiredHeaders);

    const missingRequired = requiredHeaders.filter(required =>
      !headers.find(header => header.trim().toLowerCase() === required.trim().toLowerCase())
    );

    // NPCJ番号からFWJ番号への移行対応
    if (missingRequired.includes('fwj_card_no')) {
      const hasFwjNo = headers.some(header => header.trim() === 'npcj_no');
      if (hasFwjNo) {
        const index = missingRequired.indexOf('fwj_card_no');
        missingRequired.splice(index, 1);
        console.log('Using npcj_no as substitute for fwj_card_no');
      }
    }

    if (missingRequired.length > 0) {
      return {
        isValid: false,
        error: `必須ヘッダーが不足しています: ${missingRequired.join(', ')}\n\n期待される全ヘッダー:\n${requiredHeaders.join(', ')} (npcj_noをfwj_card_noの代替として使用可能)\n\n見つかったヘッダー:\n${headers.join(', ')}`
      };
    }

    return {
      isValid: true,
      warnings: []
    };
  }

  async batchImport(csvData) {
    try {
      console.log(`Starting batch import with ${csvData.length} records`);

      if (!Array.isArray(csvData) || csvData.length === 0) {
        return { success: false, error: 'インポートするデータがありません' };
      }

      const db = getDb();
      const now = new Date();

      // バルクインサート用のデータを準備
      const insertData = csvData.map(row => ({
        fwjCardNo: row.fwj_card_no || '',
        contestDate: row.contest_date || '',
        contestName: row.contest_name || '',
        contestPlace: row.contest_place || null,
        categoryName: row.category_name || '',
        placing: row.placing || null,
        playerNo: row.player_no || null,
        playerName: row.player_name || null,
        isValid: true,
        createdAt: now,
        updatedAt: now,
      }));

      // バルクインサート
      await db.insert(scores).values(insertData);

      console.log('Import completed successfully');

      return {
        success: true,
        data: {
          total: csvData.length,
          imported: insertData.length,
        }
      };

    } catch (error) {
      console.error('Batch import error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = Score;
