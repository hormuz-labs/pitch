import { describe, it, expect } from 'vitest';
import { createCdpProxy } from '../apps/worker/src/utils/cdp-proxy.js';
import { WebSocketServer, WebSocket } from 'ws';

describe('cdp-proxy', () => {
  it('should resolve and serve /json/version, /json, and /json/list with or without trailing slash', async () => {
    const port = 59999;
    const targetUrl = 'ws://127.0.0.1:59998';
    
    const handle = await createCdpProxy(targetUrl, undefined, port);
    
    try {
      // Test /json/version
      const resVersion = await fetch(`http://127.0.0.1:${port}/json/version`);
      expect(resVersion.status).toBe(200);
      const dataVersion = (await resVersion.json()) as any;
      expect(dataVersion.Browser).toBe('CloakBrowser');
      expect(dataVersion.webSocketDebuggerUrl).toBe(`ws://127.0.0.1:${port}/`);
      
      // Test /json/version/
      const resVersionSlash = await fetch(`http://127.0.0.1:${port}/json/version/`);
      expect(resVersionSlash.status).toBe(200);
      const dataVersionSlash = (await resVersionSlash.json()) as any;
      expect(dataVersionSlash.Browser).toBe('CloakBrowser');
      
      // Test /json
      const resJson = await fetch(`http://127.0.0.1:${port}/json`);
      expect(resJson.status).toBe(200);
      const dataJson = (await resJson.json()) as any;
      expect(dataJson.Browser).toBe('CloakBrowser');
      
      // Test /json/
      const resJsonSlash = await fetch(`http://127.0.0.1:${port}/json/`);
      expect(resJsonSlash.status).toBe(200);
      const dataJsonSlash = (await resJsonSlash.json()) as any;
      expect(dataJsonSlash.Browser).toBe('CloakBrowser');

      // Test /json/list
      const resList = await fetch(`http://127.0.0.1:${port}/json/list`);
      expect(resList.status).toBe(200);
      const dataList = (await resList.json()) as any;
      expect(dataList.Browser).toBe('CloakBrowser');

      // Test /json/list/
      const resListSlash = await fetch(`http://127.0.0.1:${port}/json/list/`);
      expect(resListSlash.status).toBe(200);
      const dataListSlash = (await resListSlash.json()) as any;
      expect(dataListSlash.Browser).toBe('CloakBrowser');

      // Test invalid endpoint
      const resInvalid = await fetch(`http://127.0.0.1:${port}/invalid`);
      expect(resInvalid.status).toBe(404);
    } finally {
      handle.close();
    }
  });

  it('should proxy WebSocket messages and buffer initial messages sent before target connection is open', async () => {
    const targetPort = 59997;
    const proxyPort = 59996;
    const targetUrl = `ws://127.0.0.1:${targetPort}`;

    // 1. Start target WebSocket server
    const targetWss = new WebSocketServer({ port: targetPort });
    const receivedTargetMessages: string[] = [];
    
    targetWss.on('connection', (ws) => {
      ws.on('message', (data) => {
        receivedTargetMessages.push(data.toString());
        ws.send('response-from-target');
      });
    });

    // 2. Start CDP Proxy
    const proxyHandle = await createCdpProxy(targetUrl, undefined, proxyPort);

    try {
      // 3. Connect client WebSocket to Proxy
      const clientWs = new WebSocket(`ws://127.0.0.1:${proxyPort}`);
      const receivedClientMessages: string[] = [];

      clientWs.on('message', (data) => {
        receivedClientMessages.push(data.toString());
      });

      // 4. Send a message immediately (before targetWs is connected)
      await new Promise<void>((resolve) => {
        clientWs.on('open', () => {
          clientWs.send('hello-from-client-immediate');
          resolve();
        });
      });

      // 5. Wait a brief moment to let connection establish and message flow
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 6. Verify target received the buffered immediate message
      expect(receivedTargetMessages).toContain('hello-from-client-immediate');

      // 7. Verify client received the response from target
      expect(receivedClientMessages).toContain('response-from-target');

      clientWs.close();
    } finally {
      proxyHandle.close();
      await new Promise<void>((resolve) => targetWss.close(() => resolve()));
    }
  });
});
