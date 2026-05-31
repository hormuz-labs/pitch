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
}

export interface DemoStep {
  id: string;
  description: string;
  action: 'click' | 'type' | 'wait';
  selector?: string;
  value?: string;
  zoom?: number;
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
  action: 'click' | 'type' | 'wait' | 'scroll' | 'navigate';
  scrollY?: number;
  zoom?: number;
}

export interface TrackingData {
  initDurationMs: number;
  events: TrackingEvent[];
  originalTimeline: Record<string, number>;
}
