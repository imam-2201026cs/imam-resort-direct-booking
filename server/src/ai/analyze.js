import { classifyByRules } from './rules.js';
import { classifyWithLlm, llmConfigured } from './llm.js';
import { todayIST } from '../lib/dates.js';

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));

/**
 * Classify an enquiry. Order of trust:
 *  1. A structured event form is explicit intent (confidence 1).
 *  2. The LLM, if configured and its output validates.
 *  3. Deterministic rules (also the fallback when the LLM is down, slow or returns junk).
 * The model never writes replies, prices or routing; it only fills a validated structure.
 */
export async function analyze({ message, form, useLlm = true, today = todayIST() }) {
  const rules = classifyByRules(message || '', { today });
  const complaintFlag = rules.complaintFlag;

  if (form?.eventType && form.eventType !== 'other') {
    const extracted = clean({
      ...rules.extracted,
      checkIn: form.eventDate || rules.extracted.checkIn,
      guests: form.guests || rules.extracted.guests,
      nights: form.nights || rules.extracted.nights,
      budgetPaise: form.budgetPaise || rules.extracted.budgetPaise,
    });
    return { ai: { source: 'rules', status: 'ok', category: form.eventType, confidence: 1, extracted, note: 'Structured enquiry form' }, complaintFlag };
  }

  if (useLlm && llmConfigured()) {
    try {
      const llm = await classifyWithLlm(message, today);
      let { confidence } = llm;
      let note;
      // Models are poorly calibrated about their own confidence. If the rules strongly disagree, send it to a human.
      if (llm.category !== rules.category && rules.confidence >= 0.8) {
        confidence = Math.min(confidence, 0.6);
        note = `LLM said ${llm.category}; keyword check said ${rules.category}`;
      }
      const extracted = clean({ ...rules.extracted, ...clean(llm.extracted) });
      return { ai: { source: 'llm', status: 'ok', category: llm.category, confidence, extracted, note }, complaintFlag: complaintFlag || llm.category === 'complaint' };
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? 'timed out' : err?.name === 'ZodError' || err instanceof SyntaxError ? 'returned invalid output' : 'was unavailable';
      return { ai: { source: 'rules', status: 'fallback', category: rules.category, confidence: rules.confidence, extracted: clean(rules.extracted), note: `LLM ${reason}; used keyword rules` }, complaintFlag };
    }
  }
  return { ai: { source: 'rules', status: 'ok', category: rules.category, confidence: rules.confidence, extracted: clean(rules.extracted) }, complaintFlag };
}
