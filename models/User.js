const BaseModel = require('./BaseModel');
const bcrypt = require('bcrypt');

class User extends BaseModel {
  constructor() {
    super('Users');
  }

  async findByEmail(email, includeDeleted = false) {
    const all = includeDeleted ? await this.findAllIncludingDeleted() : await this.findAll();
    return all.find(user => user.email === email);
  }

  async findAllActive() {
    const all = await this.findAllIncludingDeleted();
    return all.filter(user => user.isValid !== 'FALSE');
  }

  async validateUser(userData) {
    const errors = [];
    
    if (!userData.name || userData.name.trim() === '') {
      errors.push('名前は必須です');
    }
    
    if (!userData.email || userData.email.trim() === '') {
      errors.push('メールアドレスは必須です');
    } else if (!/\S+@\S+\.\S+/.test(userData.email)) {
      errors.push('有効なメールアドレスを入力してください');
    }

    // パスワードの検証（新規作成時のみ）
    if (userData.password && userData.password.length < 6) {
      errors.push('パスワードは6文字以上である必要があります');
    }
    
    if (!userData.id) {
      userData.id = Date.now().toString();
    }
    
    userData.createdAt = userData.createdAt || new Date().toISOString();
    userData.isValid = userData.isValid || 'TRUE';
    userData.updatedAt = userData.updatedAt || new Date().toISOString();
    userData.deletedAt = userData.deletedAt || '';
    userData.restoredAt = userData.restoredAt || '';
    userData.role = userData.role || 'user';
    
    return { isValid: errors.length === 0, errors, userData };
  }

  async hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
  }

  async comparePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  async authenticateUser(email, password) {
    try {
      const user = await this.findByEmail(email, false);
      if (!user) {
        return { success: false, error: 'ユーザーが見つかりません' };
      }

      if (user.isValid === 'FALSE') {
        return { success: false, error: 'このアカウントは無効化されています' };
      }

      if (!user.password) {
        return { success: false, error: 'パスワードが設定されていません' };
      }

      const isValidPassword = await this.comparePassword(password, user.password);
      if (!isValidPassword) {
        return { success: false, error: 'パスワードが正しくありません' };
      }

      // パスワードを除いたユーザー情報を返す
      const { password: _, ...userWithoutPassword } = user;
      return { success: true, user: userWithoutPassword };
    } catch (error) {
      console.error('Authentication error:', error);
      return { success: false, error: '認証エラーが発生しました' };
    }
  }

  async createUser(userData) {
    const validation = await this.validateUser(userData);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    // パスワードをハッシュ化
    if (validation.userData.password) {
      validation.userData.password = await this.hashPassword(validation.userData.password);
    }

    const existingActiveUser = await this.findByEmail(validation.userData.email, false);
    if (existingActiveUser) {
      return { success: false, errors: ['このメールアドレスは既に使用されています'] };
    }

    const existingDeletedUser = await this.findByEmail(validation.userData.email, true);
    if (existingDeletedUser && existingDeletedUser.isValid === 'FALSE') {
      validation.userData.id = existingDeletedUser.id;
      validation.userData.isValid = 'TRUE';
      validation.userData.updatedAt = new Date().toISOString();
      
      const result = await this.update(existingDeletedUser.id, validation.userData);
      if (result.success) {
        return { success: true, data: result.data, restored: true };
      }
      return result;
    }

    return await this.create(validation.userData);
  }

  async updatePassword(id, newPassword) {
    try {
      const hashedPassword = await this.hashPassword(newPassword);
      return await this.update(id, { 
        password: hashedPassword,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Password update error:', error);
      return { success: false, error: 'パスワードの更新に失敗しました' };
    }
  }

  async update(id, data) {
    // パスワードが含まれている場合はハッシュ化
    if (data.password && data.password.trim() !== '') {
      try {
        data.password = await this.hashPassword(data.password);
      } catch (error) {
        console.error('Password hashing error:', error);
        return { success: false, error: 'パスワードの暗号化に失敗しました' };
      }
    }

    // updatedAtを追加
    data.updatedAt = new Date().toISOString();

    return await super.update(id, data);
  }

  async softDelete(id) {
    const user = await this.findById(id);
    if (!user) {
      return { success: false, error: 'ユーザーが見つかりません' };
    }

    if (user.isValid === 'FALSE') {
      return { success: false, error: 'ユーザーは既に削除されています' };
    }

    const updateData = {
      isValid: 'FALSE',
      deletedAt: new Date().toISOString()
    };

    return await this.update(id, updateData);
  }
}

module.exports = User;