import mongoose from 'mongoose';

const providerServiceSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider',
      required: [true, 'Provider ID is required'],
      index: true,
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProviderAccount',
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Service or package title is required'],
      trim: true,
      minlength: [2, 'Service title must be at least 2 characters'],
      maxlength: [120, 'Service title cannot exceed 120 characters'],
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    category: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
    },
    categorySlug: {
      type: String,
      required: [true, 'Category slug is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    subcategory: {
      type: String,
      trim: true,
      default: '',
    },
    subcategorySlug: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Service description is required'],
      trim: true,
      maxlength: [1500, 'Service description cannot exceed 1500 characters'],
    },
    shortDescription: {
      type: String,
      trim: true,
      maxlength: [250, 'Short description cannot exceed 250 characters'],
      default: '',
    },
    priceLabel: {
      type: String,
      trim: true,
      maxlength: [80, 'Price label cannot exceed 80 characters'],
      default: 'Custom Quote',
    },
    priceAmount: {
      type: Number,
      min: 0,
      default: null,
    },
    pricingModel: {
      type: String,
      enum: ['custom_quote', 'starting_from', 'fixed_package', 'hourly', 'per_sqft'],
      default: 'custom_quote',
    },
    deliverables: {
      type: [String],
      default: [],
    },
    serviceAreas: {
      type: [String],
      default: [],
    },
    estimatedDuration: {
      type: String,
      trim: true,
      maxlength: [80, 'Estimated duration cannot exceed 80 characters'],
      default: '',
    },
    approvalStatus: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    publicationStatus: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
      default: 'DRAFT',
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

providerServiceSchema.index({ providerId: 1, createdAt: -1 });
providerServiceSchema.index({ providerId: 1, approvalStatus: 1, publicationStatus: 1 });
providerServiceSchema.index({ providerId: 1, slug: 1 }, { unique: true });

export const ProviderService = mongoose.model('ProviderService', providerServiceSchema);
export default ProviderService;
