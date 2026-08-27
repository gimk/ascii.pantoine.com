import React, { useEffect } from 'react';
import { X, Keyboard, MousePointer2, Move, Command } from 'lucide-react';
import { AppMode } from '../types/ascii';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Used only to mark the bindings that differ per content source. */
  appMode?: AppMode;
}

/**
 * `null` keys render as a plain description, for gestures that have no glyph.
 * `note` marks a binding that only applies to one content source.
 */
interface Shortcut {
  keys: string[] | null;
  action: string;
  note?: string;
}

interface ShortcutGroup {
  title: string;
  icon: React.ReactNode;
  items: Shortcut[];
}

const isApplePlatform = (): boolean =>
  typeof navigator !== 'undefined' && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || '');

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose, appMode = 'media' }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const mod = isApplePlatform() ? '⌘' : 'Ctrl';

  const groups: ShortcutGroup[] = [
    {
      title: 'Navigate the viewfinder',
      icon: <Move size={13} />,
      items: [
        { keys: null, action: 'Drag to pan', note: 'Media' },
        { keys: null, action: 'Middle-drag to pan', note: 'All modes' },
        { keys: null, action: 'Double-click to fit' },
        { keys: ['0'], action: 'Fit raster to viewfinder' },
        { keys: ['9'], action: 'Actual size (100%)' },
        { keys: ['+'], action: 'Zoom in' },
        { keys: ['-'], action: 'Zoom out' },
        { keys: ['C'], action: 'Recentre the view' },
        { keys: ['←', '→', '↑', '↓'], action: 'Nudge the view' },
        { keys: ['Shift', '←'], action: 'Nudge further' },
      ],
    },
    {
      title: 'Pointer & wheel',
      icon: <MousePointer2 size={13} />,
      items: [
        { keys: null, action: 'Wheel zooms towards the cursor' },
        { keys: [mod, 'Wheel'], action: 'Zoom towards the cursor', note: 'Any mode' },
        { keys: ['Shift', 'Wheel'], action: 'Pan horizontally' },
        { keys: null, action: 'Trackpad pinch to zoom, two-finger drag to pan' },
        { keys: null, action: 'Drag to orbit the model', note: 'Model' },
        { keys: null, action: 'Wheel dollies the camera', note: 'Model' },
        { keys: null, action: 'Click to emit particles', note: 'Synth' },
      ],
    },
    {
      title: 'Studio',
      icon: <Command size={13} />,
      items: [
        { keys: [mod, 'Z'], action: 'Undo' },
        { keys: [mod, 'Shift', 'Z'], action: 'Redo' },
        { keys: ['Space'], action: 'Play / pause', note: 'Not for static images' },
        { keys: ['R'], action: 'Randomize the preset', note: 'Synth' },
        { keys: ['1'], action: 'ASCII output mode' },
        { keys: ['2'], action: 'Pixel output mode' },
        { keys: ['3'], action: 'Vector output mode' },
        { keys: ['?'], action: 'This list' },
        { keys: ['Esc'], action: 'Close any dialog' },
      ],
    },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ width: 'min(94vw, 620px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Keyboard size={14} color="var(--accent)" />
            <span style={{ fontSize: '12px', letterSpacing: '0.05em' }}>KEYBOARD &amp; POINTER</span>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ padding: '2px 6px' }}
            onClick={onClose}
            title="Close (Esc)"
          >
            <X size={13} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {groups.map((group) => (
            <div key={group.title}>
              <div className="shortcut-group-title">
                {group.icon}
                <span>{group.title}</span>
              </div>
              <div className="shortcut-list">
                {group.items.map((item) => (
                  <div className="shortcut-row" key={`${group.title}-${item.action}-${item.note || ''}`}>
                    <span className="shortcut-action">
                      {item.action}
                      {item.note && (
                        <span
                          className={`shortcut-scope ${
                            item.note.toLowerCase() === appMode ? 'shortcut-scope-active' : ''
                          }`}
                        >
                          {item.note}
                        </span>
                      )}
                    </span>
                    <span className="shortcut-keys">
                      {item.keys ? (
                        item.keys.map((k, i) => (
                          <React.Fragment key={k}>
                            {i > 0 && <span className="shortcut-plus">+</span>}
                            <kbd className="shortcut-key">{k}</kbd>
                          </React.Fragment>
                        ))
                      ) : (
                        <span className="shortcut-gesture">gesture</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
