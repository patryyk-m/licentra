import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';

connectDB();

const { Schema } = mongoose;

const UserSchema = new Schema({
  username: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 30,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  plan: {
    type: String,
    enum: ['free', 'pro', 'business'],
    default: 'free',
  },
  role: {
    type: String,
    enum: ['developer', 'partner', 'admin'],
    default: 'developer',
  },
  developerApps: {
    type: [{
      type: Schema.Types.ObjectId,
      ref: 'App',
    }],
    default: [],
  },
  partnerApps: {
    type: [{
      type: Schema.Types.ObjectId,
      ref: 'App',
    }],
    default: [],
  },
  tokenVersion: {
    type: Number,
    default: 0,
  },
  preferences: {
    notifications: {
      loginAlerts: { type: Boolean, default: true },
      passwordChange: { type: Boolean, default: true },
      sessionRevoked: { type: Boolean, default: true },
    },
    privacy: {
      consentToProcessing: { type: Boolean, default: false },
      cookiePreferences: { type: String, enum: ['essential', 'all'], default: 'essential' },
    },
  },
  subscription: {
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null },
    status: { 
      type: String, 
      enum: ['active', 'trialing', 'past_due', 'canceled', 'unpaid', null],
      default: null,
    },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
  },
  passwordReset: {
    token: { type: String, default: null, select: false },
    tokenExpiry: { type: Date, default: null },
  },
}, {
  timestamps: true,
});

UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ 'subscription.stripeCustomerId': 1 });
UserSchema.index({ 'subscription.stripeSubscriptionId': 1 });
UserSchema.index({ 'passwordReset.token': 1 }, { sparse: true });

const User = mongoose.models.User || mongoose.model('User', UserSchema);

export default User;

