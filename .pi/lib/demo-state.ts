/** Capture metadata shared by browser tools and synchronized source assembly. */
export interface ClickEvent {
  videoTimeSec: number
  x: number
  y: number
  hand?: boolean
}

export interface DemoState {
  startTime: number
  endTime?: number
  narrationEndTime?: number
  voiceName: string
  audioClips: {
    filePath: string
    absoluteTimestamp: number
    durationSec?: number
    text?: string
  }[]
  clickEvents: ClickEvent[]
}
