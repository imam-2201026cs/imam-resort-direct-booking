import { forwardRef } from 'react';

const cx = (...a) => a.filter(Boolean).join(' ');

const BTN = {
  primary: 'bg-moss-600 text-white hover:bg-moss-700 disabled:bg-moss-600/50',
  secondary: 'border border-moss-600 text-moss-700 hover:bg-moss-50 disabled:opacity-50',
  ghost: 'text-moss-700 hover:bg-moss-100 disabled:opacity-50',
  danger: 'bg-cherry text-white hover:bg-[#9a2a26] disabled:opacity-50',
};
export function Button({ variant = 'primary', size = 'md', loading, className, children, ...p }) {
  return (
    <button
      {...p}
      disabled={p.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-5 py-3 text-base',
        BTN[variant], className,
      )}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" role="status" aria-label="Loading">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const inputCls = 'w-full rounded-md border border-line bg-white px-3 py-2.5 text-base text-ink placeholder:text-muted/70 focus:border-moss-600 disabled:bg-moss-50';
export const Input = forwardRef(function Input({ className, ...p }, ref) { return <input ref={ref} {...p} className={cx(inputCls, className)} />; });
export const Select = forwardRef(function Select({ className, children, ...p }, ref) { return <select ref={ref} {...p} className={cx(inputCls, className)}>{children}</select>; });
export const Textarea = forwardRef(function Textarea({ className, ...p }, ref) { return <textarea ref={ref} {...p} className={cx(inputCls, 'min-h-28', className)} />; });

export function Field({ label, error, hint, htmlFor, children, className }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-sm text-muted">{hint}</p>}
      {error && <p className="mt-1 text-sm text-cherry" role="alert">{error}</p>}
    </div>
  );
}

const NOTICE = {
  info: 'bg-moss-50 text-moss-800 border-moss-100',
  warn: 'bg-amber-50 text-amber-ink border-[#ecd9a5]',
  error: 'bg-cherry-50 text-cherry border-[#efc5c3]',
  success: 'bg-moss-100 text-moss-800 border-moss-100',
};
export function Notice({ tone = 'info', title, children, className }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('rounded-md border px-4 py-3 text-sm', NOTICE[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
    </div>
  );
}

export function Skeleton({ className }) { return <div className={cx('skeleton', className)} aria-hidden="true" />; }

export function ErrorState({ error, onRetry, title = 'We could not load this' }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="text-2xl text-ink">{title}</h2>
      <p className="mt-2 text-muted">{error?.message || 'Something went wrong.'}</p>
      {onRetry && <Button className="mt-5" variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="mx-auto max-w-md py-14 text-center">
      <h3 className="text-xl text-ink">{title}</h3>
      {children && <p className="mt-2 text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const BADGE = {
  neutral: 'bg-moss-100 text-moss-800',
  good: 'bg-moss-600 text-white',
  warn: 'bg-amber-50 text-amber-ink border border-[#ecd9a5]',
  bad: 'bg-cherry-50 text-cherry border border-[#efc5c3]',
};
export function Badge({ tone = 'neutral', children, className }) {
  return <span className={cx('inline-block rounded px-2 py-0.5 text-xs font-medium', BADGE[tone], className)}>{children}</span>;
}

export { cx };
