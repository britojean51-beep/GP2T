import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import * as service from '../services/resumos.service.js';

const router = Router();
router.use(authMiddleware);

router.get('/diario', async (req, res, next) => {
  try {
    res.json(await service.getResumoDiario(req.query.data));
  } catch (e) {
    next(e);
  }
});

router.get('/semanal', async (req, res, next) => {
  try {
    res.json(await service.getResumoSemanal(req.query.data));
  } catch (e) {
    next(e);
  }
});

router.get('/mensal', async (req, res, next) => {
  try {
    res.json(await service.getResumoMensal(req.query.mes));
  } catch (e) {
    next(e);
  }
});

router.get('/operadores', async (req, res, next) => {
  try {
    res.json(await service.getHistOperadores());
  } catch (e) {
    next(e);
  }
});

router.get('/equipamentos', async (req, res, next) => {
  try {
    res.json(await service.getHistEquipamentos());
  } catch (e) {
    next(e);
  }
});

export default router;
