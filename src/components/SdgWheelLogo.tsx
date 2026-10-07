/* SDG wheel — 17 segments in the official UN SDG colors */
const COLORS = [
  "#E5243B", "#DDA63A", "#4C9F38", "#C5192D", "#FF3A21", "#26BDE2", "#FCC30B",
  "#A21942", "#FD6925", "#DD1367", "#FD9D24", "#BF8B2E", "#3F7E44", "#0A97D9",
  "#56C02B", "#00689D", "#19486A",
];

const CX = 32;
const CY = 32;
const R_OUT = 30;
const R_IN = 16.5;
const STEP = 360 / 17;
const GAP_HALF = 1.05; // degrees of breathing room between segments

function polar(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  // Round to 3 decimals — Math.cos/sin precision differs between the server
  // and the browser, and unrounded floats in `d` cause hydration mismatches.
  const round = (v: number) => Number(v.toFixed(3));
  return [round(CX + r * Math.cos(rad)), round(CY + r * Math.sin(rad))];
}

function segPath(startDeg: number, endDeg: number) {
  const [x1, y1] = polar(R_OUT, startDeg);
  const [x2, y2] = polar(R_OUT, endDeg);
  const [x3, y3] = polar(R_IN, endDeg);
  const [x4, y4] = polar(R_IN, startDeg);
  return `M ${x1} ${y1} A ${R_OUT} ${R_OUT} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${R_IN} ${R_IN} 0 0 0 ${x4} ${y4} Z`;
}

const SEGMENTS = COLORS.map((color, i) => ({
  color,
  d: segPath(i * STEP + GAP_HALF, (i + 1) * STEP - GAP_HALF),
}));

export default function SdgWheelLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Sustainable Development Goals wheel">
      {SEGMENTS.map((s, i) => (
        <path key={i} d={s.d} fill={s.color} />
      ))}
    </svg>
  );
}
