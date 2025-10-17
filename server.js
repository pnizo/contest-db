const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

const userRoutes = require('./routes/users');
const authRoutes = require('./routes/auth');
const scoreRoutes = require('./routes/scores');
const registrationRoutes = require('./routes/registrations');
const subjectRoutes = require('./routes/subjects');
const noteRoutes = require('./routes/notes');
const contestRoutes = require('./routes/contests');
const guestRoutes = require('./routes/guests');
const { checkAuth, requireIpRestriction } = require('./middleware/auth');
const { sessionCompatibility } = require('./middleware/jwt');

const app = express();
const PORT = process.env.PORT || 3000;

// プロキシ信頼設定（Vercel、Cloudflare等で必要）
app.set('trust proxy', true);

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? process.env.VERCEL_URL : 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// セッション設定（本番環境では無効化）
if (process.env.NODE_ENV !== 'production') {
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
}

// セキュリティミドルウェア（IP制限のみ）
app.use('/api', requireIpRestriction);

// セッション互換性ミドルウェア（JWT対応）
app.use(sessionCompatibility);

// 認証チェックミドルウェア
app.use(checkAuth);

// ルートページ（ログイン）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ページルート
app.get('/users', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'users.html'));
});

app.get('/scores', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scores.html'));
});

app.get('/registrations', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'registrations.html'));
});

app.get('/subjects', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'subjects.html'));
});

app.get('/notes', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'notes.html'));
});

app.get('/guests', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'guests.html'));
});

// 静的ファイルを設定
app.use(express.static(path.join(__dirname, 'public')));

// APIルート
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/guests', guestRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});