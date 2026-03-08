import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';

connectDB();

const { Schema } = mongoose;

const AppRateLimitBucketSchema = new Schema(
  {
    appId: { type: Schema.Types.ObjectId, ref: 'App', required: true, index: true },
    bucketStart: { type: Date, required: true, index: true },
    count: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

AppRateLimitBucketSchema.index({ appId: 1, bucketStart: 1 }, { unique: true });
AppRateLimitBucketSchema.index({ createdAt: 1 }, { expireAfterSeconds: 120 });

const AppRateLimitBucket =
  mongoose.models.AppRateLimitBucket || mongoose.model('AppRateLimitBucket', AppRateLimitBucketSchema);

export default AppRateLimitBucket;

