import React from 'react';

export default function RadarChart({ attributes, size = 150 }) {
  // Attributes is an array of { label: string, value: number (0-100) }
  const center = size / 2;
  const radius = size / 2.5;
  const angleStep = (Math.PI * 2) / attributes.length;

  const points = attributes.map((attr, i) => {
    const angle = i * angleStep - Math.PI / 2; // Start at top
    const r = (attr.value / 100) * radius;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return `${x},${y}`;
  }).join(' ');

  const gridPoints = [100, 75, 50, 25].map(pct => {
      return attributes.map((_, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const r = (pct / 100) * radius;
          const x = center + r * Math.cos(angle);
          const y = center + r * Math.sin(angle);
          return `${x},${y}`;
      }).join(' ');
  });

  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background Grid */}
        {gridPoints.map((pts, i) => (
            <polygon key={i} points={pts} fill="none" stroke="var(--hairline)" strokeWidth="1" strokeDasharray={i === 0 ? "" : "2,2"} />
        ))}
        {/* Axes */}
        {attributes.map((_, i) => {
            const angle = i * angleStep - Math.PI / 2;
            const x = center + radius * Math.cos(angle);
            const y = center + radius * Math.sin(angle);
            return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="var(--hairline)" strokeWidth="1" />;
        })}
        {/* Data Polygon */}
        <polygon points={points} fill="var(--accent)" fillOpacity="0.4" stroke="var(--accent)" strokeWidth="2" />

        {/* Labels */}
        {attributes.map((attr, i) => {
            const angle = i * angleStep - Math.PI / 2;
            const x = center + (radius + 15) * Math.cos(angle);
            const y = center + (radius + 12) * Math.sin(angle);
            return (
                <text key={i} x={x} y={y} fill="var(--text-muted)" fontSize="9" textAnchor="middle" dominantBaseline="middle" fontWeight="bold">
                    {attr.label}
                </text>
            );
        })}
      </svg>
    </div>
  );
}
