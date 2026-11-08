import { useMemo, useState } from 'react';

// Misty coffee-hill ridges drawn in SVG. It loads instantly on slow networks and stands in for a photo
// until a real one is dropped into /public/photos/<room-slug>.webp.
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const TONES = {
  dawn: { sky: ['#f3f6f2', '#d4e1d8'], ridges: ['#c3d5ca', '#9fbcad', '#779e8b', '#4e7863', '#2f5846', '#1b362b'], sun: '#fff7e0' },
  noon: { sky: ['#eef5f3', '#cfe1dc'], ridges: ['#bcd3cc', '#94b7ad', '#6c9a8c', '#487a69', '#2c5a4a', '#18372d'], sun: '#ffffff' },
  dusk: { sky: ['#f3efe9', '#d9d3c7'], ridges: ['#cbd0c4', '#a3b4a3', '#799582', '#527762', '#2f5846', '#1b362b'], sun: '#fde9c4' },
};
const TONE_BY_SLUG = { 'garden-room': 'dawn', 'valley-deluxe': 'noon', 'plantation-suite': 'dusk', 'coffee-villa': 'dawn', 'pool-villa': 'noon' };

function ridgePath(seed, baseY, amp, rough) {
  const pts = [];
  for (let x = 0; x <= 800; x += 16) {
    const y = baseY + amp * (Math.sin(x / 140 + seed) + 0.5 * Math.sin(x / 61 + seed * 1.7) + rough * Math.sin(x / 23 + seed * 2.3));
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return `M0,500 L${pts.join(' L')} L800,500 Z`;
}

export default function Landscape({ seed = 'estate', tone, className = '', drift = false }) {
  const key = hash(seed) % 997;
  const t = TONES[tone || TONE_BY_SLUG[seed] || 'dawn'];
  const layers = useMemo(
    () => t.ridges.map((c, i) => ({ c, d: ridgePath(key * 0.013 + i * 1.9, 190 + i * 48, 26 - i * 2.5, 0.18 + i * 0.03), op: i === 0 ? 0.9 : 1 })),
    [key, t],
  );
  const id = `g${key}`;
  return (
    <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={t.sky[0]} /><stop offset="1" stopColor={t.sky[1]} /></linearGradient>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <pattern id={`${id}p`} width="14" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
          <path d="M0 5 Q3.5 2 7 5 T14 5" stroke="#ffffff" strokeOpacity=".07" strokeWidth="1.2" fill="none" />
        </pattern>
      </defs>
      <rect width="800" height="500" fill={`url(#${id}s)`} />
      <circle cx={140 + (key % 5) * 120} cy="120" r="64" fill={t.sun} opacity=".75" />
      {layers.map((l, i) => (
        <g key={i}>
          <path d={l.d} fill={l.c} opacity={l.op} />
          {i < 4 && <rect className={drift ? 'mist-drift' : undefined} x="-40" y={170 + i * 48} width="880" height="60" fill={`url(#${id}m)`} />}
        </g>
      ))}
      <path d={layers[5].d} fill={`url(#${id}p)`} />
    </svg>
  );
}

/** A real photo when one exists, otherwise the illustrated landscape. */
export function RoomPhoto({ room, className = '', priority = false }) {
  const [failed, setFailed] = useState(false);
  const src = room?.photos?.[0];
  if (!src || failed) return <Landscape seed={room?.slug || 'estate'} className={className} />;
  return (
    <img
      src={src}
      alt={`${room.name} at the estate`}
      width="800"
      height="500"
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      className={`object-cover transition-transform duration-700 ease-out hover:scale-[1.03] ${className}`}
    />
  );
}
