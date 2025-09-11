const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

const userRoutes = require('./routes/users');
const authRoutes = require('./routes/auth');
const scoreRoutes = require('./routes/scores');
const { checkAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// セッション設定
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24時間
  }
}));

// 静的ファイルを先に設定
app.use(express.static('public'));

// 認証チェックミドルウェア
app.use(checkAuth);

// ページルート（HTMLファイル）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/scores', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scores.html'));
});

// APIルート
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/scores', scoreRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
});

app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました`);
  console.log(`アプリケーション: http://localhost:${PORT}`);
  console.log('');
  console.log('セットアップ手順:');
  console.log('1. .env.example を .env にコピー');
  console.log('2. Google Cloud Console でプロジェクトとサービスアカウントを作成');
  console.log('3. .env ファイルに認証情報を設定');
  console.log('4. スプレッドシートにサービスアカウントの編集権限を付与');
  console.log('5. スプレッドシートの最初の行にヘッダー (id, name, email, role, createdAt) を設定');
});