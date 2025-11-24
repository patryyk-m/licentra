import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';

connectDB();

const { Schema } = mongoose;

const AppInviteSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    appId: {
      type: Schema.Types.ObjectId,
      ref: 'App',
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    redeemedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'redeemed', 'revoked', 'expired'],
      default: 'active',
      index: true,
    },
    targetRole: {
      type: String,
      enum: ['partner', 'collaborator'],
      default: 'partner',
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    redeemedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const AppInvite =
  mongoose.models.AppInvite || mongoose.model('AppInvite', AppInviteSchema);

export default AppInvite;


