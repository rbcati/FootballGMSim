import React from 'react';

export default function PlayerAvatar({ teamColor = "#555", text, size = 48, style = {} }) {
  return (
    <div style={{ ...style, width: size, height: size }}>
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
        {/* Simple Vector Jersey */}
        <path
            d="M 20 20 L 35 10 L 65 10 L 80 20 L 90 40 L 75 50 L 75 90 L 25 90 L 25 50 L 10 40 Z"
            fill={teamColor}
            stroke="rgba(0,0,0,0.2)"
            strokeWidth="2"
        />
        <text
            x="50"
            y="65"
            fontFamily="sans-serif"
            fontSize="32"
            fontWeight="bold"
            fill="#fff"
            textAnchor="middle"
            dominantBaseline="middle"
            stroke="rgba(0,0,0,0.5)"
            strokeWidth="1"
        >
          {text}
        </text>
      </svg>
    </div>
  );
}
