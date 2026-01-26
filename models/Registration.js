const { getDb } = require('../lib/db');
const { registrations } = require('../lib/db/schema');
const { eq, and, or, ilike, gte, lte, desc, asc, sql } = require('drizzle-orm');

class Registration {
  constructor() {
    // Drizzle ORM使用
  }

  // DB行データをAPIレスポンス形式に変換
  _toResponse(row) {
    if (!row) return null;
    return {
      id: row.id,
      contest_date: row.contestDate || '',
      contest_name: row.contestName || '',
      player_no: row.playerNo || '',
      name_ja: row.nameJa || '',
      name_ja_kana: row.nameJaKana || '',
      fwj_card_no: row.fwjCardNo || '',
      first_name: row.firstName || '',
      last_name: row.lastName || '',
      email: row.email || '',
      phone: row.phone || '',
      country: row.country || '',
      age: row.age || '',
      class_name: row.className || '',
      sort_index: row.sortIndex || '',
      score_card: row.scoreCard || '',
      contest_order: row.contestOrder || '',
      height: row.height || '',
      weight: row.weight || '',
      occupation: row.occupation || '',
      instagram: row.instagram || '',
      biography: row.biography || '',
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
      .from(registrations)
      .where(eq(registrations.isValid, true))
      .orderBy(desc(registrations.contestDate));

    return rows.map(row => this._toResponse(row));
  }

  async findAllIncludingDeleted() {
    const db = getDb();
    const rows = await db
      .select()
      .from(registrations)
      .orderBy(desc(registrations.contestDate));

    return rows.map(row => this._toResponse(row));
  }

  async findById(id) {
    const db = getDb();
    const rows = await db
      .select()
      .from(registrations)
      .where(eq(registrations.id, parseInt(id)));

    if (rows.length === 0) return null;
    return this._toResponse(rows[0]);
  }

  async findByContestAndDate(contestName, contestDate) {
    const db = getDb();
    const rows = await db
      .select()
      .from(registrations)
      .where(and(
        eq(registrations.contestName, contestName),
        eq(registrations.contestDate, contestDate),
        eq(registrations.isValid, true)
      ))
      .orderBy(asc(registrations.playerNo));

    return rows.map(row => this._toResponse(row));
  }

  async deleteByContestAndDate(contestName, contestDate) {
    const db = getDb();

    const result = await db
      .delete(registrations)
      .where(and(
        eq(registrations.contestName, contestName),
        eq(registrations.contestDate, contestDate)
      ))
      .returning();

    return { deleted: result.length };
  }

  async findByFwjCard(fwjCard) {
    const db = getDb();
    const rows = await db
      .select()
      .from(registrations)
      .where(and(
        eq(registrations.fwjCardNo, fwjCard),
        eq(registrations.isValid, true)
      ))
      .orderBy(desc(registrations.contestDate));

    return rows.map(row => this._toResponse(row));
  }

  async findByClass(className) {
    const db = getDb();
    const rows = await db
      .select()
      .from(registrations)
      .where(and(
        ilike(registrations.className, `%${className}%`),
        eq(registrations.isValid, true)
      ))
      .orderBy(desc(registrations.contestDate));

    return rows.map(row => this._toResponse(row));
  }

  async findWithPaging(page = 1, limit = 50, filters = {}, sortBy = 'contest_date', sortOrder = 'desc') {
    const db = getDb();

    let conditions = [eq(registrations.isValid, true)];

    // フィルター条件
    if (filters.contest_date) {
      conditions.push(eq(registrations.contestDate, filters.contest_date));
    }
    if (filters.contest_name) {
      conditions.push(eq(registrations.contestName, filters.contest_name));
    }
    if (filters.class_name) {
      conditions.push(ilike(registrations.className, `%${filters.class_name}%`));
    }
    if (filters.fwj_card_no) {
      conditions.push(eq(registrations.fwjCardNo, filters.fwj_card_no));
    }
    if (filters.country) {
      conditions.push(ilike(registrations.country, `%${filters.country}%`));
    }
    if (filters.startDate) {
      conditions.push(gte(registrations.contestDate, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(registrations.contestDate, filters.endDate));
    }
    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(registrations.nameJa, searchTerm),
          ilike(registrations.firstName, searchTerm),
          ilike(registrations.lastName, searchTerm),
          ilike(registrations.fwjCardNo, searchTerm)
        )
      );
    }

