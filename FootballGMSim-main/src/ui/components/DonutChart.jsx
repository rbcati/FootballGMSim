import React from 'react';

export default function DonutChart({ data, size = 120, strokeWidth = 15 }) {
    const center = size / 2;
    const radius = center - strokeWidth;
    const circumference = 2 * Math.PI * radius;

    const total = data.reduce((acc, item) => acc + item.value, 0);

    let currentOffset = 0;

    return (
        <div style={{ width: size, height: size, position: "relative" }}>
            <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" style={{ transform: "rotate(-90deg)" }}>
                {data.map((item, index) => {
                    if (total === 0) return null;
                    const strokeDasharray = `${(item.value / total) * circumference} ${circumference}`;
                    const strokeDashoffset = -currentOffset;
                    currentOffset += (item.value / total) * circumference;

                    return (
                        <circle
                            key={index}
                            r={radius}
                            cx={center}
                            cy={center}
                            fill="transparent"
                            stroke={item.color}
                            strokeWidth={strokeWidth}
                            strokeDasharray={strokeDasharray}
                            strokeDashoffset={strokeDashoffset}
                        />
                    );
                })}
            </svg>
            {/* Inner Text */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
               {data.map((item, index) => (
                   item.label ? (
                       <div key={index} style={{ fontSize: "10px", color: "var(--text)", fontWeight: "bold" }}>
                           {item.label}
                       </div>
                   ) : null
               ))}
            </div>
        </div>
    );
}
