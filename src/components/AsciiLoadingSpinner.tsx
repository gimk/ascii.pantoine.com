import React, { useState, useEffect } from 'react';

interface AsciiLoadingSpinnerProps {
  message?: string;
}

const SPINNER_FRAMES = [
  [
    '     .───────.     ',
    '    ╱       ╱│     ',
    '   ┌───────┐ │     ',
    '   │ ░▒▓█▓ │ │     ',
    '   │       │╱      ',
    '   └───────┘       ',
  ],
  [
    '      .─────.      ',
    '     ╱     ╱│      ',
    '    ┌─────┐ │      ',
    '    │▒▓█▓▒│ │      ',
    '    │     │╱       ',
    '    └─────┘        ',
  ],
  [
    '       .───.       ',
    '      ╱   ╱│       ',
    '     ┌───┐ │       ',
    '     │▓█▓│ │       ',
    '     │   │╱        ',
    '     └───┘         ',
  ],
  [
    '       .───.       ',
    '       │   │       ',
    '       │█▓█│       ',
    '       │   │       ',
    '       └───┘       ',
    '                   ',
  ],
  [
    '       .───.       ',
    '      │╲   │╲      ',
    '      │ ┌───┐│     ',
    '      │ │▓█▓││     ',
    '      └─│───┘│     ',
    '         ╲   │     ',
  ],
  [
    '      .─────.      ',
    '     │╲     │╲     ',
    '     │ ┌─────┐│    ',
    '     │ │▒▓█▓▒││    ',
    '     └─│─────┘│    ',
    '        ╲     │    ',
  ],
  [
    '     .───────.     ',
    '    │╲       │╲    ',
    '    │ ┌───────┐│   ',
    '    │ │ ░▒▓█▓ ││   ',
    '    └─│───────┘│   ',
    '       ╲       │   ',
  ],
  [
    '    .─────────.    ',
    '    │         │    ',
    '    │  ░▒▓█▓░ │    ',
    '    │         │    ',
    '    └─────────┘    ',
    '                   ',
  ],
];

const BRAILLE_SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const AsciiLoadingSpinner: React.FC<AsciiLoadingSpinnerProps> = ({
  message = 'LOADING 3D GEOMETRY...',
}) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const [brailleIndex, setBrailleIndex] = useState(0);

  useEffect(() => {
    const frameTimer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 110);

    const brailleTimer = setInterval(() => {
      setBrailleIndex((prev) => (prev + 1) % BRAILLE_SPINNER.length);
    }, 70);

    return () => {
      clearInterval(frameTimer);
      clearInterval(brailleTimer);
    };
  }, []);

  return (
    <div
      className="ascii-loading-overlay"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 50,
        background: 'rgba(5, 10, 7, 0.92)',
        border: '1.5px solid var(--accent)',
        borderRadius: '4px',
        padding: '16px 24px',
        boxShadow: '0 0 30px var(--accent-glow), inset 0 0 15px rgba(0, 0, 0, 0.8)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-mono)',
        userSelect: 'none',
        pointerEvents: 'none',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        style={{
          fontSize: '9.5px',
          fontWeight: 800,
          color: 'var(--accent)',
          letterSpacing: '0.12em',
          textShadow: '0 0 6px var(--accent-glow)',
        }}
      >
        [ ▓▒░ RASTERIZING 3D MODEL ░▒▓ ]
      </div>

      <pre
        style={{
          margin: 0,
          fontSize: '11px',
          lineHeight: '1.2',
          color: 'var(--accent)',
          textShadow: '0 0 8px var(--accent-glow)',
          fontFamily: 'inherit',
          whiteSpace: 'pre',
        }}
      >
        {SPINNER_FRAMES[frameIndex].join('\n')}
      </pre>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '10.5px',
          color: 'var(--text-primary)',
          fontWeight: 700,
        }}
      >
        <span style={{ color: 'var(--accent)', fontWeight: 900, fontSize: '13px' }}>
          {BRAILLE_SPINNER[brailleIndex]}
        </span>
        <span style={{ letterSpacing: '0.05em' }}>{message.toUpperCase()}</span>
      </div>

      {/* Retro Horizontal Scanline Bar */}
      <div
        style={{
          width: '100%',
          height: '3px',
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '2px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: '40%',
            height: '100%',
            background: 'var(--accent)',
            boxShadow: '0 0 8px var(--accent)',
            animation: 'ascii-scan-bar 1.2s infinite ease-in-out',
          }}
        />
      </div>
    </div>
  );
};
