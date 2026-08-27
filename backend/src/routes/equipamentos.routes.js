import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { authorize } from '../middlewares/authorize.js';
import * as service from '../services/equipamentos.service.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    res.json(await service.listEquipamentos({ status: req.query.status }));
  } catch (e) {
    next(e);
  }
});

router.post('/', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try {
    res.status(201).json(await service.createEquipamento(req.body, req.user));
  } catch (e) {
    next(e);
  }
});

router.put('/:id', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try {
    res.json(await service.updateEquipamento(req.params.id, req.body, req.user));
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/inativar', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try {
    await service.inativarEquipamento(req.params.id, req.user);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

export default router;
