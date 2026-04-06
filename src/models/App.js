import mongoose from 'mongoose';

const { Schema } = mongoose;

const AppSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 40,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      maxlength: 500,
      trim: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    apiSecretHash: {
      type: String,
      default: '',
      select: false,
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'suspended'],
      default: 'active',
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    autoSuspendOnRateLimitAbuse: {
      type: Boolean,
      default: false,
    },
    quotaSuspended: {
      type: Boolean,
      default: false,
      index: true,
    },
    quotaSuspendedMonth: {
      type: String,
      default: null,
    },
    suspensionReason: {
      type: String,
      enum: ['none', 'admin', 'plan_quota'],
      default: 'none',
      index: true,
    },
    partnerLicenseConfig: {
      enabled: {
        type: Boolean,
        default: false,
      },
      mask: {
        type: String,
        default: '*****-****',
        maxlength: 64,
        trim: true,
      },
      lowercase: {
        type: Boolean,
        default: true,
      },
      uppercase: {
        type: Boolean,
        default: true,
      },
      numbers: {
        type: Boolean,
        default: true,
      },
      symbols: {
        type: Boolean,
        default: false,
      },
    },
  },
  { timestamps: true }
);

// unique app name per owner
AppSchema.index({ ownerId: 1, name: 1 }, { unique: true });
// listing apps by sort order
AppSchema.index({ ownerId: 1, sortOrder: 1 });

const App = mongoose.models.App || mongoose.model('App', AppSchema);
export default App;


