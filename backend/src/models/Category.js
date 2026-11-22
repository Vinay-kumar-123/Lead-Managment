import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      minlength: [2, 'Category name must be at least 2 characters'],
      maxlength: [80, 'Category name cannot exceed 80 characters'],
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    slug: {
      type: String,
      required: [true, 'Category slug is required'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    shortDescription: {
      type: String,
      trim: true,
      maxlength: [200, 'Short description cannot exceed 200 characters'],
      default: '',
    },
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true,
    },
    parentSlug: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      index: true,
    },
    parentName: {
      type: String,
      trim: true,
      default: null,
    },
    isMain: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    icon: {
      type: String,
      trim: true,
      default: 'Layers',
    },
    color: {
      type: String,
      trim: true,
      default: '#012A7A',
    },
    bgColor: {
      type: String,
      trim: true,
      default: '#EEF3FF',
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    popularServices: {
      type: [String],
      default: [],
    },
    metaTitle: {
      type: String,
      trim: true,
      maxlength: [160, 'Meta title cannot exceed 160 characters'],
      default: '',
    },
    metaDescription: {
      type: String,
      trim: true,
      maxlength: [320, 'Meta description cannot exceed 320 characters'],
      default: '',
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: String,
      trim: true,
      default: '',
    },
    deleteReason: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

categorySchema.pre('validate', function (next) {
  if (this.name) {
    this.name = String(this.name).trim().replace(/\s+/g, ' ');
    this.normalizedName = this.name.toLowerCase();
  }
  next();
});

// Database-level uniqueness & query performance indexes
categorySchema.index({ parentCategory: 1, normalizedName: 1 }, { unique: true });
categorySchema.index({ isMain: 1, isActive: 1, displayOrder: 1 });
categorySchema.index({ parentCategory: 1, isActive: 1, displayOrder: 1, name: 1 });
categorySchema.index({ parentSlug: 1, isActive: 1, displayOrder: 1 });

export const Category = mongoose.model('Category', categorySchema);
export default Category;
