import { describe, it, expect } from 'vitest';
import { createCdpProxy } from '../apps/worker/src/utils/cdp-proxy.js';
import {
  getManagerProfile,
  createManagerProfile,
  launchManagerProfile,
  stopManagerProfile,
  managerCdpUrl,
  managerCdpHttpUrl,
  MANAGER_AUTH_TOKEN
} from '../packages/shared/src/index.js';
import { WebSocket } from 'ws';

describe('cdp-proxy', () => {
  it('should integration test against CloakBrowser Manager', async () => {
    const testUserId = 'test-cdp-proxy-user';
    
    // 1. Get or create a test profile on the manager
    let profile = await getManagerProfile(testUserId);
    if (!profile) {
      profile = await createManagerProfile(testUserId);
    }
    
    expect(profile).toBeDefined();
    expect(profile.id).toBeDefined();

    // 2. Launch the profile
    await launchManagerProfile(profile.id);
    
    // Give the manager/browser a moment to fully spin up
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const managerWsUrl = managerCdpUrl(profile.id);
    const managerHttpUrl = managerCdpHttpUrl(profile.id);
    const proxyPort = 59999;

    // 3. Start our transparent CDP Proxy
    const handle = await createCdpProxy({
      managerHttpUrl,
      managerWsUrl,
      authToken: MANAGER_AUTH_TOKEN,
      port: proxyPort,
    });

    try {
      // 4. Hit the proxy's /json/version endpoint and verify HTTP proxying & URL rewriting
      const resVersion = await fetch(`http://127.0.0.1:${proxyPort}/json/version`);
      expect(resVersion.status).toBe(200);
      const dataVersion = (await resVersion.json()) as any;
      
      expect(dataVersion.webSocketDebuggerUrl).toBeDefined();
      
      // Verify that the wss:// cloakbrowser-manager origin was rewritten to our local ws:// proxy!
      expect(dataVersion.webSocketDebuggerUrl).toContain(`ws://127.0.0.1:${proxyPort}/`);

      // 5. Connect a WebSocket client to the rewritten proxy WebSocket URL to verify end-to-end WS proxying
      const clientWs = new WebSocket(dataVersion.webSocketDebuggerUrl);
      
      const wsOpenPromise = new Promise<void>((resolve, reject) => {
        clientWs.on('open', () => resolve());
        clientWs.on('error', (err) => reject(err));
      });

      await wsOpenPromise;
      expect(clientWs.readyState).toBe(WebSocket.OPEN);
      
      // Give the upstream connection handshake a moment to fully complete before closing
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      clientWs.close();
    } finally {
      // 6. Tear down proxy and stop the browser profile cleanly
      await handle.close();
      await stopManagerProfile(profile.id);
    }
  }, 30000); // 30 second timeout for browser launch & connection
});
