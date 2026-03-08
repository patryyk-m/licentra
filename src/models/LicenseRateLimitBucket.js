import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';

connectDB();

const { Schema } = mongoose;

const LicenseRateLimitBucketSchema = new Schema(
  {
    licenseId: { type: Schema.Types.ObjectId, ref: 'License', required: true, index: true },
    bucketStart: { type: Date, required: true, index: true },
    count: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

LicenseRateLimitBucketSchema.index({ licenseId: 1, bucketStart: 1 }, { unique: true });
LicenseRateLimitBucketSchema.index({ createdAt: 1 }, { expireAfterSeconds: 120 });

const LicenseRateLimitBucket =
  mongoose.models.LicenseRateLimitBucket ||
  mongoose.model('LicenseRateLimitBucket', LicenseRateLimitBucketSchema);

export default LicenseRateLimitBucket;

