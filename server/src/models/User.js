import mongoose from 'mongoose';

export const ROLES = ['staff', 'gm'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    // 'gm' is a staff user with extra visibility (Unsorted lane, complaint alerts).
    role: { type: String, enum: ROLES, required: true, default: 'staff' },
  },
  { timestamps: true },
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
