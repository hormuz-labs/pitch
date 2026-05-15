export interface DemoConfig {
  startUrl: string;
  userReq: string;
  outputPath?: string;
  cursorStyle?: 'black' | 'white';
  companyName?: string;
  introBg?: 'auto' | 'white' | 'black';
  width?: number;
  height?: number;
  /** Gemini TTS voice name (e.g. "Puck", "Aoede"). Defaults to "Puck". */
  voiceName?: string;
  steps: DemoStep[];
}

export interface DemoStep {
  id: string;
  description: string;
  action: 'click' | 'type' | 'wait';
  selector?: string;
  value?: string;
}

export interface WavConversionOptions {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
}

export interface TrackingEvent {
  id: string;
  actionTime: number; // in seconds (from the timeline)
  cx: number;
  cy: number;
  action: 'click' | 'type' | 'wait' | 'scroll';
  scrollY?: number; // absolute window.scrollY at time of scroll (scroll events only)
}

export interface TrackingData {
  initDurationMs: number;
  events: TrackingEvent[];
}
