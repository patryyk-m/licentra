import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';

connectDB();

const { Schema } = mongoose;

const RateLimitAggregateSchema = new Schema(
  {
    appId: { type: Schema.Types.ObjectId, ref: 'App', required: true, index: true },
    licenseId: { type: Schema.Types.ObjectId, ref: 'License', required: true, index: true },
    lastNotifiedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

RateLimitAggregateSchema.index({ appId: 1, licenseId: 1 }, { unique: true });

const RateLimitAggregate = mongoose.models.RateLimitAggregate || mongoose.model('RateLimitAggregate', RateLimitAggregateSchema);
export default RateLimitAggregate;
