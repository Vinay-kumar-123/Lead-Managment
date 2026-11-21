import express from 'express';
import categoryController from '../controllers/categoryController.js';

const router = express.Router();

// Strictly read-only public marketplace category & subcategory endpoints
router.get('/', categoryController.getPublicCategories);
router.get('/:slug/subcategories', categoryController.getPublicSubcategoriesByMainSlug);
router.get('/:slug', categoryController.getPublicCategoryBySlug);

export default router;
