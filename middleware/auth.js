const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'ログインが必要です',
      redirect: '/login'
    });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'ログインが必要です',
      redirect: '/login'
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
  requireAuth,
  requireAdmin,
  checkAuth
};