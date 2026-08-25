import React from 'react';
import { DitherPatternType } from '../engine/ditherAlgorithms';

interface DitherSwatchIconProps {
  type?: DitherPatternType;
  size?: number;
  className?: string;
  active?: boolean;
}

export const DitherSwatchIcon: React.FC<DitherSwatchIconProps> = ({
  type = 'diffusion',
  size = 14,
  className = '',
  active = false,
}) => {
  const color = active ? 'var(--accent)' : 'currentColor';
  const opacity = active ? 1 : 0.8;

  switch (type) {
    case 'bayer':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 16 16"
          className={className}
          style={{ flexShrink: 0, opacity }}
        >
          <rect x="1" y="1" width="6" height="6" fill={color} opacity="0.35" />
          <rect x="9" y="1" width="6" height="6" fill={color} />
          <rect x="1" y="9" width="6" height="6" fill={color} />
          <rect x="9" y="9" width="6" height="6" fill={color} opacity="0.6" />
        </svg>
      );

    case 'halftone':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 16 16"
          className={className}
          style={{ flexShrink: 0, opacity }}
        >
          <circle cx="4" cy="4" r="1.5" fill={color} />
          <circle cx="12" cy="4" r="2.5" fill={color} />
          <circle cx="4" cy="12" r="3" fill={color} />
          <circle cx="12" cy="12" r="1.8" fill={color} />
        </svg>
      );

    case 'stochastic':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 16 16"
          className={className}
          style={{ flexShrink: 0, opacity }}
        >
          <circle cx="2" cy="3" r="1" fill={color} />
          <circle cx="7" cy="2" r="1.2" fill={color} />
          <circle cx="13" cy="4" r="0.9" fill={color} />
          <circle cx="4" cy="8" r="1.1" fill={color} />
          <circle cx="11" cy="9" r="1.3" fill={color} />
          <circle cx="8" cy="13" r="1" fill={color} />
          <circle cx="14" cy="14" r="1.1" fill={color} />
          <circle cx="2" cy="14" r="0.9" fill={color} />
        </svg>
      );

    case 'fractal':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 16 16"
          className={className}
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, opacity }}
        >
          <path d="M3 13V9h4v4h6V3H9v4H3V3" />
        </svg>
      );

    case 'wave':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 16 16"
          className={className}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          style={{ flexShrink: 0, opacity }}
        >
          <path d="M2 5c2-2 4-2 6 0s4 2 6 0" />
          <path d="M2 11c2-2 4-2 6 0s4 2 6 0" opacity="0.6" />
        </svg>
      );

    case 'glitch':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 16 16"
          className={className}
          style={{ flexShrink: 0, opacity }}
        >
          <rect x="2" y="2" width="10" height="2.5" fill={color} />
          <rect x="5" y="6" width="9" height="2.5" fill={color} opacity="0.75" />
          <rect x="1" y="10" width="12" height="2.5" fill={color} />
          <rect x="11" y="3" width="2" height="9" fill={color} opacity="0.4" />
        </svg>
      );

    case 'circuit':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 16 16"
          className={className}
          fill="none"
          stroke={color}
          strokeWidth="1.4"
          strokeLinecap="round"
          style={{ flexShrink: 0, opacity }}
        >
          <path d="M2 4h5v4h6" />
          <path d="M2 12h4v-3h7" />
          <circle cx="13" cy="8" r="1.2" fill={color} />
          <circle cx="2" cy="4" r="1.2" fill={color} />
        </svg>
      );

    case 'lines':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 16 16"
          className={className}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          style={{ flexShrink: 0, opacity }}
        >
          <path d="M2 14L14 2" />
          <path d="M2 7L7 2" opacity="0.6" />
          <path d="M9 14l5-5" opacity="0.6" />
        </svg>
      );

    case 'diffusion':
    default:
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 16 16"
          className={className}
          style={{ flexShrink: 0, opacity }}
        >
          <rect x="2" y="2" width="2" height="2" fill={color} opacity="0.4" />
          <rect x="6" y="2" width="2" height="2" fill={color} opacity="0.8" />
          <rect x="10" y="2" width="2" height="2" fill={color} />
          <rect x="14" y="2" width="2" height="2" fill={color} />
          <rect x="2" y="6" width="2" height="2" fill={color} opacity="0.6" />
          <rect x="6" y="6" width="2" height="2" fill={color} />
          <rect x="10" y="6" width="2" height="2" fill={color} opacity="0.9" />
          <rect x="2" y="10" width="2" height="2" fill={color} opacity="0.8" />
          <rect x="6" y="10" width="2" height="2" fill={color} opacity="0.4" />
          <rect x="10" y="10" width="2" height="2" fill={color} opacity="0.2" />
          <rect x="2" y="14" width="2" height="2" fill={color} />
        </svg>
      );
  }
};
