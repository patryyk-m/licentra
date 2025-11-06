import mongoose from 'mongoose';

const { Schema } = mongoose;

const LicenseSchema = new Schema(
  {
    appId: {
      type: Schema.Types.ObjectId,
      ref: 'App',
      required: true,
      index: true,
    },
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    note: {
      type: String,
      default: '',
      maxlength: 500,
      trim: true,
    },
    hwid: {
      type: String,
      default: null,
    },
    hwidLocked: {
      type: Boolean,
      default: false,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['active'],
      default: 'active',
      index: true,
    },
  },
  { timestamps: true }
);

LicenseSchema.index({ appId: 1, status: 1 });
LicenseSchema.index({ appId: 1, createdAt: -1 });

const License = mongoose.models.License || mongoose.model('License', LicenseSchema);
export default License;

