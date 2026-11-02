// Money is stored as integer paise everywhere. Only formatting converts to rupees.
export const toPaise = (rupees) => Math.round(rupees * 100);
export const roundPaise = (n) => Math.round(n);

export function inr(paise) {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
