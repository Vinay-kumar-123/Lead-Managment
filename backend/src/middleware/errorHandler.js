import logger from '../utils/logger.js';
import { errorResponse } from '../utils/apiResponse.js';

export const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled Server Error', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
  });

  if (err && (err.code === 11000 || String(err.message || '').includes('E11000'))) {
    return errorResponse(res, 'A record with this unique identifier or slug already exists.', 409);
  }

  if (err && err.name === 'CastError') {
    return errorResponse(res, 'Invalid resource identifier format.', 400);
  }

  if (err && err.name === 'ValidationError') {
    return errorResponse(res, 'Validation failed. Please verify the submitted fields.', 400);
  }

  if (err && err.type === 'entity.parse.failed') {
    return errorResponse(res, 'Malformed JSON payload.', 400);
  }

  const statusCode = err.statusCode || 500;
  const message =
    statusCode === 500
      ? 'An unexpected server error occurred. Please try again later.'
      : err.message || 'Request could not be processed.';

  return errorResponse(res, message, statusCode);
};

export const notFoundHandler = (req, res) => {
  return errorResponse(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
};