    // ソートカラムのマッピング
    const sortColumnMap = {
      'contest_date': registrations.contestDate,
      'contest_name': registrations.contestName,
      'player_no': registrations.playerNo,
      'name_ja': registrations.nameJa,
      'class_name': registrations.className,
      'fwj_card_no': registrations.fwjCardNo,
      'country': registrations.country,
    };

    const sortColumn = sortColumnMap[sortBy] || registrations.contestDate;
    const orderFn = sortOrder === 'asc' ? asc : desc;

    // 総数を取得
    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(registrations)
      .where(and(...conditions));

    const total = parseInt(countResult[0].count);

    // データを取得
    const rows = await db
      .select()
      .from(registrations)
      .where(and(...conditions))
      .orderBy(orderFn(sortColumn))
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

  async validateRegistration(registrationData) {
    const errors = [];

    // 必須フィールドの検証
    if (!registrationData.contest_date) {
      errors.push('大会開催日は必須です');
    } else {
      const date = new Date(registrationData.contest_date);
      if (isNaN(date.getTime())) {
        errors.push('有効な大会開催日を入力してください');
      }
    }

    if (!registrationData.contest_name || registrationData.contest_name.trim() === '') {
      errors.push('大会名は必須です');
    }

    if (!registrationData.player_no) {
      errors.push('Athlete #は必須です');
    }

    if (!registrationData.name_ja || registrationData.name_ja.trim() === '') {
      errors.push('氏名は必須です');
    }

    return { isValid: errors.length === 0, errors, registrationData };
  }

  async createRegistration(registrationData) {
    const validation = await this.validateRegistration(registrationData);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    return await this.create(validation.registrationData);
  }

  async create(data) {
    const db = getDb();

    try {
      const now = new Date();
      const insertData = {
        contestDate: data.contest_date,
        contestName: data.contest_name,
        playerNo: data.player_no || null,
        nameJa: data.name_ja || null,
        nameJaKana: data.name_ja_kana || null,
        fwjCardNo: data.fwj_card_no || null,
        firstName: data.first_name || null,
        lastName: data.last_name || null,
        email: data.email || null,
        phone: data.phone || null,
        country: data.country || null,
        age: data.age || null,
        className: data.class_name || null,
        sortIndex: data.sort_index || null,
        scoreCard: data.score_card || null,
        contestOrder: data.contest_order || null,
        height: data.height || null,
        weight: data.weight || null,
        occupation: data.occupation || null,
        instagram: data.instagram || null,
        biography: data.biography || null,
        isValid: true,
        createdAt: now,
        updatedAt: now,
      };

      const result = await db
        .insert(registrations)
        .values(insertData)
        .returning();

      return { success: true, data: this._toResponse(result[0]) };
    } catch (error) {
      console.error('Registration create error:', error);
      return { success: false, error: error.message };
    }
  }

