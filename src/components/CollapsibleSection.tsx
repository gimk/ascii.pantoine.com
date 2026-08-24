import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const STORAGE_KEY = 'ascii_studio_collapsed_sections';

/**
 * Reads the whole collapse map at module load.
 *
 * The sidebar mounts dozens of these, so hitting localStorage per section on
 * every render would be wasteful; the map is read once and written through on
 * each toggle.
 */
function readCollapsedMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

let collapsedMap: Record<string, boolean> = readCollapsedMap();

function persistCollapsed(id: string, collapsed: boolean): void {
  collapsedMap = { ...collapsedMap, [id]: collapsed };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsedMap));
  } catch {
    // storage unavailable (private mode, quota) - collapse still works for the session
  }
}

interface CollapsibleSectionProps {
  /** Header label. Rendered uppercase by the stylesheet. */
  title: string;
  /** Small glyph shown before the title, matching the old headers. */
  icon?: React.ReactNode;
  /**
   * Short status shown next to the title, and the only thing still visible
   * once the section is collapsed. Use it for the value someone would want
   * without expanding: the active source, the resolution, the chosen preset.
   */
  badge?: React.ReactNode;
  /**
   * Stable id for persisting open/closed state across reloads. Omit to make
   * the section always start at `defaultOpen`.
   */
  persistKey?: string;
  defaultOpen?: boolean;
  /** Renders the frame without the border/background, for nested groups. */
  flush?: boolean;
  className?: string;
  /** Escape hatch for callers that need to dim or disable the whole group. */
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  badge,
  persistKey,
  defaultOpen = true,
  flush = false,
  className = '',
  style,
  children,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (persistKey && persistKey in collapsedMap) return !collapsedMap[persistKey];
    return defaultOpen;
  });

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (persistKey) persistCollapsed(persistKey, !next);
      return next;
    });
  }, [persistKey]);

  return (
    <div
      className={`collapsible-section ${flush ? 'flush' : ''} ${isOpen ? 'open' : 'closed'} ${className}`}
      style={style}
    >
      <button
        type="button"
        className="collapsible-header"
        onClick={toggle}
        aria-expanded={isOpen}
        title={isOpen ? `Collapse ${title}` : `Expand ${title}`}
      >
        <span className="collapsible-lead">
          {icon && <span className="collapsible-icon">{icon}</span>}
          <span className="collapsible-title">{title}</span>
          {badge !== undefined && badge !== null && (
            <span className="collapsible-badge">{badge}</span>
          )}
        </span>
        <span className="collapsible-chevron">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {isOpen && <div className="collapsible-body">{children}</div>}
    </div>
  );
};
