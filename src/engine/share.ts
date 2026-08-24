import {
  WaveParams,
  PhosphorTheme,
  ParticleConfig,
  OptimizeConfig,
  CrtConfig,
  PhosphorGradient,
  AppMode,
  ModelConfig,
  ModelViewConfig,
  MediaConfig,
  MediaViewConfig,
  MediaColorConfig,
  RasterOutputMode,
  DitherAlgorithm,
  ToneMappingConfig,
  HalftoneConfig,
} from '../types/ascii';

export interface FullAnimationState {
  appMode?: AppMode;
  name: string;
  type?: 'parametric' | 'custom';
  params?: WaveParams;
  customCode?: string;
  customPrepare?: string;
  density: string;
  rasterMode?: RasterOutputMode;
  ditherAlgorithm?: DitherAlgorithm;
  toneConfig?: ToneMappingConfig;
  halftoneConfig?: HalftoneConfig;
  theme: PhosphorTheme;
  customThemeColor?: string;
  gradientConfig?: PhosphorGradient | null;
  cols: number;
  rows: number;
  autoRes?: boolean;
  lockResolution?: boolean;
  particleConfig?: ParticleConfig;
  optimizeConfig: OptimizeConfig;
  crtConfig?: CrtConfig;
  modelConfig?: ModelConfig;
  modelViewConfig?: ModelViewConfig;
  mediaConfig?: MediaConfig;
  mediaViewConfig?: MediaViewConfig;
  mediaColorConfig?: MediaColorConfig;
}


// UTF-8 safe base64 encoding/decoding helper
function utf8ToBase64(str: string): string {
  try {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return encodeURIComponent(str);
  }
}

function base64ToUtf8(str: string): string {
  try {
    const binary = atob(str);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return decodeURIComponent(str);
  }
}

/**
 * Encodes the full animation state into a shareable URL pointing to fullscreen viewfinder mode.
 */
export function encodeShareUrl(
  state: FullAnimationState,
  mode: 'fullscreen' | 'editor' = 'fullscreen'
): string {
  const payload = JSON.stringify(state);
  const encodedData = utf8ToBase64(payload);

  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('mode', mode);
  url.searchParams.set('data', encodedData);

  return url.toString();
}

/**
 * Decodes shared state and view mode from the current URL search parameters or hash.
 */
export function decodeShareFromUrl(): {
  state: FullAnimationState | null;
  mode: 'fullscreen' | 'editor' | null;
} {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const modeParam = searchParams.get('mode') || searchParams.get('view');
    const dataParam = searchParams.get('data');

    const mode: 'fullscreen' | 'editor' | null =
      modeParam === 'fullscreen' ? 'fullscreen' : modeParam === 'editor' ? 'editor' : null;

    if (!dataParam) {
      return { state: null, mode };
    }

    const jsonStr = base64ToUtf8(dataParam);
    const parsed = JSON.parse(jsonStr) as FullAnimationState;

    if (parsed.autoRes === undefined && parsed.lockResolution !== undefined) {
      parsed.autoRes = !parsed.lockResolution;
    }

    return {
      state: parsed,
      mode: mode || (modeParam ? 'fullscreen' : null),
    };
  } catch (err) {
    console.warn('Failed to decode shared animation state from URL:', err);
    return { state: null, mode: null };
  }
}

/**
 * Updates the browser URL to reflect the current view mode without reloading the page.
 */
export function updateUrlMode(mode: 'fullscreen' | 'editor') {
  try {
    const url = new URL(window.location.href);
    if (mode === 'fullscreen') {
      url.searchParams.set('mode', 'fullscreen');
    } else {
      url.searchParams.delete('mode');
      url.searchParams.delete('view');
    }
    window.history.replaceState({}, '', url.toString());
  } catch {
    // Ignore history error
  }
}
