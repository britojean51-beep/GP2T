import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import * as service from '../services/manutencoes.service.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    res.json(await service.listManutencoes());
  } catch (e) {
    next(e);
  }
});

export default router;
