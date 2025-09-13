const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// JWTトークンを生成
function generateToken(user) {
  try {
    console.log('Generating JWT for user:', { id: user.id, email: user.email, role: user.role });
    console.log('JWT_SECRET exists:', !!JWT_SECRET);
    
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    console.log('JWT generation successful, token length:', token.length);
    return token;
  } catch (error) {
    console.error('JWT generation failed:', error);
    return null;
  }
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
  // セッションオブジェクトを初期化（Vercel対応）
  if (!req.session) {
    req.session = {};
  }

  // JWTトークンからユーザー情報を取得
  const authHeader = req.headers.authorization;
  let token = null;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
    console.log('JWT token found in Authorization header');
  } else if (req.cookies?.token) {
    token = req.cookies.token;
    console.log('JWT token found in cookies');
  } else if (req.body?.token) {
    token = req.body.token;
    console.log('JWT token found in body');
  } else if (req.query?.token) {
    token = req.query.token;
    console.log('JWT token found in query');
  } else {
    console.log('No JWT token found in request headers, cookies, body, or query');
  }

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.session.user = decoded;
      console.log('JWT verified successfully for user:', decoded.email);
    } else {
      console.log('JWT verification failed for token:', token.substring(0, 20) + '...');
      // トークンが無効な場合、セッションからユーザー情報を削除
      req.session.user = null;
    }
  }

  next();
}

module.exports = {
  generateToken,
  verifyToken,
  sessionCompatibility,
  JWT_SECRET
};