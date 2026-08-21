import React, { useState, useEffect } from 'react';

interface AsciiLoadingSpinnerProps {
  fileName?: string;
  statusText?: string;
}

const BRAILLE_SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const AsciiLoadingSpinner: React.FC<AsciiLoadingSpinnerProps> = ({
  fileName = '3D Model',
  statusText = 'Downloading',
}) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % BRAILLE_SPINNER.length);
    }, 70);

    return () => clearInterval(timer);
  }, []);

  const bLen = BRAILLE_SPINNER.length;
  const tl = BRAILLE_SPINNER[index];
  const tr = BRAILLE_SPINNER[(index + 2) % bLen];
  const bl = BRAILLE_SPINNER[(index + 4) % bLen];
  const br = BRAILLE_SPINNER[(index + 6) % bLen];

  const displayFileName = fileName.length > 22 ? `${fileName.slice(0, 18)}...` : fileName;

  return (
    <div
      className="ascii-loading-overlay"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 50,
        width: '140px',
        height: '140px',
        background: 'rgba(3, 8, 5, 0.94)',
        border: '1.5px solid var(--accent)',
        borderRadius: '3px',
        boxShadow: '0 0 25px var(--accent-glow), inset 0 0 12px rgba(0, 0, 0, 0.85)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-mono)',
        userSelect: 'none',
        pointerEvents: 'none',
        backdropFilter: 'blur(3px)',
        boxSizing: 'border-box',
        padding: '12px',
      }}
    >
      {/* 4 Corner Braille Pulse Indicators */}
      <span
        style={{
          position: 'absolute',
          top: '6px',
          left: '8px',
          color: 'var(--accent)',
          fontSize: '14px',
          fontWeight: 900,
          textShadow: '0 0 8px var(--accent-glow)',
          lineHeight: 1,
        }}
      >
        {tl}
      </span>
      <span
        style={{
          position: 'absolute',
          top: '6px',
          right: '8px',
          color: 'var(--accent)',
          fontSize: '14px',
          fontWeight: 900,
          textShadow: '0 0 8px var(--accent-glow)',
          lineHeight: 1,
        }}
      >
        {tr}
      </span>
      <span
        style={{
          position: 'absolute',
          bottom: '6px',
          left: '8px',
          color: 'var(--accent)',
          fontSize: '14px',
          fontWeight: 900,
          textShadow: '0 0 8px var(--accent-glow)',
          lineHeight: 1,
        }}
      >
        {bl}
      </span>
      <span
        style={{
          position: 'absolute',
          bottom: '6px',
          right: '8px',
          color: 'var(--accent)',
          fontSize: '14px',
          fontWeight: 900,
          textShadow: '0 0 8px var(--accent-glow)',
          lineHeight: 1,
        }}
      >
        {br}
      </span>

      {/* Middle Content */}
      <div
        style={{
          fontSize: '10.5px',
          fontWeight: 800,
          color: 'var(--accent)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          textShadow: '0 0 6px var(--accent-glow)',
        }}
      >
        {statusText}
      </div>

      <div
        style={{
          fontSize: '9.5px',
          color: 'var(--text-primary)',
          fontWeight: 600,
          textAlign: 'center',
          maxWidth: '110px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.3,
        }}
        title={fileName}
      >
        {displayFileName}
      </div>
    </div>
  );
};
