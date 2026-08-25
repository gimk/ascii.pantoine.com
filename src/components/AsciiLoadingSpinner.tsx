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

  const displayFileName = fileName.length > 20 ? `${fileName.slice(0, 17)}...` : fileName;

  const cornerStyle: React.CSSProperties = {
    position: 'absolute',
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent)',
    fontSize: '15px',
    fontWeight: 900,
    textShadow: '0 0 8px var(--accent-glow)',
    lineHeight: 1,
  };

  return (
    <div
      className="ascii-loading-overlay"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 50,
        width: '136px',
        height: '164px',
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
        padding: '16px 12px',
      }}
    >
      {/* 4 Corner Braille Pulse Indicators with Equal Padding */}
      <div style={{ ...cornerStyle, top: '9px', left: '9px' }}>
        <span>{tl}</span>
      </div>
      <div style={{ ...cornerStyle, top: '9px', right: '9px' }}>
        <span>{tr}</span>
      </div>
      <div style={{ ...cornerStyle, bottom: '9px', left: '9px' }}>
        <span>{bl}</span>
      </div>
      <div style={{ ...cornerStyle, bottom: '9px', right: '9px' }}>
        <span>{br}</span>
      </div>

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
          fontSize: '10px',
          color: 'var(--text-primary)',
          fontWeight: 600,
          textAlign: 'center',
          maxWidth: '106px',
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
