const express = require('express');
const User = require('../models/User');
const { requireAuth, requireAdmin, checkAuth } = require('../middleware/auth');
const router = express.Router();

const userModel = new User();

router.get('/', requireAuth, async (req, res) => {
  try {
    const users = await userModel.findAll();
    // パスワードフィールドを除外
    const safeUsers = users.map(user => {
      const { password, ...safeUser } = user;
      return safeUser;
    });
    res.json({ success: true, data: safeUsers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 特定のルートを先に配置
router.get('/deleted/list', requireAdmin, async (req, res) => {
  try {
    const allUsers = await userModel.findAllIncludingDeleted();
    const deletedUsers = allUsers.filter(user => user.isValid === 'FALSE');
    res.json({ success: true, data: deletedUsers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id/restore', requireAdmin, async (req, res) => {
  try {
    const result = await userModel.update(req.params.id, { 
      isValid: 'TRUE',
      restoredAt: new Date().toISOString()
    });
    if (result.success) {
      res.json({ success: true, message: 'ユーザーを復元しました', data: result.data });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id/permanent', requireAdmin, async (req, res) => {
  try {
    console.log('=== PERMANENT DELETE REQUEST ===');
    console.log('User ID:', req.params.id);
    console.log('Request path:', req.path);
    console.log('Request method:', req.method);
    
    const result = await userModel.delete(req.params.id);
    console.log('Delete result:', result);
    
    if (result.success) {
      res.json({ success: true, message: 'ユーザーを完全に削除しました' });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Permanent delete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 汎用的なルートは後に配置
router.get('/:id', async (req, res) => {
  try {
    console.log('=== GET USER REQUEST ===');
    console.log('User ID:', req.params.id);
    console.log('Request path:', req.path);
    console.log('Request method:', req.method);
    
    const user = await userModel.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'ユーザーが見つかりません' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const result = await userModel.createUser(req.body);
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updatedAt: new Date().toISOString()
    };
    const result = await userModel.update(req.params.id, updateData);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await userModel.softDelete(req.params.id);
    if (result.success) {
      res.json({ success: true, message: 'ユーザーを論理削除しました' });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;