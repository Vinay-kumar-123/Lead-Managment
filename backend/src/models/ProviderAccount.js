import mongoose from 'mongoose';

const providerAccountSchema = new mongoose.Schema(
  {
    googleSub: {
      type: String,
      required: [true, 'Google subject identifier (sub) is required'],
      unique: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: [true, 'Verified Google email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    emailVerified: {
      type: Boolean,
      required: true,
      default: true,
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    picture: {
      type: String,
      trim: true,
      default: '',
    },
    role: {
      type: String,
      enum: ['PROVIDER'],
      default: 'PROVIDER',
    },
    providerProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider',
      default: null,
      index: true,
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    onboardingDraft: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    sessionToken: {
      type: String,
      default: null,
      index: true,
    },
    sessionExpiresAt: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const ProviderAccount = mongoose.model('ProviderAccount', providerAccountSchema);
export default ProviderAccount;
