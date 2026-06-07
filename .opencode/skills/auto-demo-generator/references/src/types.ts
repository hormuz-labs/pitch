export interface DemoConfig {
  startUrl: string;
  userReq: string;
  outputPath?: string;
  cursorStyle?: 'black' | 'white';
  companyName?: string;
  introBg?: 'auto' | 'white' | 'black';
  outroUrl?: string;
  outroBg?: string;
  outroTextColor?: string;
  outroText?: string;
  width?: number;
  height?: number;
  voice?: string;
  steps: DemoStep[];
  /** Clerk user ID — used to resolve the CloakBrowser profile dir. */
  userId: string;
}

export interface DemoStep {
  id: string;
  description: string;
  action: 'click' | 'type' | 'wait';
  selector?: string;
  value?: string;
  zoom?: number;
  /**
   * Hint that this click will trigger navigation (e.g. an <a> link, a button that
   * opens a new route, or a redirect). When set (or auto-detected from the
   * target being an <a>/href-bearing element), pass3-record injects a synthetic
   * zoom-in → zoom-out transition so the camera settles to 1.0× before the new
   * page paints. Defaults to auto-detection.
   */
  preNavigate?: boolean;
}

export interface WavConversionOptions {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
}

export interface TrackingEvent {
  id: string;
  actionTime: number;
  cx: number;
  cy: number;
  action: 'click' | 'type' | 'wait' | 'scroll';
  scrollY?: number;
  zoom?: number;
}

export interface TrackingData {
  initDurationMs: number;
  events: TrackingEvent[];
  originalTimeline: Record<string, number>;
}
