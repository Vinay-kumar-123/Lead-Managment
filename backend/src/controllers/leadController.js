import leadService from '../services/leadService.js';
import storageService from '../services/storageService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

export const leadController = {
  async submitEnquiry(req, res, next) {
    try {
      const lead = await leadService.createEnquiry(req.body);
      logger.info('Quote enquiry successfully processed', {
        referenceId: lead.referenceId,
        category: lead.category,
      });

      return successResponse(
        res,
        {
          referenceId: lead.referenceId,
          status: 'received',
          createdAt: lead.createdAt || new Date(),
        },
        'Your enquiry has been received. Our marketplace team will review your scope and follow up with you.',
        201
      );
    } catch (err) {
      logger.error('Enquiry submission failed in controller', { error: err.message });
      next(err);
    }
  },

  async submitPartnerEnquiry(req, res, next) {
    try {
      // If a shop image was uploaded via multipart/form-data
      if (req.file) {
        try {
          const imageMeta = await storageService.uploadImage(req.file);
          req.body.shopImage = imageMeta;
        } catch (uploadErr) {
          logger.error('Shop image upload failure during partner onboarding', {
            error: uploadErr.message,
          });
          return errorResponse(
            res,
            uploadErr.message || 'Failed to process shop image upload.',
            uploadErr.statusCode || 400
          );
        }
      }

      const lead = await leadService.createPartnerLead(req.body);
      logger.info('Partner application successfully processed', {
        referenceId: lead.referenceId,
        business: lead.businessName,
        hasShopImage: !!lead.shopImage?.url,
      });

      return successResponse(
        res,
        {
          referenceId: lead.referenceId,
          status: 'received',
          createdAt: lead.createdAt || new Date(),
          shopImage: lead.shopImage?.url ? { url: lead.shopImage.url } : null,
        },
        'Your partner application has been received. Our partnerships desk will review your business credentials and shop details.',
        201
      );
    } catch (err) {
      logger.error('Partner submission failed in controller', { error: err.message });
      next(err);
    }
  },

  async submitContactMessage(req, res, next) {
    try {
      const lead = await leadService.createContactLead(req.body);
      logger.info('Contact message successfully received', {
        referenceId: lead.referenceId,
        subject: lead.category,
      });

      return successResponse(
        res,
        {
          referenceId: lead.referenceId,
          status: 'received',
          createdAt: lead.createdAt || new Date(),
        },
        'Your message has been delivered to the Dealsathi communication desk. Our team will get back to you shortly.',
        201
      );
    } catch (err) {
      logger.error('Contact message submission failed in controller', { error: err.message });
      next(err);
    }
  },
};

export default leadController;
