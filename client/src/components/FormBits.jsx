import { Link } from 'react-router-dom';

/** Maps API validation details ({field, message}) to an object keyed by field. */
export const fieldErrors = (err) =>
  Object.fromEntries((err?.details || []).filter((d) => d.field).map((d) => [d.field, d.message]));

export function Consent({ checked, onChange, error, id = 'consent', children }) {
  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-[#2f5846]" />
        <span>{children || <>I agree to my details being used to handle this request, as described in the <Link to="/privacy" target="_blank" className="underline">privacy notice</Link>.</>}</span>
      </label>
      {error && <p className="mt-1 text-sm text-cherry" role="alert">{error}</p>}
    </div>
  );
}
