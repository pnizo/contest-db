const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const userRoutes = require('./routes/users');
const authRoutes = require('./routes/auth');
const scoreRoutes = require('./routes/scores');
const judgeRoutes = require('./routes/judges');
const registrationRoutes = require('./routes/registrations');
const subjectRoutes = require('./routes/subjects');
const noteRoutes = require('./routes/notes');
const contestRoutes = require('./routes/contests');
const guestRoutes = require('./routes/guests');
const memberRoutes = require('./routes/members');
const orderRoutes = require('./routes/orders');
const checkinRoutes = require('./routes/checkin');
const ticketRoutes = require('./routes/tickets');
const webhookRoutes = require('./routes/webhooks');
const { checkAuth, requireIpRestriction } = require('./middleware/auth');
const { sessionCompatibility } = require('./middleware/jwt');

const app = express();
const PORT = process.env.PORT || 3000;

// プロキシ信頼設定（Vercel、Cloudflare等で必要）
app.set('trust proxy', true);

// Webhook用にraw bodyを保持（署名検証に必要）
// 他のbody parserより先に設定する必要がある
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

// チェックイン専用ドメインのアクセス制御
const CHECKIN_DOMAIN = 'ticket-checkin.fwj.jp';
const MAIN_DOMAIN = 'contest-db.fwj.jp';

app.use(cors({
  origin: function (origin, callback) {
    // same-origin リクエスト（origin なし）は許可
    if (!origin) return callback(null, true);

    const allowed = [
      'http://localhost:3001',
      `https://${CHECKIN_DOMAIN}`,
      `https://${MAIN_DOMAIN}`,
    ];
    if (process.env.VERCEL_URL) {
      allowed.push(`https://${process.env.VERCEL_URL}`);
    }

    if (allowed.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

const ALLOWED_CHECKIN_PATHS = [
  '/',
  '/checkin',
  '/api/checkin',
  '/api/checkin/verify',
  '/api/auth/login',
  '/api/auth/google',
  '/api/auth/config',
  '/api/auth/status',
  '/api/auth/me',
  '/api/auth/logout',
  '/checkin-script.js',
  '/styles.css',
  '/favicon.ico',
  '/favicon.png'
];

app.use((req, res, next) => {
  const host = req.get('host') || '';
  
  // localhost（デバッグ時）は全機能にアクセス可能
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
    return next();
  }
  
  // チェックイン専用ドメインかどうかをリクエストに記録
  req.isCheckinDomain = (host === CHECKIN_DOMAIN || host.startsWith('ticket-checkin.'));
  
  // チェックイン専用ドメインの場合、許可されたパスのみアクセス可能
  if (req.isCheckinDomain) {
    const path = req.path;
    const isAllowed = ALLOWED_CHECKIN_PATHS.some(allowed => 
      path === allowed || path.startsWith(allowed + '/')
    );
    
    if (!isAllowed) {
      return res.status(404).send('Not Found');
    }
  }
  
  next();
});

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

// セキュリティミドルウェア（IP制限 - 認証API以外に適用）
app.use('/api/users', requireIpRestriction);
app.use('/api/scores', requireIpRestriction);
app.use('/api/judges', requireIpRestriction);
app.use('/api/registrations', requireIpRestriction);
app.use('/api/subjects', requireIpRestriction);
app.use('/api/notes', requireIpRestriction);
app.use('/api/contests', requireIpRestriction);
app.use('/api/guests', requireIpRestriction);
app.use('/api/members', requireIpRestriction);
app.use('/api/orders', requireIpRestriction);
app.use('/api/tickets', requireIpRestriction);

// セッション互換性ミドルウェア（JWT対応）
app.use(sessionCompatibility);

// 認証チェックミドルウェア
app.use(checkAuth);

// ルートページ（常にログインページを表示）
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

app.get('/judges', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'judges.html'));
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

app.get('/contests', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contests.html'));
});

app.get('/members', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'members.html'));
});

app.get('/orders', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'orders.html'));
});

app.get('/tickets', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tickets.html'));
});

// チェックインページ（認証チェックはフロントエンドで行う）
app.get('/checkin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkin.html'));
});

app.get('/manual.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'manual.html'));
});

// 静的ファイルを設定
app.use(express.static(path.join(__dirname, 'public')));

// APIルート
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/judges', judgeRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/guests', guestRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/tickets', ticketRoutes);

// チェックインAPI（認証不要・IP制限なし）
app.use('/api/checkin', checkinRoutes);

// Shopify Webhook（認証不要・IP制限なし - HMAC署名で検証）
app.use('/api/webhooks', webhookRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});