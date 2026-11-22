/**
 * Idempotent, Resumable Search Token Backfill Migration
 *
 * Populates searchTokens and locationTokens on existing Provider and ProviderService
 * documents without overwriting any business profile, keyword, or service data.
 *
 * Usage:
 *   node src/scripts/backfillSearchTokens.js
 *   node src/scripts/backfillSearchTokens.js --dry-run --batch-size=100
 *   node src/scripts/backfillSearchTokens.js --after=<lastObjectId>
 */

import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import connectDB, { disconnectDB } from '../config/db.js';
import Provider from '../models/Provider.js';
import ProviderService from '../models/ProviderService.js';
import {
  buildProviderSearchTokens,
  buildProviderLocationTokens,
  buildServiceSearchTokens,
} from '../config/searchDictionary.js';
import logger from '../utils/logger.js';

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export async function backfillCollection({
  Model,
  label,
  computeUpdate,
  batchSize = 100,
  dryRun = false,
  afterId = null,
}) {
  let cursorId = afterId && mongoose.isValidObjectId(afterId) ? new mongoose.Types.ObjectId(afterId) : null;
  let scanned = 0;
  let updated = 0;
  let lastProcessedId = cursorId ? String(cursorId) : null;

  while (true) {
    const filter = cursorId ? { _id: { $gt: cursorId } } : {};
    const docs = await Model.find(filter).sort({ _id: 1 }).limit(batchSize).lean();

    if (!docs || docs.length === 0) break;

    const bulkOps = [];
    for (const doc of docs) {
      scanned++;
      lastProcessedId = String(doc._id);
      const patch = computeUpdate(doc);
      if (patch && Object.keys(patch).length > 0) {
        updated++;
        if (!dryRun) {
          bulkOps.push({
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: patch },
            },
          });
        }
      }
    }

    if (!dryRun && bulkOps.length > 0) {
      await Model.bulkWrite(bulkOps, { ordered: false });
    }

    cursorId = docs[docs.length - 1]._id;
    if (docs.length < batchSize) break;
  }

  logger.info(`[backfillSearchTokens] ${label} complete`, {
    scanned,
    updated,
    dryRun,
    lastProcessedId,
  });

  return { scanned, updated, lastProcessedId };
}

export async function runSearchTokenBackfill({
  batchSize = 100,
  dryRun = false,
  afterProviderId = null,
  afterServiceId = null,
  ensureIndexes = false,
} = {}) {
  const providerResult = await backfillCollection({
    Model: Provider,
    label: 'Provider',
    batchSize,
    dryRun,
    afterId: afterProviderId,
    computeUpdate: (doc) => {
      const nextSearch = buildProviderSearchTokens(doc);
      const nextLocation = buildProviderLocationTokens(doc);
      const patch = {};
      if (!arraysEqual(doc.searchTokens, nextSearch)) {
        patch.searchTokens = nextSearch;
      }
      if (!arraysEqual(doc.locationTokens, nextLocation)) {
        patch.locationTokens = nextLocation;
      }
      return patch;
    },
  });

  const serviceResult = await backfillCollection({
    Model: ProviderService,
    label: 'ProviderService',
    batchSize,
    dryRun,
    afterId: afterServiceId,
    computeUpdate: (doc) => {
      const nextSearch = buildServiceSearchTokens(doc);
      const patch = {};
      if (!arraysEqual(doc.searchTokens, nextSearch)) {
        patch.searchTokens = nextSearch;
      }
      return patch;
    },
  });

  if (ensureIndexes && !dryRun) {
    await Promise.all([Provider.createIndexes(), ProviderService.createIndexes()]);
  }

  return { providerResult, serviceResult };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const ensureIndexes = args.includes('--create-indexes');
  const batchArg = args.find((a) => a.startsWith('--batch-size='));
  const afterArg = args.find((a) => a.startsWith('--after='));

  const batchSize = batchArg ? Math.max(10, Math.min(500, parseInt(batchArg.split('=')[1], 10) || 100)) : 100;
  const afterId = afterArg ? afterArg.split('=')[1] : null;

  await connectDB();
  if (mongoose.connection.readyState !== 1) {
    console.error('MongoDB connection is required to run search token backfill.');
    process.exit(1);
  }

  try {
    const result = await runSearchTokenBackfill({
      batchSize,
      dryRun,
      afterProviderId: afterId,
      ensureIndexes,
    });
    console.log(JSON.stringify({ success: true, dryRun, ...result }, null, 2));
  } finally {
    await disconnectDB();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}

export default { backfillCollection, runSearchTokenBackfill };
