const express = require('express');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { generateToken } = require('../middleware/jwt');
const router = express.Router();

const userModel = new User();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'メールアドレスとパスワードが必要です' 
      });
    }

    const result = await userModel.authenticateUser(email, password);
    
    if (result.success) {
      // セッションに保存（開発環境用）
      if (req.session) {
        req.session.user = result.user;
      }
      
      // JWTトークンを生成
      const token = generateToken(result.user);
      
      res.json({ 
        success: true, 
        message: 'ログインしました',
        user: result.user,
        role: result.user.role,
        token: token
      });
    } else {
      res.status(401).json(result);
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'ログインエラーが発生しました' 
    });
  }
});

router.post('/logout', (req, res) => {
  // セッションがある場合は破棄
  if (req.session && req.session.destroy) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
      }
    });
  }
  
  // JWTは無効化できないので、フロントエンドでトークンを削除
  res.json({ 
    success: true, 
    message: 'ログアウトしました' 
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ 
    success: true, 
    user: req.session.user 
  });
});

router.get('/status', (req, res) => {
  const isAuthenticated = !!(req.session && req.session.user);
  console.log('Auth status check:', {
    hasSession: !!req.session,
    hasUser: !!(req.session && req.session.user),
    isAuthenticated,
    userEmail: req.session?.user?.email
  });
  
  res.json({ 
    success: true, 
    isAuthenticated,
    user: isAuthenticated ? req.session.user : null
  });
});

router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: '現在のパスワードと新しいパスワードが必要です'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: '新しいパスワードは6文字以上である必要があります'
      });
    }

    // 現在のパスワードを確認
    const authResult = await userModel.authenticateUser(req.session.user.email, currentPassword);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        error: '現在のパスワードが正しくありません'
      });
    }

    // パスワードを更新
    const updateResult = await userModel.updatePassword(req.session.user.id, newPassword);
    if (updateResult.success) {
      res.json({
        success: true,
        message: 'パスワードが更新されました'
      });
    } else {
      res.status(500).json(updateResult);
    }
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      success: false,
      error: 'パスワード変更エラーが発生しました'
    });
  }
});

module.exports = router;