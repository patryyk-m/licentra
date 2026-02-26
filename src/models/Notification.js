import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';

connectDB();

const { Schema } = mongoose;

const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning', index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false, index: true },
    appId: { type: Schema.Types.ObjectId, ref: 'App', index: true },
    licenseId: { type: Schema.Types.ObjectId, ref: 'License', index: true },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ appId: 1, licenseId: 1, type: 1 });

const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
export default Notification;
