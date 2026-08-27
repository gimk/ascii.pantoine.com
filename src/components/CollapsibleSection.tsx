import React, { useState, useEffect, useCallback, createContext, useContext, useId, useMemo } from 'react';
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

interface AccordionContextType {
  autoCollapse: boolean;
  nestLevel: number;
  openSectionId: string | null;
  setOpenSectionId: (id: string | null) => void;
}

export const AccordionContext = createContext<AccordionContextType>({
  autoCollapse: true,
  nestLevel: 0,
  openSectionId: null,
  setOpenSectionId: () => {},
});

export const AccordionProvider: React.FC<{
  autoCollapse: boolean;
  children: React.ReactNode;
}> = ({ autoCollapse, children }) => {
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);

  const value = useMemo(
    () => ({
      autoCollapse,
      nestLevel: 0,
      openSectionId,
      setOpenSectionId,
    }),
    [autoCollapse, openSectionId]
  );

  return (
    <AccordionContext.Provider value={value}>
      {children}
    </AccordionContext.Provider>
  );
};

export interface CollapsibleSectionProps {
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
  /** Optional inline reset button rendered right inside the header on the right side. */
  onReset?: () => void;
  resetTitle?: string;
  /** Optional custom header right node */
  headerRight?: React.ReactNode;
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
  onReset,
  resetTitle,
  headerRight,
  persistKey,
  defaultOpen = false,
  flush = false,
  className = '',
  style,
  children,
}) => {
  const { autoCollapse, nestLevel, openSectionId, setOpenSectionId } = useContext(AccordionContext);
  const isTopLevel = nestLevel === 0;
  const autoId = useId();
  const sectionId = persistKey || autoId;

  // Local state for independent / nested mode or when autoCollapse is false
  const [localOpen, setLocalOpen] = useState<boolean>(() => {
    if (persistKey && persistKey in collapsedMap) return !collapsedMap[persistKey];
    return defaultOpen;
  });

  // On first mount when autoCollapse is active: if no section is active yet and this section defaults open, claim active
  useEffect(() => {
    if (autoCollapse && isTopLevel && openSectionId === null && localOpen) {
      setOpenSectionId(sectionId);
    }
  }, [autoCollapse, isTopLevel, localOpen, openSectionId, sectionId, setOpenSectionId]);

  const isOpen = (autoCollapse && isTopLevel)
    ? (openSectionId === sectionId || (openSectionId === null && localOpen))
    : localOpen;

  const toggle = useCallback(() => {
    if (autoCollapse && isTopLevel) {
      const isCurrentlyOpen = (openSectionId === sectionId || (openSectionId === null && localOpen));
      const nextOpen = !isCurrentlyOpen;
      setOpenSectionId(nextOpen ? sectionId : '__none__');
      setLocalOpen(nextOpen);
      if (persistKey) persistCollapsed(persistKey, !nextOpen);
    } else {
      setLocalOpen((prev) => {
        const next = !prev;
        if (persistKey) persistCollapsed(persistKey, !next);
        return next;
      });
    }
  }, [autoCollapse, isTopLevel, openSectionId, sectionId, localOpen, persistKey, setOpenSectionId]);

  // Nested context value increments nestLevel so children know they are nested
  const nestedContextValue = useMemo(
    () => ({
      autoCollapse,
      nestLevel: nestLevel + 1,
      openSectionId,
      setOpenSectionId,
    }),
    [autoCollapse, nestLevel, openSectionId, setOpenSectionId]
  );

  return (
    <div
      className={`collapsible-section ${flush ? 'flush' : ''} ${isOpen ? 'open' : 'closed'} ${className}`}
      style={style}
    >
      <div
        className="collapsible-header"
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
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
        <span
          className="collapsible-header-right"
        >
          {onReset && (
            <button
              type="button"
              className="btn-reset"
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
              title={resetTitle || `Reset ${title}`}
            >
              RESET
            </button>
          )}
          {headerRight && (
            <div
              className="collapsible-header-slot"
              onClick={(e) => e.stopPropagation()}
            >
              {headerRight}
            </div>
          )}
          <span className="collapsible-chevron">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </span>
      </div>

      {isOpen && (
        <AccordionContext.Provider value={nestedContextValue}>
          <div className="collapsible-body">{children}</div>
        </AccordionContext.Provider>
      )}
    </div>
  );
};
