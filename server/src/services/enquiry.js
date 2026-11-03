import { Enquiry, Config } from '../models/index.js';
import { User } from '../models/User.js';
import { AppError } from '../middleware/errors.js';
import { analyze } from '../ai/analyze.js';
import { buildDraft } from './draft.js';
import { getConfig } from './config.js';

export const LANE_FOR = { room_booking: 'reservations', wedding: 'sales', corporate_offsite: 'sales', complaint: 'gm' };

/** Low confidence or unclear intent goes to the GM's Unsorted lane instead of being guessed. */
export function decideLane(category, confidence, threshold) {
  if (category === 'other' || confidence < threshold) return 'unsorted';
  return LANE_FOR[category] ?? 'unsorted';
}

async function nextReference() {
  const c = await Config.findOneAndUpdate({ key: 'enquirySeq' }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after' }).lean();
  return `ENQ-${String(c.value).padStart(4, '0')}`;
}

/** The least-loaded person on the team that owns the lane. */
export async function pickOwner(lane) {
  if (lane === 'unsorted') return null;
  const people = await User.find({ team: lane }).lean();
  if (!people.length) return null;
  const loads = await Enquiry.aggregate([
    { $match: { owner: { $in: people.map((p) => p._id) }, status: { $in: ['new', 'in_progress'] } } },
    { $group: { _id: '$owner', n: { $sum: 1 } } },
  ]);
  const load = new Map(loads.map((l) => [String(l._id), l.n]));
  return people.sort((a, b) => (load.get(String(a._id)) ?? 0) - (load.get(String(b._id)) ?? 0))[0];
}

const ev = (by, type, detail) => ({ at: new Date(), by, type, detail });

export async function createEnquiry({ source, sender, message, form, useLlm = true, reference, createdAt, by = 'system' }) {
  const text = message?.trim() || (form?.eventType ? `${form.eventType} enquiry via the event form` : '');
  const { ai, complaintFlag } = await analyze({ message: text, form, useLlm });
  const threshold = await getConfig('aiConfidenceThreshold');
  const lane = decideLane(ai.category, ai.confidence, threshold);
  const owner = await pickOwner(lane);
  const draftReply = await buildDraft({ category: ai.category, sender, extracted: ai.extracted, ownerName: owner?.name });

  const events = [
    ev('system', 'received', `Received via ${source.replace('_', ' ')}`),
    ev('system', 'ai_classified', `${ai.category} at ${Math.round(ai.confidence * 100)}% (${ai.source}${ai.status === 'fallback' ? ', fallback' : ''})`),
    ev('system', 'routed', lane === 'unsorted' ? 'Low confidence: sent to Unsorted for the GM' : `Routed to ${lane}${owner ? ` (${owner.name})` : ''}`),
  ];
  if (complaintFlag) events.push(ev('system', 'gm_alert', 'Complaint detected: GM alerted'));

  const doc = await Enquiry.create({
    reference: reference || (await nextReference()),
    source, sender, message: text, form, ai, category: ai.category, lane, owner: owner?._id,
    draftReply, gmAlert: complaintFlag, events, ...(createdAt ? { createdAt } : {}),
  });
  return doc.toObject();
}

export async function reroute(reference, { lane, category }, actor) {
  const e = await Enquiry.findOne({ reference });
  if (!e) throw new AppError(404, 'NOT_FOUND', 'Enquiry not found');
  const owner = await pickOwner(lane);
  const newCategory = category ?? e.category;
  const from = e.lane;
  e.lane = lane;
  e.category = newCategory;
  e.owner = owner?._id;
  e.draftReply = await buildDraft({ category: newCategory, sender: e.sender, extracted: e.ai?.extracted, ownerName: owner?.name });
  e.events.push(ev(actor.name, 'rerouted', `${from} -> ${lane}${category ? `, category set to ${category}` : ''}`));
  await e.save();
  return e.toObject();
}

export async function regenerateDraft(reference, actor) {
  const e = await Enquiry.findOne({ reference });
  if (!e) throw new AppError(404, 'NOT_FOUND', 'Enquiry not found');
  const owner = e.owner ? await User.findById(e.owner).lean() : null;
  e.draftReply = await buildDraft({ category: e.category, sender: e.sender, extracted: e.ai?.extracted, ownerName: owner?.name });
  e.events.push(ev(actor.name, 'draft_regenerated', 'Draft rebuilt from current rates'));
  await e.save();
  return e.toObject();
}

/** Marks a reply as sent. Never called automatically: only a staff member's explicit action. */
export async function sendReply(reference, body, actor) {
  const e = await Enquiry.findOne({ reference });
  if (!e) throw new AppError(404, 'NOT_FOUND', 'Enquiry not found');
  const now = new Date();
  e.sentReply = body;
  e.status = 'replied';
  if (!e.firstResponseAt) e.firstResponseAt = now;
  e.events.push(ev(actor.name, 'reply_sent', 'Reply sent (simulated delivery)'));
  await e.save();
  return e.toObject();
}
