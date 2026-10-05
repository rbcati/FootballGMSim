import React, { useEffect, useId, useRef, useState } from 'react';

export default function HqInfoPopover({ label, children }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <span className="hq-v2-help" ref={root}>
    <button ref={trigger} type="button" className="hq-v2-info" aria-label={`${label} help`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}><span aria-hidden="true">?</span></button>
    {open ? <span id={id} className="hq-v2-help__content" role="note"><strong>{label.toUpperCase()}</strong><span>{children}</span></span> : null}
  </span>;
}
