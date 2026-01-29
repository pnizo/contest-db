const express = require('express');
const User = require('../models/User');
const { requireAuth, requireAdmin, checkAuth } = require('../middleware/auth');
const router = express.Router();

const userModel = new User();

router.get('/', requireAuth, async (req, res) => {
  try {
    const users = await userModel.findAll();
    let filteredUsers = users;

    // 一般ユーザーの場合は自分の情報のみを返す
    if (req.user.role !== 'admin') {
      filteredUsers = users.filter(user => user.id === req.user.id);
    }

    // パスワードフィールドを除外
    const safeUsers = filteredUsers.map(user => {
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
    const result = await userModel.deleteById(req.params.id);
    
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

router.put('/:id', requireAuth, async (req, res) => {
  try {
    // ゲストユーザーは自分のプロフィールを編集できない
    if (req.user.role === 'guest' && String(req.params.id) === String(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: 'ゲストユーザーはプロフィールを編集できません'
      });
    }

    // 一般ユーザーは自分のIDのみ更新可能、管理者はすべて更新可能
    if (req.user.role !== 'admin' && req.params.id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: '自分のプロフィールのみ更新できます'
      });
    }

    const updateData = {
      ...req.body,
      updatedAt: new Date().toISOString()
    };

    // 一般ユーザーはroleを変更できない
    if (req.user.role !== 'admin' && updateData.role) {
      delete updateData.role;
    }

    // ゲストユーザーが自分自身のパスワードを変更することを禁止
    if (req.user.role === 'guest' && String(req.params.id) === String(req.user.id) && updateData.password) {
      delete updateData.password;
    }

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