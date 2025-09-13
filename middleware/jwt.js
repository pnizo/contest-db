const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// JWTトークンを生成
function generateToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// JWTトークンを検証
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// セッション互換性のためのミドルウェア
function sessionCompatibility(req, res, next) {
  // セッションオブジェクトを初期化
  if (!req.session) {
    req.session = {};
  }

  // JWTトークンからユーザー情報を取得
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : req.cookies?.token || 
      req.body?.token ||
      req.query?.token;

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.session.user = decoded;
      console.log('JWT verified for user:', decoded.email); // デバッグログ
    } else {
      console.log('JWT verification failed for token:', token.substring(0, 20) + '...'); // デバッグログ
    }
  } else {
    console.log('No JWT token found in request'); // デバッグログ
  }

  next();
}

module.exports = {
  generateToken,
  verifyToken,
  sessionCompatibility,
  JWT_SECRET
};