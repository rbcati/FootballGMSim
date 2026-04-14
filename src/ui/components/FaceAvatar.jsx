import React from 'react';
import { Face } from 'facesjs/react';
import { generateFaceConfig } from '../../core/face.js';

export default function FaceAvatar({ face, seed, size = 52, className = '', style = {} }) {
  const safeFace = React.useMemo(() => face ?? generateFaceConfig(seed ?? 'fallback-avatar'), [face, seed]);

  return (
    <Face
      face={safeFace}
      lazy
      ignoreDisplayErrors
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--surface-sunken)',
        ...style,
      }}
    />
  );
}