  async update(id, data) {
    const db = getDb();

    try {
      const updateData = {
        updatedAt: new Date(),
      };

      // 更新可能なフィールド
      if (data.contest_date !== undefined) updateData.contestDate = data.contest_date;
      if (data.contest_name !== undefined) updateData.contestName = data.contest_name;
      if (data.player_no !== undefined) updateData.playerNo = data.player_no || null;
      if (data.name_ja !== undefined) updateData.nameJa = data.name_ja || null;
      if (data.name_ja_kana !== undefined) updateData.nameJaKana = data.name_ja_kana || null;
      if (data.fwj_card_no !== undefined) updateData.fwjCardNo = data.fwj_card_no || null;
      if (data.first_name !== undefined) updateData.firstName = data.first_name || null;
      if (data.last_name !== undefined) updateData.lastName = data.last_name || null;
      if (data.email !== undefined) updateData.email = data.email || null;
      if (data.phone !== undefined) updateData.phone = data.phone || null;
      if (data.country !== undefined) updateData.country = data.country || null;
      if (data.age !== undefined) updateData.age = data.age || null;
      if (data.class_name !== undefined) updateData.className = data.class_name || null;
      if (data.sort_index !== undefined) updateData.sortIndex = data.sort_index || null;
      if (data.score_card !== undefined) updateData.scoreCard = data.score_card || null;
      if (data.contest_order !== undefined) updateData.contestOrder = data.contest_order || null;
      if (data.height !== undefined) updateData.height = data.height || null;
      if (data.weight !== undefined) updateData.weight = data.weight || null;
      if (data.occupation !== undefined) updateData.occupation = data.occupation || null;
      if (data.instagram !== undefined) updateData.instagram = data.instagram || null;
      if (data.biography !== undefined) updateData.biography = data.biography || null;

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
        .update(registrations)
        .set(updateData)
        .where(eq(registrations.id, parseInt(id)))
        .returning();

      if (result.length === 0) {
        return { success: false, error: '登録データが見つかりません' };
      }

      return { success: true, data: this._toResponse(result[0]) };
    } catch (error) {
      console.error('Registration update error:', error);
      return { success: false, error: error.message };
    }
  }

  async softDelete(id) {
    const registration = await this.findById(id);
    if (!registration) {
      return { success: false, error: '登録データが見つかりません' };
    }

    if (registration.isValid === 'FALSE') {
      return { success: false, error: '登録データは既に削除されています' };
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
        .delete(registrations)
        .where(eq(registrations.id, parseInt(id)))
        .returning();

      if (result.length === 0) {
        return { success: false, error: '登録データが見つかりません' };
      }

      return { success: true };
    } catch (error) {
      console.error('Registration delete error:', error);
      return { success: false, error: error.message };
    }
  }

  async getById(id) {
    const record = await this.findById(id);
    if (!record) {
      return { success: false, error: 'レコードが見つかりません' };
    }
    return { success: true, data: record };
  }

  async batchImport(csvData, contestDate, contestName) {
    try {
      console.log(`Starting batch import with ${csvData.length} records`);

      if (!Array.isArray(csvData) || csvData.length === 0) {
        return { success: false, error: 'インポートするデータがありません' };
      }

      const db = getDb();
      const now = new Date();

      // バルクインサート用のデータを準備
      const insertData = csvData.map(row => {
        // ヘッダーを小文字に変換してアクセス
        const normalizedRow = {};
        for (const key in row) {
          normalizedRow[key.toLowerCase()] = row[key];
        }

        return {
          contestDate: contestDate,
          contestName: contestName,
          playerNo: normalizedRow['player_no'] || null,
          nameJa: normalizedRow['name_ja'] || null,
          nameJaKana: normalizedRow['name_ja_kana'] || null,
          fwjCardNo: normalizedRow['fwj_card_no'] || null,
          firstName: normalizedRow['first_name']?.trim() || null,
          lastName: normalizedRow['last_name']?.trim() || null,
          email: normalizedRow['email'] || null,
          phone: normalizedRow['phone'] || null,
          country: normalizedRow['country'] || null,
          age: normalizedRow['age'] || null,
          className: normalizedRow['class_name'] || null,
          sortIndex: normalizedRow['sort_index'] || null,
          scoreCard: normalizedRow['score_card'] || null,
          contestOrder: normalizedRow['contest_order'] || null,
          height: normalizedRow['height'] || null,
          weight: normalizedRow['weight'] || null,
          occupation: normalizedRow['occupation'] || null,
          instagram: normalizedRow['instagram'] || null,
          biography: normalizedRow['biography'] || null,
          isValid: true,
          createdAt: now,
          updatedAt: now,
        };
      });

      // バルクインサート
      await db.insert(registrations).values(insertData);

      console.log('Import completed successfully');

      return {
        success: true,
        data: {
          total: csvData.length,
          imported: insertData.length,
          contestDate: contestDate,
          contestName: contestName,
        }
      };

    } catch (error) {
      console.error('Batch import error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = Registration;
