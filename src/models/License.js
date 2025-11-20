import mongoose from 'mongoose';

const { Schema } = mongoose;

const LicenseSchema = new Schema(
  {
    appId: {
      type: Schema.Types.ObjectId,
      ref: 'App',
      required: true,
      index: true,
    },
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    note: {
      type: String,
      default: '',
      maxlength: 500,
      trim: true,
    },
    hwids: {
      type: [String],
      default: [],
      validate: {
        validator: function(v) {
          return v.length <= 5;
        },
        message: 'maximum 5 hwids allowed per license',
      },
    },
    hwidLimit: {
      type: Number,
      min: 1,
      max: 5,
      default: 1,
    },
    hwidLocked: {
      type: Boolean,
      default: false,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['active'],
      default: 'active',
      index: true,
    },
  },
  { timestamps: true }
);

LicenseSchema.index({ appId: 1, status: 1 });
LicenseSchema.index({ appId: 1, createdAt: -1 });

if (process.env.NODE_ENV === 'development' && mongoose.models.License) {
  delete mongoose.models.License;
}

const License = mongoose.models.License || mongoose.model('License', LicenseSchema);
export default License;

