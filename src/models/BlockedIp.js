import mongoose from 'mongoose';

const { Schema } = mongoose;

const BlockedIpSchema = new Schema(
  {
    ip: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    blockedUntil: {
      type: Date,
      required: true,
      index: true,
    },
    permanent: {
      type: Boolean,
      default: false,
      index: true,
    },
    reason: {
      type: String,
      default: 'validate_abuse',
      maxlength: 120,
    },
  },
  { timestamps: true }
);

BlockedIpSchema.index({ ip: 1, blockedUntil: 1 });

export default mongoose.models.BlockedIp || mongoose.model('BlockedIp', BlockedIpSchema);
