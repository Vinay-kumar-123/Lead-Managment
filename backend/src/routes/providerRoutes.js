import express from 'express';
import providerController from '../controllers/providerController.js';

const router = express.Router();

router.get('/', providerController.getPublicProviders);
router.get('/suggestions', providerController.getPublicSuggestions);
router.get('/:slug', providerController.getPublicProviderBySlug);

export default router;
