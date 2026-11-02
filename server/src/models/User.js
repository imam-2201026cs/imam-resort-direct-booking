import mongoose from 'mongoose';

export const ROLES = ['staff', 'gm'];
export const TEAMS = ['reservations', 'sales', 'gm'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    // 'gm' is a staff user with extra visibility (Unsorted lane, complaint alerts).
    role: { type: String, enum: ROLES, required: true, default: 'staff' },
    team: { type: String, enum: TEAMS, required: true, default: 'reservations' }, // used for enquiry ownership
  },
  { timestamps: true },
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
