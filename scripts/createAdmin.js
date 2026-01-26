require('dotenv').config();
const bcrypt = require('bcrypt');
const User = require('../models/User');

async function createAdminUser() {
    console.log('=== 初期管理者アカウント作成 ===\n');

    const userModel = new User();
    
    // 管理者の基本情報
    const adminData = {
        name: '管理者',
        email: 'admin@example.com',
        role: 'admin',
        password: 'admin123' // 6文字以上のパスワード
    };

    try {
        // 既存の管理者をチェック
        const existingAdmin = await userModel.findByEmail(adminData.email, true);
        
        if (existingAdmin && existingAdmin.isValid !== 'FALSE') {
            console.log('既に管理者アカウントが存在します:');
            console.log(`メールアドレス: ${existingAdmin.email}`);
            console.log(`名前: ${existingAdmin.name}`);
            console.log('\n新しい管理者を作成したい場合は、別のメールアドレスを使用してください。');
            return;
        }

        // 管理者アカウントを作成
        const result = await userModel.createUser(adminData);
        
        if (result.success) {
            console.log('✓ 管理者アカウントが正常に作成されました！');
            console.log('\n=== ログイン情報 ===');
            console.log(`メールアドレス: ${adminData.email}`);
            console.log(`パスワード: ${adminData.password}`);
            console.log('==================\n');
            
            if (result.restored) {
                console.log('注意: 削除済みのアカウントが復元されました。');
            }
            
            console.log('ブラウザで http://localhost:3000/login にアクセスしてログインしてください。');
        } else {
            console.error('❌ 管理者アカウントの作成に失敗しました:');
            if (result.errors) {
                result.errors.forEach(error => console.error(`  - ${error}`));
            } else {
                console.error(`  - ${result.error}`);
            }
        }
    } catch (error) {
        console.error('❌ エラーが発生しました:', error.message);
        console.error('\n以下を確認してください:');
        console.error('1. .env ファイルが正しく設定されているか');
        console.error('2. DATABASE_URL 環境変数が設定されているか');
        console.error('3. Neon Postgres データベースに接続できるか');
    }
}

// スクリプト実行
if (require.main === module) {
    createAdminUser().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('スクリプト実行エラー:', error);
        process.exit(1);
    });
}

module.exports = { createAdminUser };