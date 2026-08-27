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
  DitherParams,
  VectorConfig,
  ToneMappingConfig,
  ImageAdjustConfig,
} from '../types/ascii';

/**
 * Where the viewfinder was pointed, in terms that survive the trip to another
 * screen.
 *
 * `cx` / `cy` are the point at the centre of the viewport expressed as a
 * fraction of the raster, not as pixels. A pixel offset is meaningless on a
 * different window size -- the same tx on a 3440px monitor and a 1280px laptop
 * frame completely different parts of the image. A fraction reproduces the
 * framing anywhere. Values outside 0..1 are legal and mean the raster is
 * panned partly off screen, which is a view someone may well have chosen.
 */
export interface ShareView {
  scale: number;
  cx: number;
  cy: number;
}

export interface FullAnimationState {
  /**
   * Payload schema version. Absent means v1: the uncompressed `data=` links
   * written before compression existed, which are still read unchanged.
   */
  v?: number;
  appMode?: AppMode;
  name: string;
  type?: 'parametric' | 'custom';
  params?: WaveParams;
  customCode?: string;
  customPrepare?: string;
  density: string;
  rasterMode?: RasterOutputMode;
  ditherAlgorithm?: DitherAlgorithm;
  ditherParams?: DitherParams;
  vectorConfig?: VectorConfig;
  toneConfig?: ToneMappingConfig;
  adjustConfig?: ImageAdjustConfig;
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
  /** Viewfinder framing, so a link opens on the crop the sender was looking at. */
  view?: ShareView;
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

/* ==========================================================================
   Payload codec

   v1 wrote raw JSON as base64 into `data=`. v2 deflates it first and writes
   base64url into `s=`.

   Two parameter names rather than one with a version prefix, because the two
   cannot be told apart from their contents: a legacy base64 payload can begin
   with any character, so any marker chosen would be one that a v1 link might
   already start with. Separate names cannot collide, and v1 links keep working
   without a guess.

   base64url (`+/` -> `-_`, padding dropped) because `+` and `=` get percent-
   escaped or split by chat clients and mail readers, which is where these
   links actually travel.
   ========================================================================== */

const SHARE_SCHEMA_VERSION = 2;
/** v2: deflate-raw, base64url. */
const PARAM_V2 = 's';
/** v1: raw JSON, base64. Read only; never written now. */
const PARAM_V1 = 'data';

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function collectStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/**
 * Encodes the full animation state into a shareable URL pointing to fullscreen
 * viewfinder mode.
 *
 * Async because CompressionStream is. Where it is unavailable the payload
 * falls back to the uncompressed v1 form, which every version can still read.
 */
export async function encodeShareUrl(
  state: FullAnimationState,
  mode: 'fullscreen' | 'editor' = 'fullscreen'
): Promise<string> {
  const payload = JSON.stringify({ ...state, v: SHARE_SCHEMA_VERSION });
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('mode', mode);

  try {
    if (typeof CompressionStream === 'undefined') throw new Error('no CompressionStream');
    const raw = new TextEncoder().encode(payload);
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const deflated = await collectStream(stream);
    url.searchParams.set(PARAM_V2, bytesToBase64Url(deflated));
  } catch {
    url.searchParams.set(PARAM_V1, utf8ToBase64(payload));
  }

  return url.toString();
}

export interface DecodedShare {
  state: FullAnimationState | null;
  mode: 'fullscreen' | 'editor' | null;
}

function readMode(searchParams: URLSearchParams): {
  mode: 'fullscreen' | 'editor' | null;
  modeParam: string | null;
} {
  const modeParam = searchParams.get('mode') || searchParams.get('view');
  return {
    modeParam,
    mode: modeParam === 'fullscreen' ? 'fullscreen' : modeParam === 'editor' ? 'editor' : null,
  };
}

function finishDecode(jsonStr: string, mode: 'fullscreen' | 'editor' | null, modeParam: string | null): DecodedShare {
  const parsed = JSON.parse(jsonStr) as FullAnimationState;

  if (parsed.autoRes === undefined && parsed.lockResolution !== undefined) {
    parsed.autoRes = !parsed.lockResolution;
  }

  return { state: parsed, mode: mode || (modeParam ? 'fullscreen' : null) };
}

/**
 * The v1 half of the decode, which needs nothing asynchronous.
 *
 * Kept separate so decodeShareFromUrl can stay synchronous: App reads it from
 * a useMemo that seeds twenty useState initializers, and turning that async
 * would ripple through the entire component.
 */
function decodeV1(): DecodedShare {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const { mode, modeParam } = readMode(searchParams);
    const dataParam = searchParams.get(PARAM_V1);
    if (!dataParam) return { state: null, mode };
    return finishDecode(base64ToUtf8(dataParam), mode, modeParam);
  } catch (err) {
    console.warn('Failed to decode shared animation state from URL:', err);
    return { state: null, mode: null };
  }
}

let preparedShare: DecodedShare | null = null;

/**
 * Decodes the link before the app mounts, so decodeShareFromUrl can answer
 * synchronously afterwards.
 *
 * DecompressionStream has no synchronous form, and shipping an inflate
 * implementation to avoid one await is not a trade worth making. Call this
 * once from the entry point and render after it settles; it never rejects.
 */
export async function prepareShareFromUrl(): Promise<DecodedShare> {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const { mode, modeParam } = readMode(searchParams);
    const packed = searchParams.get(PARAM_V2);

    if (packed && typeof DecompressionStream !== 'undefined') {
      const bytes = base64UrlToBytes(packed);
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const inflated = await collectStream(stream);
      preparedShare = finishDecode(new TextDecoder().decode(inflated), mode, modeParam);
      return preparedShare;
    }

    if (packed) {
      // A v2 link on a browser without DecompressionStream. Nothing to be done
      // beyond saying so; the app opens on defaults rather than half a state.
      console.warn('This browser cannot read compressed share links (no DecompressionStream).');
      preparedShare = { state: null, mode };
      return preparedShare;
    }
  } catch (err) {
    console.warn('Failed to decode shared animation state from URL:', err);
    preparedShare = { state: null, mode: null };
    return preparedShare;
  }

  preparedShare = decodeV1();
  return preparedShare;
}

/**
 * Shared state and view mode from the current URL.
 *
 * Returns whatever prepareShareFromUrl resolved. Without that call it still
 * reads v1 links, so a caller that forgets loses compressed links but nothing
 * silently misbehaves.
 */
export function decodeShareFromUrl(): DecodedShare {
  return preparedShare ?? decodeV1();
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
