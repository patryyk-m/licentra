import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';

connectDB();

const { Schema } = mongoose;

const RateLimitEventSchema = new Schema(
  {
    appId: { type: Schema.Types.ObjectId, ref: 'App', required: true, index: true },
    licenseId: { type: Schema.Types.ObjectId, ref: 'License', required: true, index: true },
    ip: { type: String, required: true },
    endpoint: { type: String, default: '/api/licenses/validate' },
  },
  { timestamps: true }
);

RateLimitEventSchema.index({ appId: 1, licenseId: 1, createdAt: -1 });
RateLimitEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });

const RateLimitEvent = mongoose.models.RateLimitEvent || mongoose.model('RateLimitEvent', RateLimitEventSchema);
export default RateLimitEvent;
