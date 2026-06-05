declare module '@novnc/novnc' {
    export default class RFB {
        constructor(container: HTMLElement, url: string, options?: any);
        addEventListener(type: string, handler: (e: any) => void): void;
        removeEventListener(type: string, handler: (e: any) => void): void;
        disconnect(): void;
        scaleViewport: boolean;
        resizeSession: boolean;
        showDotCursor: boolean;
        viewOnly: boolean;
    }
}

declare module '@novnc/novnc/core/rfb.js' {
    import RFB from '@novnc/novnc';
    export default RFB;
}
