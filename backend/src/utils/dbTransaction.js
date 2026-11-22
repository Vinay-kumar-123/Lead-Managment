import mongoose from 'mongoose';
import logger from './logger.js';

/**
 * Executes an async database operation inside a MongoDB transaction when
 * connected to a replica set or mongos. Gracefully falls back to sequential
 * execution in standalone MongoDB or disconnected/mocked test environments.
 */
export async function runInTransaction(operation) {
  if (mongoose.connection.readyState !== 1 || typeof mongoose.startSession !== 'function') {
    return operation(null);
  }

  let session = null;
  try {
    session = await mongoose.startSession();
  } catch (err) {
    logger.warn('Could not start MongoDB session, running without transaction', {
      error: err.message,
    });
    return operation(null);
  }

  try {
    let result;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } catch (err) {
    const msg = String(err?.message || '');
    const isUnsupportedTransaction =
      err?.code === 20 ||
      err?.codeName === 'IllegalOperation' ||
      msg.includes('Transaction numbers are only allowed on a replica set member') ||
      msg.includes('Transactions are not supported');

    if (isUnsupportedTransaction) {
      logger.warn('MongoDB deployment does not support multi-document transactions; falling back to sequential writes.');
      return operation(null);
    }
    throw err;
  } finally {
    try {
      await session.endSession();
    } catch {
      // Ignore session cleanup errors
    }
  }
}

export default { runInTransaction };
