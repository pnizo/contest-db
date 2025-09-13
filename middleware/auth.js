const requireIpRestriction = (req, res, next) => {
  // Vercel/プロキシ環境での実際のクライアントIP取得
  const clientIp = 
    req.headers['cf-connecting-ip'] ||      // Cloudflare
    req.headers['x-real-ip'] ||             // Nginx
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||  // プロキシチェーン
    req.ip ||                               // Express trust proxy
    req.connection.remoteAddress ||         // 直接接続
    req.socket.remoteAddress ||             // ソケット
    'unknown';
    
  const allowedIps = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',') : [];

  if (allowedIps.length === 0) {
    return next();
  }

  const isAllowed = allowedIps.some(allowedIp => {
    const trimmedIp = allowedIp.trim();
    
    if (trimmedIp.includes('/')) {
      return isIpInCidr(clientIp, trimmedIp);
    }
    
    return clientIp === trimmedIp;
  });

  if (!isAllowed) {
    console.log(`IP access denied for ${clientIp}`);
    return res.status(403).json({
      success: false,
      error: 'アクセスが許可されていないIPアドレスです'
    });
  }

  next();
};

const isIpInCidr = (ip, cidr) => {
  const [network, prefixLength] = cidr.split('/');
  const networkInt = ipToInt(network);
  const ipInt = ipToInt(ip);
  const mask = -1 << (32 - parseInt(prefixLength));
  return (networkInt & mask) === (ipInt & mask);
};

const ipToInt = (ip) => {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
};

const requireAuth = (req, res, next) => {
  // sessionCompatibilityミドルウェアによってreq.sessionにユーザー情報が設定されているはず
  if (!req.session || !req.session.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'ログインが必要です',
      redirect: '/'
    });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'ログインが必要です',
      redirect: '/'
    });
  }

  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      error: '管理者権限が必要です' 
    });
  }
  next();
};

const checkAuth = (req, res, next) => {
  req.isAuthenticated = !!(req.session && req.session.user);
  req.isAdmin = req.isAuthenticated && req.session.user.role === 'admin';
  req.user = req.session?.user || null;
  next();
};

module.exports = {
  requireIpRestriction,
  requireAuth,
  requireAdmin,
  checkAuth
};