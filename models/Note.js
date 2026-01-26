const { getDb } = require('../lib/db');
const { notes } = require('../lib/db/schema');
const { eq, and, or, ilike, gte, lte, desc, asc, sql } = require('drizzle-orm');

class Note {
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
      name_ja: row.nameJa || '',
      type: row.type || '',
      player_no: row.playerNo || '',
      fwj_card_no: row.fwjCardNo || '',
      npc_member_no: row.npcMemberNo || '',
      first_name: row.firstName || '',
      last_name: row.lastName || '',
      email: row.email || '',
      phone: row.phone || '',
      note: row.note || '',
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
      .from(notes)
      .where(eq(notes.isValid, true))
      .orderBy(desc(notes.contestDate));

    return rows.map(row => this._toResponse(row));
  }

  async findAllIncludingDeleted() {
    const db = getDb();
    const rows = await db
      .select()
      .from(notes)
      .orderBy(desc(notes.contestDate));

    return rows.map(row => this._toResponse(row));
  }

  async findById(id) {
    const db = getDb();
    const rows = await db
      .select()
      .from(notes)
      .where(eq(notes.id, parseInt(id)));

    if (rows.length === 0) return null;
    return this._toResponse(rows[0]);
  }

  async findByContestAndDate(contestName, contestDate) {
    const db = getDb();
    const rows = await db
      .select()
      .from(notes)
      .where(and(
        eq(notes.contestName, contestName),
        eq(notes.contestDate, contestDate),
        eq(notes.isValid, true)
      ))
      .orderBy(desc(notes.createdAt));

    return rows.map(row => this._toResponse(row));
  }

  async findByFwjCardNo(fwjCardNo) {
    const db = getDb();
    const rows = await db
      .select()
      .from(notes)
      .where(and(
        eq(notes.fwjCardNo, fwjCardNo),
        eq(notes.isValid, true)
      ))
      .orderBy(desc(notes.contestDate));

    return rows.map(row => this._toResponse(row));
  }

  async findByType(type) {
    const db = getDb();
    const rows = await db
      .select()
      .from(notes)
      .where(and(
        ilike(notes.type, `%${type}%`),
        eq(notes.isValid, true)
      ))
      .orderBy(desc(notes.contestDate));

    return rows.map(row => this._toResponse(row));
  }

  async findAllActive() {
    return await this.findAll();
  }

  async findWithPaging(page = 1, limit = 50, filters = {}, sortBy = 'contest_date', sortOrder = 'desc') {
    const db = getDb();

    let conditions = [eq(notes.isValid, true)];

    // フィルター条件
    if (filters.fwj_card_no) {
      conditions.push(eq(notes.fwjCardNo, filters.fwj_card_no));
    }
    if (filters.contest_name) {
      conditions.push(eq(notes.contestName, filters.contest_name));
    }
    if (filters.type) {
      conditions.push(eq(notes.type, filters.type));
    }
    if (filters.startDate) {
      conditions.push(gte(notes.contestDate, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(notes.contestDate, filters.endDate));
    }
    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(notes.nameJa, searchTerm),
          ilike(notes.contestName, searchTerm),
          ilike(notes.fwjCardNo, searchTerm),
          ilike(notes.note, searchTerm)
        )
      );
    }

    // ソートカラムのマッピング
    const sortColumnMap = {
      'contest_date': notes.contestDate,
      'contest_name': notes.contestName,
      'name_ja': notes.nameJa,
      'type': notes.type,
      'player_no': notes.playerNo,
      'fwj_card_no': notes.fwjCardNo,
      'npc_member_no': notes.npcMemberNo,
      'note': notes.note,
    };

    const sortColumn = sortColumnMap[sortBy] || notes.contestDate;
    const orderFn = sortOrder === 'asc' ? asc : desc;

    // 総数を取得
    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(notes)
      .where(and(...conditions));

    const total = parseInt(countResult[0].count);

    // データを取得
    const rows = await db
      .select()
      .from(notes)
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

  async validateNote(noteData) {
    const errors = [];

    // 必須フィールドの検証
    if (!noteData.contest_date) {
      errors.push('コンテスト開催日は必須です');
    } else {
      const date = new Date(noteData.contest_date);
      if (isNaN(date.getTime())) {
        errors.push('有効なコンテスト開催日を入力してください');
      }
    }

    if (!noteData.contest_name || noteData.contest_name.trim() === '') {
      errors.push('コンテスト名は必須です');
    }

    if (!noteData.name_ja || noteData.name_ja.trim() === '') {
      errors.push('氏名（日本語）は必須です');
    }

    if (!noteData.type || noteData.type.trim() === '') {
      errors.push('特記事項のタイプは必須です');
    }

    return { isValid: errors.length === 0, errors, noteData };
  }

  async createNote(noteData) {
    const validation = await this.validateNote(noteData);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    return await this.create(validation.noteData);
  }

  async create(data) {
    const db = getDb();

    try {
      const now = new Date();
      const insertData = {
        contestDate: data.contest_date,
        contestName: data.contest_name,
        nameJa: data.name_ja,
        type: data.type,
        playerNo: data.player_no || null,
        fwjCardNo: data.fwj_card_no || null,
        npcMemberNo: data.npc_member_no || null,
        firstName: data.first_name || null,
        lastName: data.last_name || null,
        email: data.email || null,
        phone: data.phone || null,
        note: data.note || null,
        isValid: true,
        createdAt: now,
        updatedAt: now,
      };

      const result = await db
        .insert(notes)
        .values(insertData)
        .returning();

      return { success: true, data: this._toResponse(result[0]) };
    } catch (error) {
      console.error('Note create error:', error);
      return { success: false, error: error.message };
    }
  }

  async update(id, data) {
    const db = getDb();

    try {
      const updateData = {
        updatedAt: new Date(),
      };

      if (data.contest_date !== undefined) updateData.contestDate = data.contest_date;
      if (data.contest_name !== undefined) updateData.contestName = data.contest_name;
      if (data.name_ja !== undefined) updateData.nameJa = data.name_ja;
      if (data.type !== undefined) updateData.type = data.type;
      if (data.player_no !== undefined) updateData.playerNo = data.player_no || null;
      if (data.fwj_card_no !== undefined) updateData.fwjCardNo = data.fwj_card_no || null;
      if (data.npc_member_no !== undefined) updateData.npcMemberNo = data.npc_member_no || null;
      if (data.first_name !== undefined) updateData.firstName = data.first_name || null;
      if (data.last_name !== undefined) updateData.lastName = data.last_name || null;
      if (data.email !== undefined) updateData.email = data.email || null;
      if (data.phone !== undefined) updateData.phone = data.phone || null;
      if (data.note !== undefined) updateData.note = data.note || null;

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
        .update(notes)
        .set(updateData)
        .where(eq(notes.id, parseInt(id)))
        .returning();

      if (result.length === 0) {
        return { success: false, error: '特記事項が見つかりません' };
      }

      return { success: true, data: this._toResponse(result[0]) };
    } catch (error) {
      console.error('Note update error:', error);
      return { success: false, error: error.message };
    }
  }

  async softDelete(id) {
    const note = await this.findById(id);
    if (!note) {
      return { success: false, error: '特記事項が見つかりません' };
    }

    if (note.isValid === 'FALSE') {
      return { success: false, error: '特記事項は既に削除されています' };
    }

    return await this.update(id, {
      isValid: 'FALSE',
      deletedAt: new Date().toISOString()
    });
  }

  async restore(id) {
    const db = getDb();
    const rows = await db
      .select()
      .from(notes)
      .where(eq(notes.id, parseInt(id)));

    if (rows.length === 0) {
      return { success: false, error: '特記事項が見つかりません' };
    }

    const note = rows[0];
    if (note.isValid) {
      return { success: false, error: '特記事項は削除されていません' };
    }

    return await this.update(id, {
      isValid: 'TRUE',
      restoredAt: new Date().toISOString()
    });
  }

  async delete(id) {
    const db = getDb();

    try {
      const result = await db
        .delete(notes)
        .where(eq(notes.id, parseInt(id)))
        .returning();

      if (result.length === 0) {
        return { success: false, error: '特記事項が見つかりません' };
      }

      return { success: true };
    } catch (error) {
      console.error('Note delete error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = Note;
