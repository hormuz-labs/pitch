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
  annotationEvents: { videoTimeSec: number }[]
  tabEvents: { tabId: number; wallSec: number }[]
  tabCreationTimes: Record<number, number>
  currentTabId: number
  lastTargetCoords: { ref: string; x: number; y: number; hand?: boolean } | null
  pageUrl?: string
  pageUrlEvents: { videoTimeSec: number; url: string }[]
}
