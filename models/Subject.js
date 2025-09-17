const BaseModel = require('./BaseModel');

class Subject extends BaseModel {
  constructor() {
    super('Subjects');
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
    
    if (!subjectData.id) {
      subjectData.id = Date.now().toString();
    }
    
    subjectData.createdAt = subjectData.createdAt || new Date().toISOString();
    subjectData.isValid = subjectData.isValid || 'TRUE';
    subjectData.updatedAt = subjectData.updatedAt || new Date().toISOString();
    subjectData.deletedAt = subjectData.deletedAt || '';
    subjectData.restoredAt = subjectData.restoredAt || '';
    subjectData.npc_member_no = subjectData.npc_member_no || '';
    subjectData.note = subjectData.note || '';
    
    return { isValid: errors.length === 0, errors, subjectData };
  }

  async findByFwjCard(fwjCardNo, includeDeleted = false) {
    const all = includeDeleted ? await this.findAllIncludingDeleted() : await this.findAll();
    return all.find(subject => subject.fwj_card_no === fwjCardNo);
  }

  async findAllActive() {
    const all = await this.findAllIncludingDeleted();
    return all.filter(subject => subject.isValid !== 'FALSE');
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
      validation.subjectData.id = existingDeletedSubject.id;
      validation.subjectData.isValid = 'TRUE';
      validation.subjectData.updatedAt = new Date().toISOString();
      
      const result = await this.update(existingDeletedSubject.id, validation.subjectData);
      if (result.success) {
        return { success: true, data: result.data, restored: true };
      }
      return result;
    }

    return await this.create(validation.subjectData);
  }

  async update(id, data) {
    data.updatedAt = new Date().toISOString();
    return await super.update(id, data);
  }

  async softDelete(id) {
    const subject = await this.findById(id);
    if (!subject) {
      return { success: false, error: '対象者が見つかりません' };
    }

    if (subject.isValid === 'FALSE') {
      return { success: false, error: '対象者は既に削除されています' };
    }

    const updateData = {
      isValid: 'FALSE',
      deletedAt: new Date().toISOString()
    };

    return await this.update(id, updateData);
  }
}

module.exports = Subject;