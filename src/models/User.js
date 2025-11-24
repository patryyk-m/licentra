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
}, {
  timestamps: true,
});

UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true });

const User = mongoose.models.User || mongoose.model('User', UserSchema);

export default User;

