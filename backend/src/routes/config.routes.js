import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import * as service from '../services/config.service.js';

const router = Router();

router.get('/', authMiddleware, async (req, res, next) => {
  try {
    res.json(await service.getConfig());
  } catch (e) {
    next(e);
  }
});

export default router;
