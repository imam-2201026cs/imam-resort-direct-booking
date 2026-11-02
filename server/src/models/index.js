import mongoose from 'mongoose';
const { Schema } = mongoose;
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);
const oid = (ref) => ({ type: Schema.Types.ObjectId, ref, required: true });

export const RoomType = model(
  'RoomType',
  new Schema({
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    kind: { type: String, enum: ['room', 'villa'], required: true },
    tagline: String,
    description: String,
    photos: [String],
    amenities: [String],
    maxAdults: { type: Number, required: true, min: 1 },
    maxChildren: { type: Number, required: true, min: 0 },
    totalUnits: { type: Number, required: true, min: 1 },
    sortOrder: { type: Number, default: 0 },
  }),
);

export const RatePlan = model(
  'RatePlan',
  new Schema({
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: String,
    sortOrder: { type: Number, default: 0 },
  }),
);

const dailyRate = new Schema({
  roomTypeId: oid('RoomType'),
  ratePlanId: oid('RatePlan'),
  date: { type: String, required: true },
  price: { type: Number, required: true, min: 0, validate: Number.isInteger }, // paise per room per night
});
dailyRate.index({ roomTypeId: 1, ratePlanId: 1, date: 1 }, { unique: true });
export const DailyRate = model('DailyRate', dailyRate);

const inventory = new Schema({
  roomTypeId: oid('RoomType'),
  date: { type: String, required: true },
  allotment: { type: Number, required: true, min: 0 }, // units released to the website
  reserved: { type: Number, required: true, min: 0, default: 0 }, // units held or sold by the website
  blackout: { type: Boolean, default: false },
});
inventory.index({ roomTypeId: 1, date: 1 }, { unique: true });
export const Inventory = model('Inventory', inventory);

export const BOOKING_STATUS = ['held', 'confirmed', 'expired', 'cancelled'];
const booking = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    roomTypeId: oid('RoomType'),
    ratePlanId: oid('RatePlan'),
    checkIn: { type: String, required: true },
    checkOut: { type: String, required: true },
    units: { type: Number, required: true, min: 1, max: 3 },
    adults: { type: Number, required: true, min: 1 },
    children: { type: Number, required: true, min: 0, default: 0 },
    nights: [
      {
        _id: false,
        date: String,
        price: Number, // paise, snapshot at booking time
        gstRate: Number,
        gst: Number, // paise, for all units
      },
    ],
    subtotal: { type: Number, required: true },
    gstTotal: { type: Number, required: true },
    total: { type: Number, required: true },
    guest: {
      name: { type: String, required: true },
      email: { type: String, required: true, lowercase: true },
      phone: { type: String, required: true },
    },
    specialRequests: String,
    consentAt: { type: Date, required: true }, // DPDP: explicit consent timestamp
    status: { type: String, enum: BOOKING_STATUS, required: true },
    holdExpiresAt: Date,
    payment: {
      method: String,
      status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
      txnId: String,
      paidAt: Date,
      attempts: { type: Number, default: 0 },
    },
    idempotencyKey: { type: String },
    cancelledAt: Date,
  },
  { timestamps: true },
);
booking.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
booking.index({ status: 1, holdExpiresAt: 1 });
booking.index({ checkIn: 1 });
export const Booking = model('Booking', booking);

export const CATEGORIES = ['room_booking', 'wedding', 'corporate_offsite', 'complaint', 'other'];
export const LANES = ['unsorted', 'reservations', 'sales', 'gm'];
const enquiry = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    source: { type: String, enum: ['web_form', 'email', 'whatsapp'], required: true },
    sender: { name: String, email: String, phone: String },
    message: { type: String, required: true },
    form: {
      eventType: String,
      eventDate: String,
      guests: Number,
      budgetPaise: Number,
      nights: Number,
    },
    ai: {
      source: { type: String, enum: ['llm', 'rules'] },
      status: { type: String, enum: ['ok', 'fallback'] }, // fallback = LLM unavailable or invalid output
      category: String,
      confidence: Number,
      extracted: {
        checkIn: String,
        checkOut: String,
        monthHint: String,
        guests: Number,
        nights: Number,
        budgetPaise: Number,
      },
      note: String,
    },
    category: { type: String, enum: CATEGORIES },
    lane: { type: String, enum: LANES, required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User' },
    draftReply: String,
    sentReply: String,
    status: { type: String, enum: ['new', 'in_progress', 'replied', 'closed'], default: 'new' },
    gmAlert: { type: Boolean, default: false },
    events: [{ _id: false, at: Date, by: String, type: String, detail: String }],
    firstResponseAt: Date,
  },
  { timestamps: true },
);
enquiry.index({ lane: 1, status: 1, createdAt: -1 });
export const Enquiry = model('Enquiry', enquiry);

export const Config = model(
  'Config',
  new Schema({ key: { type: String, required: true, unique: true }, value: Schema.Types.Mixed }),
);
