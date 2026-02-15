const { getDb } = require('../lib/db');
const { users } = require('../lib/db/schema');
const { eq, sql } = require('drizzle-orm');
const bcrypt = require('bcrypt');

/**
 * ユーザーモデル - Neon Postgres / Drizzle ORM版
 */
class User {
  /**
   * DBのcamelCaseをAPI用の形式に変換
   * @private
   */
  _toApiFormat(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      password: row.password,
      googleId: row.googleId || null,
      role: row.role,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    };
  }

  /**
   * 全ユーザーを取得（有効なレコードのみ）
   */
  async findAll() {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(users);

      return rows.map(row => this._toApiFormat(row));
    } catch (error) {
      console.error('Error in User.findAll:', error);
      return [];
    }
  }

  /**
   * IDでユーザーを取得
   */
  async findById(id) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.id, parseInt(id, 10)));

      if (rows.length === 0) {
        return null;
      }

      return this._toApiFormat(rows[0]);
    } catch (error) {
      console.error('Error in User.findById:', error);
      return null;
    }
  }

  /**
   * メールアドレスでユーザーを検索
   */
  async findByEmail(email) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.email, email));

      if (rows.length === 0) {
        return null;
      }

      return this._toApiFormat(rows[0]);
    } catch (error) {
      console.error('Error in User.findByEmail:', error);
      return null;
    }
  }

  /**
   * パスワードをハッシュ化
   */
  async hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * パスワードを比較
   */
  async comparePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * ユーザーデータのバリデーション
   */
  async validateUser(userData) {
    const errors = [];

    if (!userData.name || userData.name.trim() === '') {
      errors.push('名前は必須です');
    }

    if (!userData.email || userData.email.trim() === '') {
      errors.push(userData.role === 'guest' ? 'IDは必須です' : 'メールアドレスは必須です');
    } else if (userData.role !== 'guest' && !/\S+@\S+\.\S+/.test(userData.email)) {
      errors.push('有効なメールアドレスを入力してください');
    }

    if (userData.password && userData.password.length < 6) {
      errors.push('パスワードは6文字以上である必要があります');
    }

    return { isValid: errors.length === 0, errors, userData };
  }

  /**
   * ユーザー認証
   */
  async authenticateUser(email, password) {
    try {
      const user = await this.findByEmail(email);
      if (!user) {
        return { success: false, error: 'ユーザーが見つかりません' };
      }

      // admin/userロールはGoogle SSOのみ
      if (user.role !== 'guest') {
        return { success: false, error: 'Google SSOでログインしてください' };
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

  /**
   * ユーザー作成
   */
  async create(userData) {
    try {
      const db = getDb();

      // パスワードをハッシュ化（パスワードがある場合のみ）
      let hashedPassword = null;
      if (userData.password) {
        hashedPassword = userData.password.startsWith('$2')
          ? userData.password
          : await this.hashPassword(userData.password);
      }

      const insertData = {
        name: userData.name,
        email: userData.email,
        role: userData.role || 'user',
      };
      if (hashedPassword) {
        insertData.password = hashedPassword;
      }

      const insertResult = await db
        .insert(users)
        .values(insertData)
        .returning();

      return { 
        success: true, 
        data: this._toApiFormat(insertResult[0])
      };
    } catch (error) {
      console.error('Error in User.create:', error);
      if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
        return { success: false, errors: ['このメールアドレスは既に使用されています'] };
      }
      throw error;
    }
  }

  /**
   * ユーザー作成（バリデーション付き）
   */
  async createUser(userData) {
    // guestロールの場合のみパスワード必須
    const role = userData.role || 'user';
    if (role === 'guest' && (!userData.password || userData.password.trim() === '')) {
      return { success: false, errors: ['ゲストアカウントにはパスワードが必要です'] };
    }

    const validation = await this.validateUser(userData);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    // 既存ユーザーをチェック
    const existingUser = await this.findByEmail(userData.email);
    if (existingUser) {
      return { success: false, errors: ['このメールアドレスは既に使用されています'] };
    }

    return await this.create(userData);
  }

  /**
   * ユーザー更新
   */
  async update(id, data) {
    try {
      const db = getDb();

      const updateData = { updatedAt: new Date() };

      if (data.name !== undefined) {
        updateData.name = data.name;
      }
      if (data.email !== undefined) {
        updateData.email = data.email;
      }
      if (data.password !== undefined && data.password.trim() !== '') {
        // パスワードが既にハッシュ化されているかチェック
        if (data.password.startsWith('$2')) {
          updateData.password = data.password;
        } else {
          updateData.password = await this.hashPassword(data.password);
        }
      }
      if (data.role !== undefined) {
        updateData.role = data.role;
      }
      if (data.googleId !== undefined) {
        updateData.googleId = data.googleId;
      }

      const result = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, parseInt(id, 10)))
        .returning();

      if (result.length === 0) {
        return { success: false, error: 'ユーザーが見つかりません' };
      }

      return { success: true, data: this._toApiFormat(result[0]) };
    } catch (error) {
      console.error('Error in User.update:', error);
      if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
        return { success: false, error: 'このメールアドレスは既に使用されています' };
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * パスワード更新
   */
  async updatePassword(id, newPassword) {
    try {
      const hashedPassword = await this.hashPassword(newPassword);
      return await this.update(id, { password: hashedPassword });
    } catch (error) {
      console.error('Password update error:', error);
      return { success: false, error: 'パスワードの更新に失敗しました' };
    }
  }

  /**
   * 物理削除
   */
  async deleteById(id) {
    try {
      const db = getDb();
      await db.delete(users).where(eq(users.id, parseInt(id, 10)));
      return { success: true };
    } catch (error) {
      console.error('Error in deleteById:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = User;
