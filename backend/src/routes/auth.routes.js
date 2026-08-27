import { Router } from 'express';
import * as authService from '../services/auth.service.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, senha } = req.body;
    res.json(await authService.login(email, senha));
  } catch (e) {
    next(e);
  }
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ usuario: req.user });
});

export default router;
