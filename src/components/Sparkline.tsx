export default function Sparkline({
  data,
  width = 120,
  height = 36,
  color = "#FFB224",
  markerIndex,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  markerIndex?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => [i * step, height - 3 - ((v - min) / span) * (height - 6)] as const);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const up = data[data.length - 1] >= data[0];
  const c = color === "auto" ? (up ? "#39C06A" : "#F25C5C") : color;

  return (
    <svg width={width} height={height} className="block">
      <path d={`${path} L${width},${height} L0,${height} Z`} fill={c} opacity={0.08} />
      <path d={path} fill="none" stroke={c} strokeWidth={1.5} strokeLinejoin="round" />
      {markerIndex !== undefined && pts[markerIndex] && (
        <line
          x1={pts[markerIndex][0]}
          y1={2}
          x2={pts[markerIndex][0]}
          y2={height - 2}
          stroke="#FFB224"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      )}
      <circle cx={last[0]} cy={last[1]} r={2.2} fill={c} />
    </svg>
  );
}
