import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';

connectDB();

const { Schema } = mongoose;

const AdminNoteSchema = new Schema(
  {
    targetType: {
      type: String,
      enum: ['user', 'app', 'license'],
      required: true,
      index: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    note: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    visibility: {
      type: String,
      enum: ['internal', 'user_visible'],
      default: 'internal',
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

AdminNoteSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

const AdminNote = mongoose.models.AdminNote || mongoose.model('AdminNote', AdminNoteSchema);

export default AdminNote;

