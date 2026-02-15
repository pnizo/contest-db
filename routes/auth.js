const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { generateToken } = require('../middleware/jwt');
const router = express.Router();

const userModel = new User();

// Google OAuth2 クライアント
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Google Client IDをフロントエンドに提供
router.get('/config', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
});

// Google IDトークンを検証してJWTを発行
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        error: 'Google認証情報が必要です'
      });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        success: false,
        error: 'Google SSOが設定されていません'
      });
    }

    // Google IDトークンを検証
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, email_verified } = payload;

    if (!email_verified) {
      return res.status(401).json({
        success: false,
        error: 'メールアドレスが確認されていません'
      });
    }

    // メールアドレスで既存ユーザーを検索
    const user = await userModel.findByEmail(email);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'このメールアドレスは登録されていません。管理者にお問い合わせください。'
      });
    }

    // guestロールはGoogle SSO不可
    if (user.role === 'guest') {
      return res.status(403).json({
        success: false,
        error: 'ゲストアカウントはメール/パスワードでログインしてください'
      });
    }

    // Google IDのリンクチェック
    if (user.googleId && user.googleId !== googleId) {
      // 既に別のGoogleアカウントがリンクされている
      return res.status(403).json({
        success: false,
        error: '別のGoogleアカウントが既にリンクされています'
      });
    }

    // 初回ログイン時にGoogle IDをリンク
    if (!user.googleId) {
      await userModel.update(user.id, { googleId });
    }

    // パスワードを除いたユーザー情報
    const { password: _, ...userWithoutPassword } = user;

    // セッションに保存
    if (req.session) {
      req.session.user = userWithoutPassword;
    }

    // JWTトークンを生成
    const token = generateToken(userWithoutPassword);

    res.json({
      success: true,
      message: 'Google SSOでログインしました',
      user: userWithoutPassword,
      role: userWithoutPassword.role,
      token: token
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Google認証エラーが発生しました'
    });
  }
});

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
      console.log('Generated JWT token for login:', token ? token.substring(0, 20) + '...' : 'null');

      const loginResponse = {
        success: true,
        message: 'ログインしました',
        user: result.user,
        role: result.user.role,
        token: token
      };

      console.log('Login response sent:', {
        success: loginResponse.success,
        hasToken: !!loginResponse.token,
        userEmail: loginResponse.user.email
      });

      res.json(loginResponse);
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
    // Google SSOユーザー（admin/user）はパスワード変更不可
    if (req.session.user.role !== 'guest') {
      return res.status(403).json({
        success: false,
        error: 'Google SSOユーザーはパスワードを変更できません'
      });
    }

    // ゲストユーザーはパスワード変更不可
    if (req.session.user.role === 'guest') {
      return res.status(403).json({
        success: false,
        error: 'ゲストユーザーはパスワードを変更できません'
      });
    }

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
    const user = await userModel.findByEmail(req.session.user.email);
    if (!user || !user.password) {
      return res.status(400).json({
        success: false,
        error: 'パスワードが設定されていません'
      });
    }

    const isValidPassword = await userModel.comparePassword(currentPassword, user.password);
    if (!isValidPassword) {
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
