const { getDb } = require('../lib/db');
const { subjects } = require('../lib/db/schema');
const { eq, and, or, ilike, isNull, desc } = require('drizzle-orm');

class Subject {
  constructor() {
    // Drizzle ORM使用
  }

  // DB行データをAPIレスポンス形式に変換
  _toResponse(row) {
    if (!row) return null;
    return {
      id: row.id,
      fwj_card_no: row.fwjCardNo,
      name_ja: row.nameJa,
      first_name: row.firstName,
      last_name: row.lastName,
      npc_member_no: row.npcMemberNo || '',
      note: row.note || '',
      isValid: row.isValid ? 'TRUE' : 'FALSE',
      createdAt: row.createdAt ? row.createdAt.toISOString() : '',
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : '',
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : '',
      restoredAt: row.restoredAt ? row.restoredAt.toISOString() : '',
    };
  }

  async validateSubject(subjectData) {
    const errors = [];

    // 必須項目の検証
    if (!subjectData.fwj_card_no || subjectData.fwj_card_no.trim() === '') {
      errors.push('FWJカード番号は必須です');
    }

    if (!subjectData.name_ja || subjectData.name_ja.trim() === '') {
      errors.push('日本語名は必須です');
    }

    if (!subjectData.first_name || subjectData.first_name.trim() === '') {
      errors.push('名（英語）は必須です');
    }

    if (!subjectData.last_name || subjectData.last_name.trim() === '') {
      errors.push('姓（英語）は必須です');
    }

    return { isValid: errors.length === 0, errors, subjectData };
  }

  async findAll() {
    const db = getDb();
    const rows = await db
      .select()
      .from(subjects)
      .where(eq(subjects.isValid, true))
      .orderBy(desc(subjects.createdAt));

    return rows.map(row => this._toResponse(row));
  }

  async findAllIncludingDeleted() {
    const db = getDb();
    const rows = await db
      .select()
      .from(subjects)
      .orderBy(desc(subjects.createdAt));

    return rows.map(row => this._toResponse(row));
  }

  async findById(id) {
    const db = getDb();
    const rows = await db
      .select()
      .from(subjects)
      .where(eq(subjects.id, parseInt(id)));

    if (rows.length === 0) return null;
    return this._toResponse(rows[0]);
  }

  async findByFwjCard(fwjCardNo, includeDeleted = false) {
    const db = getDb();

    let rows;
    if (includeDeleted) {
      rows = await db
        .select()
        .from(subjects)
        .where(eq(subjects.fwjCardNo, fwjCardNo));
    } else {
      rows = await db
        .select()
        .from(subjects)
        .where(and(
          eq(subjects.fwjCardNo, fwjCardNo),
          eq(subjects.isValid, true)
        ));
    }

    if (rows.length === 0) return null;
    return this._toResponse(rows[0]);
  }

  async findAllActive() {
    return await this.findAll();
  }

  async findWithPaging(page = 1, limit = Number.MAX_SAFE_INTEGER, filters = {}) {
    const db = getDb();

    let conditions = [eq(subjects.isValid, true)];

    // 検索フィルター
    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(subjects.nameJa, searchTerm),
          ilike(subjects.firstName, searchTerm),
          ilike(subjects.lastName, searchTerm),
          ilike(subjects.fwjCardNo, searchTerm),
          ilike(subjects.npcMemberNo, searchTerm)
        )
      );
    }

    const rows = await db
      .select()
      .from(subjects)
      .where(and(...conditions))
      .orderBy(desc(subjects.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      data: rows.map(row => this._toResponse(row)),
      page,
      limit,
    };
  }

  async createSubject(subjectData) {
    const validation = await this.validateSubject(subjectData);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    // 同じFWJカード番号の既存のアクティブな記録をチェック
    const existingActiveByFwj = await this.findByFwjCard(validation.subjectData.fwj_card_no, false);
    if (existingActiveByFwj) {
      return { success: false, errors: ['このFWJカード番号は既に登録されています'] };
    }

    // 論理削除された記録があるかチェック（FWJカード番号のみ）
    const existingDeletedSubject = await this.findByFwjCard(validation.subjectData.fwj_card_no, true);

    if (existingDeletedSubject && existingDeletedSubject.isValid === 'FALSE') {
      // 論理削除されたレコードを復元
      const result = await this.update(existingDeletedSubject.id, {
        ...validation.subjectData,
        isValid: 'TRUE',
        restoredAt: new Date().toISOString(),
      });
      if (result.success) {
        return { success: true, data: result.data, restored: true };
      }
      return result;
    }

    return await this.create(validation.subjectData);
  }

  async create(data) {
    const db = getDb();

    try {
      const now = new Date();
      const insertData = {
        fwjCardNo: data.fwj_card_no,
        nameJa: data.name_ja,
        firstName: data.first_name,
        lastName: data.last_name,
        npcMemberNo: data.npc_member_no || null,
        note: data.note || null,
        isValid: true,
        createdAt: now,
        updatedAt: now,
      };

      const result = await db
        .insert(subjects)
        .values(insertData)
        .returning();

      return { success: true, data: this._toResponse(result[0]) };
    } catch (error) {
      console.error('Subject create error:', error);
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
      if (data.name_ja !== undefined) updateData.nameJa = data.name_ja;
      if (data.first_name !== undefined) updateData.firstName = data.first_name;
      if (data.last_name !== undefined) updateData.lastName = data.last_name;
      if (data.npc_member_no !== undefined) updateData.npcMemberNo = data.npc_member_no || null;
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
        .update(subjects)
        .set(updateData)
        .where(eq(subjects.id, parseInt(id)))
        .returning();

      if (result.length === 0) {
        return { success: false, error: '対象者が見つかりません' };
      }

      return { success: true, data: this._toResponse(result[0]) };
    } catch (error) {
      console.error('Subject update error:', error);
      return { success: false, error: error.message };
    }
  }

  async softDelete(id) {
    const subject = await this.findById(id);
    if (!subject) {
      return { success: false, error: '対象者が見つかりません' };
    }

    if (subject.isValid === 'FALSE') {
      return { success: false, error: '対象者は既に削除されています' };
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
        .delete(subjects)
        .where(eq(subjects.id, parseInt(id)))
        .returning();

      if (result.length === 0) {
        return { success: false, error: '対象者が見つかりません' };
      }

      return { success: true };
    } catch (error) {
      console.error('Subject delete error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = Subject;
