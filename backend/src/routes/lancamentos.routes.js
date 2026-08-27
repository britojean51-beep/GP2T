import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { authorize } from '../middlewares/authorize.js';
import * as service from '../services/lancamentos.service.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const { data, equipamentoId, operadorId, limit } = req.query;
    res.json(await service.listLancamentos({ data, equipamentoId, operadorId, limit }));
  } catch (e) {
    next(e);
  }
});

router.post('/', authorize('ADMINISTRADOR', 'OPERACIONAL'), async (req, res, next) => {
  try {
    res.status(201).json(await service.createLancamento(req.body, req.user));
  } catch (e) {
    next(e);
  }
});

router.put('/:id', authorize('ADMINISTRADOR', 'OPERACIONAL'), async (req, res, next) => {
  try {
    res.json(await service.updateLancamento(req.params.id, req.body, req.user));
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', authorize('ADMINISTRADOR', 'OPERACIONAL'), async (req, res, next) => {
  try {
    await service.deleteLancamento(req.params.id, req.user);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

export default router;
