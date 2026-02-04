import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';

connectDB();

const { Schema } = mongoose;

const SecurityLogSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  event: {
    type: String,
    required: true,
    index: true,
  },
  ip: {
    type: String,
    default: 'unknown',
  },
  userAgent: {
    type: String,
    default: 'unknown',
  },
  resource: {
    type: String,
    default: '',
  },
  reason: {
    type: String,
    default: '',
  },
  details: {
    type: Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

// index for efficient queries
SecurityLogSchema.index({ userId: 1, createdAt: -1 });
SecurityLogSchema.index({ event: 1, createdAt: -1 });

const SecurityLog = mongoose.models.SecurityLog || mongoose.model('SecurityLog', SecurityLogSchema);

export default SecurityLog;


