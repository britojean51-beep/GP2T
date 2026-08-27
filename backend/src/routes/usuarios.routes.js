import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { authorize } from '../middlewares/authorize.js';
import * as service from '../services/usuarios.service.js';

const router = Router();
router.use(authMiddleware, authorize('ADMINISTRADOR'));

router.get('/', async (req, res, next) => {
  try {
    res.json(await service.listUsuarios());
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await service.createUsuario(req.body, req.user));
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    res.json(await service.updateUsuario(req.params.id, req.body, req.user));
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/inativar', async (req, res, next) => {
  try {
    await service.inativarUsuario(req.params.id, req.user);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

export default router;
