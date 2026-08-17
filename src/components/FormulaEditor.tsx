import React from 'react';
import { RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';

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
    onChange(`${code}\n${snippet}`, prepareCode);
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
        <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => insertSnippet('Math.sin(dist * 0.15 - time * 2)')}>
            + sin(dist)
          </button>
          <button className="btn btn-sm" onClick={() => insertSnippet('Math.cos(dx * 0.08 + time)')}>
            + cos(dx)
          </button>
          <button className="btn btn-sm" onClick={() => insertSnippet('Math.sin(dy * 0.08 + time)')}>
            + sin(dy)
          </button>
          <button className="btn btn-sm" onClick={() => insertSnippet('Math.sin(angle * 3 - time * 2)')}>
            + sin(angle)
          </button>
          <button className="btn btn-sm" onClick={() => insertSnippet('Math.hypot(dx, dy)')}>
            + hypot
          </button>
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
