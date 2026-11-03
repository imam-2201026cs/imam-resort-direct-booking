import { Router } from 'express';
import { Enquiry } from '../models/index.js';
import { User } from '../models/User.js';
import { requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/errors.js';
import { createEnquiry, reroute, regenerateDraft, sendReply } from '../services/enquiry.js';
import { listQuery, routeBody, draftBody, sendBody, statusBody, simulateBody } from '../validators/enquiry.js';

const router = Router();
router.use(requireStaff);
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const isGm = (u) => u.role === 'gm';
// Staff work the reservations and sales lanes; Unsorted and complaints belong to the GM.
const visibleLanes = (u) => (isGm(u) ? ['unsorted', 'reservations', 'sales', 'gm'] : ['reservations', 'sales']);

async function actor(req) {
  const u = await User.findById(req.user.id).lean();
  return { name: u?.name ?? 'Staff', id: req.user.id };
}

async function load(reference, user) {
  const e = await Enquiry.findOne({ reference: String(reference).toUpperCase() }).lean();
  if (!e || !visibleLanes(user).includes(e.lane)) throw new AppError(404, 'NOT_FOUND', 'Enquiry not found');
  return e;
}

const summary = (e, owners) => ({
  reference: e.reference, source: e.source, name: e.sender?.name, snippet: e.message.slice(0, 140),
  category: e.category, lane: e.lane, confidence: e.ai?.confidence, aiSource: e.ai?.source, aiStatus: e.ai?.status,
  status: e.status, gmAlert: e.gmAlert, owner: owners.get(String(e.owner)) ?? null, createdAt: e.createdAt, firstResponseAt: e.firstResponseAt,
});
const detail = (e, owners) => ({
  ...summary(e, owners), sender: e.sender, message: e.message, form: e.form, ai: e.ai,
  draftReply: e.draftReply, sentReply: e.sentReply, events: e.events,
});
const ownerMap = async () => new Map((await User.find().lean()).map((u) => [String(u._id), u.name]));

router.get('/enquiries', validate(listQuery, 'query'), wrap(async (req, res) => {
  const { lane, status } = req.query;
  const lanes = visibleLanes(req.user);
  if (lane && !lanes.includes(lane)) throw new AppError(403, 'FORBIDDEN', 'You do not have access to that lane');
  const filter = { lane: lane ? lane : { $in: lanes } };
  if (status === 'open') filter.status = { $in: ['new', 'in_progress'] };
  else if (status) filter.status = status;
  const [rows, owners, counts] = await Promise.all([
    Enquiry.find(filter).sort({ gmAlert: -1, createdAt: -1 }).limit(100).lean(),
    ownerMap(),
    Enquiry.aggregate([{ $match: { lane: { $in: lanes }, status: { $in: ['new', 'in_progress'] } } }, { $group: { _id: '$lane', n: { $sum: 1 } } }]),
  ]);
  const gmAlerts = isGm(req.user) ? await Enquiry.countDocuments({ gmAlert: true, status: { $in: ['new', 'in_progress'] } }) : 0;
  res.json({ items: rows.map((e) => summary(e, owners)), counts: Object.fromEntries(lanes.map((l) => [l, counts.find((c) => c._id === l)?.n ?? 0])), gmAlerts, lanes });
}));

router.get('/enquiries/:reference', wrap(async (req, res) => {
  const e = await load(req.params.reference, req.user);
  res.json({ enquiry: detail(e, await ownerMap()) });
}));

// One-click re-route. Staff can escalate to the GM but cannot move things into Unsorted.
router.patch('/enquiries/:reference/route', validate(routeBody), wrap(async (req, res) => {
  const e = await load(req.params.reference, req.user);
  if (req.body.lane === 'unsorted' && !isGm(req.user)) throw new AppError(403, 'FORBIDDEN', 'Only the GM can move an enquiry to Unsorted');
  const updated = await reroute(e.reference, req.body, await actor(req));
  res.json({ enquiry: detail(updated, await ownerMap()) });
}));

router.post('/enquiries/:reference/draft/regenerate', wrap(async (req, res) => {
  const e = await load(req.params.reference, req.user);
  res.json({ enquiry: detail(await regenerateDraft(e.reference, await actor(req)), await ownerMap()) });
}));

router.put('/enquiries/:reference/draft', validate(draftBody), wrap(async (req, res) => {
  const e = await load(req.params.reference, req.user);
  await Enquiry.updateOne({ reference: e.reference }, { $set: { draftReply: req.body.draftReply, status: e.status === 'new' ? 'in_progress' : e.status } });
  res.json({ enquiry: detail(await Enquiry.findOne({ reference: e.reference }).lean(), await ownerMap()) });
}));

router.post('/enquiries/:reference/send', validate(sendBody), wrap(async (req, res) => {
  const e = await load(req.params.reference, req.user);
  res.json({ enquiry: detail(await sendReply(e.reference, req.body.body, await actor(req)), await ownerMap()) });
}));

router.patch('/enquiries/:reference/status', validate(statusBody), wrap(async (req, res) => {
  const e = await load(req.params.reference, req.user);
  await Enquiry.updateOne({ reference: e.reference }, { $set: { status: req.body.status } });
  res.json({ enquiry: detail(await Enquiry.findOne({ reference: e.reference }).lean(), await ownerMap()) });
}));

// Demo tool: pretend a forwarded email or a WhatsApp message arrived. Runs the same pipeline as real intake.
router.post('/simulate-inbound', validate(simulateBody), wrap(async (req, res) => {
  const { source, fromName, fromContact, message } = req.body;
  const sender = { name: fromName, ...(source === 'email' ? { email: fromContact } : { phone: fromContact }) };
  const e = await createEnquiry({ source, sender, message });
  const owners = await ownerMap();
  const visible = visibleLanes(req.user).includes(e.lane);
  res.status(201).json({ reference: e.reference, lane: e.lane, enquiry: visible ? detail(e, owners) : null });
}));

router.get('/metrics', wrap(async (req, res) => {
  const lanes = visibleLanes(req.user);
  const replied = await Enquiry.find({ lane: { $in: lanes }, firstResponseAt: { $exists: true } }, 'createdAt firstResponseAt').lean();
  const mins = replied.map((r) => (r.firstResponseAt - r.createdAt) / 60000).sort((a, b) => a - b);
  const median = mins.length ? (mins.length % 2 ? mins[(mins.length - 1) / 2] : (mins[mins.length / 2 - 1] + mins[mins.length / 2]) / 2) : null;
  res.json({
    medianFirstReplyMinutes: median === null ? null : Math.round(median),
    replied: replied.length,
    open: await Enquiry.countDocuments({ lane: { $in: lanes }, status: { $in: ['new', 'in_progress'] } }),
  });
}));

export default router;
