import { Config } from '../models/index.js';

export const DEFAULTS = {
  // GST on accommodation is set by the declared nightly tariff per room (assumption A1; confirm with the client's tax advisor).
  gstSlabs: [
    { upToPaise: 750000, rate: 5 }, // up to and including ₹7,500
    { upToPaise: null, rate: 18 }, // above ₹7,500
  ],
  aiConfidenceThreshold: 0.7,
  holdMinutes: 10,
};

export async function getConfig(key) {
  const doc = await Config.findOne({ key }).lean();
  return doc ? doc.value : DEFAULTS[key];
}
