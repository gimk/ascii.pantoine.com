import React from 'react';
import { RotateCcw, AlertTriangle, CheckCircle2, Plus } from 'lucide-react';

interface FormulaEditorProps {
  code: string;
  prepareCode?: string;
  error: string | null;
  onChange: (code: string, prepareCode?: string) => void;
  onResetToSynth?: () => void;
}

export const FormulaEditor: React.FC<FormulaEditorProps> = ({
  code,
  prepareCode,
  error,
  onChange,
  onResetToSynth,
}) => {
  const insertSnippet = (snippet: string) => {
    const clean = (code || '').trim();

    if (!clean) {
      onChange(`let val = 0;\n\n${snippet}\n\nreturn val;`, prepareCode);
      return;
    }

    // Match the return statement or final output comment block
    const returnRegex = /(?:\/\/\s*Final Output\s*\n)?\s*return\b/i;
    const match = clean.match(returnRegex);

    if (match && match.index !== undefined) {
      const insertPos = match.index;
      const before = clean.slice(0, insertPos).trimEnd();
      const after = clean.slice(insertPos).trimStart();

      const needsValInit = !before.includes('let val') && !before.includes('var val');
      const prefix = needsValInit ? 'let val = 0;\n\n' : '';

      const newCode = `${prefix}${before}\n\n${snippet}\n\n${after}`;
      onChange(newCode, prepareCode);
    } else {
      const needsValInit = !clean.includes('let val') && !clean.includes('var val');
      const prefix = needsValInit ? 'let val = 0;\n\n' : '';
      const newCode = `${prefix}${clean}\n\n${snippet}\n\nreturn val;`;
      onChange(newCode, prepareCode);
    }
  };

  return (
    <div className="tab-content">
      {/* Code info */}
      <div className="control-section">
        <div className="section-header">
          <span>Live JavaScript Formula</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {error ? (
              <span style={{ fontSize: '9px', color: '#ff3344', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <AlertTriangle size={10} /> SYNTAX ERROR
              </span>
            ) : (
              <span style={{ fontSize: '9px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <CheckCircle2 size={10} /> LIVE SYNC
              </span>
            )}
            {onResetToSynth && (
              <button
                className="btn btn-sm"
                onClick={onResetToSynth}
                title="Reset formula to match active Synth sliders"
              >
                <RotateCcw size={10} />
                RESET
              </button>
            )}
          </div>
        </div>

        <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.4 }}>
          Function inputs: <code>x, y, time, dist, dx, dy, cols, rows, angle, ctx</code>
          <br />
          All changes apply live in real-time and automatically synchronize with the Synth tab!
        </p>

        {/* Main Render Code Editor */}
        <textarea
          className="code-editor-area"
          style={{ minHeight: '260px', fontFamily: 'var(--font-mono)' }}
          value={code}
          onChange={(e) => onChange(e.target.value, prepareCode)}
          spellCheck={false}
          placeholder="return Math.sin(dist * 0.1 - time);"
        />

        {error && (
          <div className="code-error-box">
            <AlertTriangle size={12} style={{ display: 'inline', marginRight: '4px' }} />
            <strong>Runtime / Syntax Error:</strong> {error}
          </div>
        )}

        {/* Quick math helper buttons */}
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Insert Wave Component
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-sm"
              onClick={() => insertSnippet('val += Math.sin(dist * 0.15 - time * 1.5) * 0.5;')}
              title="Insert Radial Sine Wave"
            >
              <Plus size={10} /> sin(dist)
            </button>
            <button
              className="btn btn-sm"
              onClick={() => insertSnippet('val += Math.cos(dx * 0.10 + time * 1.0) * 0.4;')}
              title="Insert Horizontal Swell"
            >
              <Plus size={10} /> cos(dx)
            </button>
            <button
              className="btn btn-sm"
              onClick={() => insertSnippet('val += Math.sin(dy * 0.10 + time * 1.0) * 0.4;')}
              title="Insert Vertical Swell"
            >
              <Plus size={10} /> sin(dy)
            </button>
            <button
              className="btn btn-sm"
              onClick={() => insertSnippet('val += Math.sin(angle * 4.0 - time * 2.0) * 0.4;')}
              title="Insert Spiral Arms"
            >
              <Plus size={10} /> sin(angle)
            </button>
            <button
              className="btn btn-sm"
              onClick={() => insertSnippet('val += Math.sin(Math.hypot(dx - 15, dy - 8) * 0.2 - time * 2.0) * 0.5;')}
              title="Insert Offset Emitter Interference"
            >
              <Plus size={10} /> hypot
            </button>
            <button
              className="btn btn-sm"
              onClick={() => insertSnippet('val += Math.sin(35 / Math.max(0.1, dist + 2) - time * 2.0) * 0.6;')}
              title="Insert 3D Depth Tunnel"
            >
              <Plus size={10} /> tunnel
            </button>
            <button
              className="btn btn-sm"
              onClick={() => insertSnippet('val += (1 / (Math.abs(dist - 25) + 1)) * 0.8;')}
              title="Insert Concentric Harmonic Ring"
            >
              <Plus size={10} /> rings
            </button>
          </div>
        </div>
      </div>

      {/* Prepare / State Setup Code */}
      <div className="control-section">
        <div className="section-header">
          <span>Frame State (Optional: ctx.prepare)</span>
        </div>
        <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px' }}>
          Code executed once per frame before the character matrix loop.
        </p>
        <textarea
          className="code-editor-area"
          style={{ minHeight: '70px' }}
          value={prepareCode || ''}
          onChange={(e) => onChange(code, e.target.value)}
          spellCheck={false}
          placeholder="// e.g. ctx.activeWaves = [...];"
        />
      </div>
    </div>
  );
};
