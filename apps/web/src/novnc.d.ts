declare module '@novnc/novnc' {
  export default class RFB {
    constructor(container: HTMLElement, url: string, options?: { wsProtocols?: string[] })
    addEventListener(type: string, handler: (event: any) => void): void
    removeEventListener(type: string, handler: (event: any) => void): void
    disconnect(): void
    scaleViewport: boolean
    resizeSession: boolean
    qualityLevel: number
    compressionLevel: number
    showDotCursor: boolean
    viewOnly: boolean
  }
}

declare module '@novnc/novnc/core/rfb.js' {
  import RFB from '@novnc/novnc'
  export default RFB
}
