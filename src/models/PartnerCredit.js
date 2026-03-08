import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';

connectDB();

const { Schema } = mongoose;

const PartnerCreditSchema = new Schema(
  {
    appId: {
      type: Schema.Types.ObjectId,
      ref: 'App',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

PartnerCreditSchema.index({ appId: 1, userId: 1 }, { unique: true });

const PartnerCredit =
  mongoose.models.PartnerCredit || mongoose.model('PartnerCredit', PartnerCreditSchema);

export default PartnerCredit;
