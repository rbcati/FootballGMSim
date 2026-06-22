import React from 'react';
import { Badge } from '@/components/ui/badge';

const PERSONA_META = {
  WIN_NOW: {
    label: '🔥 Win Now Mode',
    color: '#FF453A',
    bg: 'rgba(255,69,58,0.15)',
    border: 'rgba(255,69,58,0.40)',
  },
  PATIENT_BUILDER: {
    label: '🌱 Rebuilding',
    color: '#30D158',
    bg: 'rgba(48,209,88,0.12)',
    border: 'rgba(48,209,88,0.35)',
  },
  CAP_HOARDER: {
    label: '💼 Cap Guarded',
    color: '#34C759',
    bg: 'rgba(52,199,89,0.12)',
    border: 'rgba(52,199,89,0.35)',
  },
  PLAYER_LOYALIST: {
    label: '🤝 Player Loyalist',
    color: '#FF9F0A',
    bg: 'rgba(255,159,10,0.12)',
    border: 'rgba(255,159,10,0.35)',
  },
};

/**
 * Compact badge displaying a team's front-office philosophy persona.
 *
 * @param {{ persona: string, className?: string }} props
 */
export function FrontOfficeBadge({ persona, className }) {
  if (!persona) return null;
  const meta = PERSONA_META[persona];
  if (!meta) return null;

  return (
    <Badge
      variant="outline"
      className={className}
      style={{
        color:       meta.color,
        borderColor: meta.border,
        background:  meta.bg,
        fontWeight:  600,
        fontSize:    '0.7rem',
        whiteSpace:  'nowrap',
      }}
    >
      {meta.label}
    </Badge>
  );
}

export { PERSONA_META };
export default FrontOfficeBadge;
