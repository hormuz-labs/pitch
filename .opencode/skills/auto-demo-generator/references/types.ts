export interface DemoConfig {
  startUrl: string;
  userReq: string;
  outputPath?: string;
  cursorStyle?: 'black' | 'white';
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
