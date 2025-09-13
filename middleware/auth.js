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

  console.log('=== IP RESTRICTION CHECK ===');
  console.log('Client IP:', clientIp);
  console.log('ALLOWED_IPS env var:', process.env.ALLOWED_IPS);
  console.log('Parsed allowed IPs:', allowedIps);
  console.log('Request headers:', {
    'x-forwarded-for': req.headers['x-forwarded-for'],
    'x-real-ip': req.headers['x-real-ip'],
    'cf-connecting-ip': req.headers['cf-connecting-ip']
  });

  if (allowedIps.length === 0) {
    console.log('No IP restrictions configured, allowing access');
    return next();
  }

  const isAllowed = allowedIps.some(allowedIp => {
    const trimmedIp = allowedIp.trim();
    console.log(`Checking against allowed IP: ${trimmedIp}`);
    
    if (trimmedIp.includes('/')) {
      const result = isIpInCidr(clientIp, trimmedIp);
      console.log(`CIDR check result for ${clientIp} in ${trimmedIp}: ${result}`);
      return result;
    }
    
    const exactMatch = clientIp === trimmedIp;
    console.log(`Exact match check for ${clientIp} === ${trimmedIp}: ${exactMatch}`);
    return exactMatch;
  });

  console.log('Final IP check result:', isAllowed);

  if (!isAllowed) {
    console.log('IP access denied');
    return res.status(403).json({
      success: false,
      error: 'アクセスが許可されていないIPアドレスです'
    });
  }

  console.log('IP access granted');
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