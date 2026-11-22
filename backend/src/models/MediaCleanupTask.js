import mongoose from 'mongoose';

const mediaCleanupTaskSchema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    url: {
      type: String,
      trim: true,
      default: '',
    },
    provider: {
      type: String,
      enum: ['cloudinary', 'local'],
      required: true,
    },
    ownerType: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    attempts: {
      type: Number,
      default: 1,
    },
    lastError: {
      type: String,
      default: '',
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

mediaCleanupTaskSchema.index({ status: 1, createdAt: -1 });

export const MediaCleanupTask = mongoose.model('MediaCleanupTask', mediaCleanupTaskSchema);
export default MediaCleanupTask;
