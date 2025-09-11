const bcrypt = require('bcrypt');

async function hashPassword(password) {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
}

// コマンドライン引数からパスワードを取得
const password = process.argv[2];

if (!password) {
    console.error('使用方法: node utils/hashPassword.js <password>');
    console.error('例: node utils/hashPassword.js myPassword123');
    process.exit(1);
}

if (password.length < 6) {
    console.error('パスワードは6文字以上である必要があります');
    process.exit(1);
}

hashPassword(password).then(hashedPassword => {
    console.log('\n=== パスワードハッシュ生成結果 ===');
    console.log(`元のパスワード: ${password}`);
    console.log(`ハッシュ化パスワード: ${hashedPassword}`);
    console.log('\nスプレッドシートのJ列（password列）にこのハッシュ値をコピーしてください。');
    console.log('=================================\n');
}).catch(error => {
    console.error('ハッシュ化エラー:', error);
    process.exit(1);
});