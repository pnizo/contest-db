const BaseModel = require('./BaseModel');

class Note extends BaseModel {
  constructor() {
    super('Notes');
  }

  async findByContestAndDate(contestName, contestDate) {
    const all = await this.findAll();
    return all.filter(note =>
      note.contest_name === contestName &&
      note.contest_date === contestDate
    );
  }

  async findByFwjCardNo(fwjCardNo) {
    const all = await this.findAll();
    return all.filter(note => note.fwj_card_no === fwjCardNo);
  }

  async findByType(type) {
    const all = await this.findAll();
    return all.filter(note =>
      note.type &&
      note.type.toLowerCase().includes(type.toLowerCase())
    );
  }

  async findAllActive() {
    const all = await this.findAllIncludingDeleted();
    return all.filter(note => note.isValid !== 'FALSE');
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

    // IDの生成
    if (!noteData.id) {
      noteData.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    // デフォルト値の設定
    noteData.player_no = noteData.player_no || '';
    noteData.fwj_card_no = noteData.fwj_card_no || '';
    noteData.npc_member_no = noteData.npc_member_no || '';
    noteData.first_name = noteData.first_name || '';
    noteData.last_name = noteData.last_name || '';
    noteData.email = noteData.email || '';
    noteData.phone = noteData.phone || '';
    noteData.note = noteData.note || '';

    noteData.createdAt = noteData.createdAt || new Date().toISOString();
    noteData.isValid = noteData.isValid || 'TRUE';
    noteData.updatedAt = noteData.updatedAt || new Date().toISOString();
    noteData.deletedAt = noteData.deletedAt || '';
    noteData.restoredAt = noteData.restoredAt || '';

    return { isValid: errors.length === 0, errors, noteData };
  }

  async createNote(noteData) {
    const validation = await this.validateNote(noteData);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    return await this.create(validation.noteData);
  }

  async softDelete(id) {
    const note = await this.findById(id);
    if (!note) {
      return { success: false, error: '特記事項が見つかりません' };
    }

    if (note.isValid === 'FALSE') {
      return { success: false, error: '特記事項は既に削除されています' };
    }

    const updateData = {
      isValid: 'FALSE',
      deletedAt: new Date().toISOString()
    };

    return await this.update(id, updateData);
  }

  async restore(id) {
    const allNotes = await this.findAllIncludingDeleted();
    const note = allNotes.find(n => n.id === id);

    if (!note) {
      return { success: false, error: '特記事項が見つかりません' };
    }

    if (note.isValid !== 'FALSE') {
      return { success: false, error: '特記事項は削除されていません' };
    }

    const updateData = {
      isValid: 'TRUE',
      restoredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return await this.update(id, updateData);
  }
}

module.exports = Note;
