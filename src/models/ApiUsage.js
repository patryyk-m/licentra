import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';

connectDB();

const { Schema } = mongoose;

const ApiUsageSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: 'App',
    required: true,
    index: true,
  },
  licenseId: {
    type: Schema.Types.ObjectId,
    ref: 'License',
    default: null,
    index: true,
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
  count: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

ApiUsageSchema.index({ userId: 1, appId: 1, licenseId: 1, date: 1 }, { unique: true });
ApiUsageSchema.index({ appId: 1, date: 1 });
ApiUsageSchema.index({ appId: 1, licenseId: 1, date: 1 });

const ApiUsage = mongoose.models.ApiUsage || mongoose.model('ApiUsage', ApiUsageSchema);

export default ApiUsage;
