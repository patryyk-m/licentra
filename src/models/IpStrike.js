import mongoose from 'mongoose';

const { Schema } = mongoose;

const IpStrikeSchema = new Schema(
  {
    ip: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    strikes: {
      type: Number,
      default: 0,
      min: 0,
    },
    windowStart: {
      type: Date,
      default: () => new Date(),
    },
  },
  { timestamps: true }
);

export default mongoose.models.IpStrike || mongoose.model('IpStrike', IpStrikeSchema);
