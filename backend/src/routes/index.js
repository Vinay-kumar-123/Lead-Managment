import express from 'express';
import leadRoutes from './leadRoutes.js';
import blogRoutes from './blogRoutes.js';
import providerRoutes from './providerRoutes.js';
import categoryRoutes from './categoryRoutes.js';
import adminRoutes from './adminRoutes.js';
import healthController from '../controllers/healthController.js';

const router = express.Router();

router.get('/health', healthController.getHealth);
router.use('/leads', leadRoutes);
router.use('/blogs', blogRoutes);
router.use('/providers', providerRoutes);
router.use('/categories', categoryRoutes);
router.use('/admin', adminRoutes);

export default router;
