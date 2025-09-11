const express = require('express');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
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
      req.session.user = result.user;
      res.json({ 
        success: true, 
        message: 'ログインしました',
        user: result.user,
        role: result.user.role
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
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        error: 'ログアウトに失敗しました' 
      });
    }
    res.json({ 
      success: true, 
      message: 'ログアウトしました' 
    });
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