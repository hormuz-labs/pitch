/**
 * Stripe India Explainer — Film V3
 * Aesthetic: cinematic dataviz, warm cream + Stripe purple
 * Same export contract as v2: { html, buildTimeline(data) }
 */

export const html = `
<div class="fv3-root">
  <style>
    .fv3-root {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #FFF8F3;
      color: #061B31;
      font-family: 'Inter', 'SF Pro Display', -apple-system, system-ui, sans-serif;
      font-feature-settings: 'ss01', 'cv11', 'cv02';
      letter-spacing: -0.01em;
      --ink: #061B31;
      --ink-2: rgba(6,27,49,0.55);
      --ink-3: rgba(6,27,49,0.18);
      --line: rgba(6,27,49,0.08);
      --bg: #FFF8F3;
      --paper: #FFFFFF;
      --warm: #FFE0D1;
      --warm-2: #FFD3BC;
      --accent: #533AFD;
      --accent-2: #8B7CFF;
      --accent-soft: rgba(83,58,253,0.12);
      --accent-glow: rgba(83,58,253,0.35);
      --risk: #E5484D;
      --good: #30A46C;
      --mono: 'JetBrains Mono', 'SF Mono', 'IBM Plex Mono', ui-monospace, monospace;
    }

    .fv3-paper {
      position: absolute; inset: 0;
      background:
        radial-gradient(120% 80% at 85% -10%, rgba(255, 224, 209, 0.85) 0%, transparent 55%),
        radial-gradient(100% 70% at -10% 110%, rgba(83, 58, 253, 0.10) 0%, transparent 60%),
        radial-gradient(60% 50% at 50% 50%, rgba(255,255,255,0.6) 0%, transparent 100%),
        var(--bg);
    }
    .fv3-grid {
      position: absolute; inset: 0;
      background-image:
        linear-gradient(to right, rgba(6,27,49,0.05) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(6,27,49,0.05) 1px, transparent 1px);
      background-size: 64px 64px;
      mask-image: radial-gradient(120% 80% at 50% 50%, black 40%, transparent 95%);
      -webkit-mask-image: radial-gradient(120% 80% at 50% 50%, black 40%, transparent 95%);
    }
    .fv3-grain {
      position: absolute; inset: 0;
      pointer-events: none; opacity: 0.4;
      mix-blend-mode: multiply;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.024 0 0 0 0 0.106 0 0 0 0 0.192 0 0 0 0.45 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
    }
    .fv3-vignette {
      position: absolute; inset: 0; pointer-events: none;
      background: radial-gradient(120% 90% at 50% 50%, transparent 60%, rgba(6,27,49,0.12) 100%);
    }
    .fv3-corner {
      position: absolute; pointer-events: none;
      font-family: var(--mono); font-size: 10px;
      letter-spacing: 0.18em; text-transform: uppercase;
      color: var(--ink-2);
    }
    .fv3-corner.tl { top: 24px; left: 28px; }
    .fv3-corner.tr { top: 24px; right: 28px; }
    .fv3-corner.bl { bottom: 24px; left: 28px; }
    .fv3-corner.br { bottom: 24px; right: 28px; }
    .fv3-corner i { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); margin-right: 8px; vertical-align: middle; }

    .fv3-scene {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 8vh 7vw; box-sizing: border-box;
    }
    .fv3-head {
      position: absolute; top: 9vh; left: 0; right: 0;
      display: flex; flex-direction: column; align-items: center;
      padding: 0 7vw;
    }
    .fv3-stage {
      position: absolute;
      inset: 28vh 7vw 14vh 7vw;
      display: flex; align-items: center; justify-content: center;
    }

    .fv3-kicker {
      font-family: var(--mono); font-size: 12px;
      letter-spacing: 0.2em; text-transform: uppercase;
      color: var(--accent); margin: 0 0 20px 0;
      display: inline-flex; align-items: center; gap: 12px;
    }
    .fv3-kicker::before {
      content: ''; width: 28px; height: 1px; background: var(--accent);
    }
    .fv3-title {
      font-size: clamp(40px, 5.4vw, 80px);
      line-height: 0.98; letter-spacing: -0.035em;
      font-weight: 600; color: var(--ink);
      margin: 0 0 18px 0; text-align: center; max-width: 17ch;
    }
    .fv3-sub {
      font-size: clamp(15px, 1.3vw, 21px); line-height: 1.45;
      color: var(--ink-2); max-width: 56ch; text-align: center; margin: 0;
    }
    .fv3-proof {
      font-family: var(--mono); font-size: 12px;
      letter-spacing: 0.08em; color: var(--ink);
      padding: 9px 16px; border: 1px solid var(--line);
      border-radius: 999px; background: rgba(255,255,255,0.7);
      backdrop-filter: blur(8px);
      display: inline-flex; align-items: center; gap: 10px;
    }
    .fv3-proof::before {
      content: ''; width: 6px; height: 6px; border-radius: 50%;
      background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft);
    }

    .fv3-chaos { width: 100%; height: 100%; }
    .fv3-chaos svg { width: 100%; height: 100%; overflow: visible; }
    .chaos-dot { fill: var(--accent); }
    .chaos-line { stroke: var(--ink); stroke-width: 0.5; opacity: 0; fill: none; }
    .chaos-axis-label {
      font-family: var(--mono); font-size: 9px;
      letter-spacing: 0.15em; text-transform: uppercase;
      fill: var(--ink-2);
    }

    .fv3-flow { width: 100%; height: 100%; position: relative; }
    .fv3-flow svg { width: 100%; height: 100%; overflow: visible; position: absolute; inset: 0; }
    .flow-edge { fill: none; stroke: var(--ink); stroke-width: 1; opacity: 0.2; }
    .flow-particle { fill: var(--accent); }
    .flow-node {
      position: absolute;
      font-family: var(--mono); font-size: 11px;
      letter-spacing: 0.12em; text-transform: uppercase;
      padding: 9px 14px; border: 1px solid var(--line);
      background: var(--paper); border-radius: 999px;
      color: var(--ink); white-space: nowrap;
      transform: translate(-50%, -50%);
      box-shadow: 0 4px 12px -4px rgba(6,27,49,0.08);
    }
    .flow-node i {
      display: inline-block; width: 6px; height: 6px;
      border-radius: 50%; background: var(--accent); margin-right: 8px;
      vertical-align: middle;
    }
    .flow-hub {
      position: absolute; left: 50%; top: 50%;
      transform: translate(-50%, -50%);
      padding: 22px 36px; background: var(--ink); color: var(--bg);
      font-size: 30px; font-weight: 600; letter-spacing: -0.03em;
      border-radius: 14px;
      box-shadow: 0 30px 80px -20px rgba(83,58,253,0.55), 0 0 0 1px rgba(255,255,255,0.06) inset;
      z-index: 2;
    }
    .flow-hub-ring {
      position: absolute; left: 50%; top: 50%;
      width: 200px; height: 200px;
      transform: translate(-50%, -50%);
      border: 1px dashed var(--accent); border-radius: 50%;
      opacity: 0.4; pointer-events: none;
    }

    .fv3-checkout-wrap {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      position: relative;
    }
    .fv3-checkout {
      width: min(420px, 90%); background: var(--paper);
      border: 1px solid var(--line); border-radius: 16px;
      padding: 28px;
      box-shadow: 0 50px 100px -30px rgba(6,27,49,0.20), 0 1px 0 rgba(255,255,255,0.8) inset;
      position: relative; overflow: hidden;
    }
    .ck-brand {
      font-family: var(--mono); font-size: 11px;
      letter-spacing: 0.18em; text-transform: uppercase;
      color: var(--ink-2); margin-bottom: 18px;
      display: flex; justify-content: space-between;
    }
    .ck-amount {
      font-size: 38px; font-weight: 600; letter-spacing: -0.03em;
      color: var(--ink); margin-bottom: 24px; line-height: 1;
    }
    .ck-amount small {
      font-size: 13px; color: var(--ink-2); margin-left: 8px;
      font-weight: 400; font-family: var(--mono); letter-spacing: 0.1em;
    }
    .ck-field {
      height: 44px; border: 1px solid var(--line);
      border-radius: 8px; margin-bottom: 10px;
      display: flex; align-items: center; padding: 0 14px;
      font-family: var(--mono); font-size: 12px; color: var(--ink-2);
      background: var(--bg); position: relative;
      letter-spacing: 0.05em;
    }
    .ck-field-fill {
      position: absolute; left: 14px; top: 0; height: 100%;
      display: flex; align-items: center; color: var(--ink);
      font-family: var(--mono); font-size: 12px; letter-spacing: 0.05em;
    }
    .ck-pay {
      width: 100%; height: 48px; background: var(--accent); color: white;
      border: none; border-radius: 8px; font-size: 14px; font-weight: 500;
      cursor: pointer; margin-top: 10px; letter-spacing: -0.005em;
      position: relative; overflow: hidden;
      font-family: inherit;
    }
    .ck-success {
      position: absolute; inset: 10px 0 0 0; height: 48px;
      display: flex; align-items: center; justify-content: center;
      background: var(--good); color: white; border-radius: 8px;
      font-size: 14px; gap: 8px; opacity: 0;
    }
    .fv3-confetti { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
    .conf { position: absolute; width: 6px; height: 6px; border-radius: 50%; opacity: 0; }

    .fv3-subs {
      width: 100%; height: 100%;
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 5vw; align-items: center;
    }
    .fv3-subs-left {
      display: flex; flex-direction: column; gap: 18px;
      max-width: 340px; justify-self: end;
    }
    .fv3-subs-cycle {
      display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
    }
    .cycle-month {
      padding: 6px 11px; border: 1px solid var(--line);
      border-radius: 6px; background: var(--paper);
      color: var(--ink-2); font-weight: 500;
      font-family: var(--mono); font-size: 10px;
      letter-spacing: 0.1em; text-transform: uppercase;
    }
    .sub-card {
      display: flex; justify-content: space-between; align-items: center;
      padding: 13px 16px; background: var(--paper);
      border: 1px solid var(--line); border-radius: 10px;
      font-size: 13px;
    }
    .sub-card .label { color: var(--ink); font-weight: 500; }
    .sub-card .amt { font-family: var(--mono); color: var(--accent); letter-spacing: 0.04em; }
    .sub-card .recur {
      font-family: var(--mono); font-size: 9px;
      letter-spacing: 0.12em; text-transform: uppercase;
      color: var(--ink-2);
      padding: 3px 7px; border: 1px solid var(--line); border-radius: 4px;
    }
    .fv3-subs-grid-wrap {
      display: flex; flex-direction: column; gap: 12px;
      max-width: 360px; width: 100%;
    }
    .fv3-subs-grid {
      width: 100%; aspect-ratio: 1;
      display: grid; grid-template-columns: repeat(20, 1fr);
      gap: 3px;
    }
    .sub-cell {
      aspect-ratio: 1; background: var(--ink-3); border-radius: 1.5px; opacity: 0.18;
    }
    .fv3-subs-grid-label {
      display: flex; justify-content: space-between;
      font-family: var(--mono); font-size: 10px;
      letter-spacing: 0.12em; text-transform: uppercase;
      color: var(--ink-2);
    }
    .fv3-subs-grid-label em {
      font-style: normal; color: var(--accent);
      font-variant-numeric: tabular-nums;
    }

    .fv3-map {
      width: 100%; height: 100%; position: relative;
      display: flex; align-items: center; justify-content: center;
    }
    .fv3-map-svg {
      width: 100%; height: 100%; max-width: 900px;
      position: relative;
    }
    .fv3-map-svg svg { width: 100%; height: 100%; overflow: visible; }
    .map-arc { fill: none; stroke: var(--accent); stroke-width: 1; opacity: 0.25; stroke-dasharray: 3 4; }
    .map-pin { fill: var(--accent); }
    .map-pin-ring { fill: none; stroke: var(--accent); stroke-width: 1.4; }
    .map-particle { fill: var(--accent); }
    .map-center {
      position: absolute; left: 50%; top: 50%;
      transform: translate(-50%, -50%);
      padding: 14px 22px; background: var(--ink);
      color: var(--bg); border-radius: 10px;
      font-size: 13px; font-weight: 500; letter-spacing: -0.005em;
      z-index: 2;
      box-shadow: 0 20px 50px -15px rgba(83,58,253,0.35);
    }

    .fv3-fraud {
      width: 100%; height: 100%; position: relative;
      display: flex; flex-direction: column;
    }
    .fv3-fraud-legend {
      display: flex; gap: 22px; justify-content: flex-end;
      font-family: var(--mono); font-size: 10px;
      letter-spacing: 0.12em; text-transform: uppercase;
      color: var(--ink-2); margin-bottom: 12px;
    }
    .fv3-fraud-legend span { display: inline-flex; align-items: center; gap: 8px; }
    .fv3-fraud-legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
    .fv3-fraud-svg { flex: 1; width: 100%; }
    .fv3-fraud-svg svg { width: 100%; height: 100%; overflow: visible; }
    .fraud-dot.safe { fill: var(--accent); }
    .fraud-dot.risk { fill: var(--risk); }
    .fraud-axis { stroke: var(--ink-3); stroke-width: 1; }
    .fraud-axis-tick { stroke: var(--ink-3); stroke-width: 0.5; }
    .fraud-axis-label {
      font-family: var(--mono); font-size: 9px;
      letter-spacing: 0.15em; text-transform: uppercase;
      fill: var(--ink-2);
    }
    .fraud-boundary { stroke: var(--ink); stroke-width: 1.5; stroke-dasharray: 5 4; fill: none; }

    .fv3-dash {
      width: 100%; height: 100%;
      display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px;
    }
    .dash-panel {
      background: var(--paper); border: 1px solid var(--line);
      border-radius: 14px; padding: 26px;
      display: flex; flex-direction: column; gap: 18px;
      position: relative; overflow: hidden;
    }
    .dash-panel::before {
      content: ''; position: absolute;
      top: 0; left: 0; right: 0; height: 1px;
      background: linear-gradient(90deg, transparent, var(--accent-glow), transparent);
      opacity: 0.5;
    }
    .dash-label {
      font-family: var(--mono); font-size: 11px;
      letter-spacing: 0.16em; text-transform: uppercase;
      color: var(--ink-2);
      display: flex; justify-content: space-between; align-items: center;
    }
    .dash-label i {
      display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      background: var(--good);
      box-shadow: 0 0 0 3px rgba(48, 164, 108, 0.2);
    }
    .dash-num {
      font-size: clamp(48px, 5.4vw, 88px);
      font-weight: 600; letter-spacing: -0.04em;
      color: var(--ink); line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .dash-num small {
      font-size: 0.4em; color: var(--accent); margin-left: 6px;
      font-weight: 500; font-family: var(--mono); letter-spacing: 0;
    }
    .dash-spark { width: 100%; height: 70px; }
    .dash-spark path { fill: none; stroke: var(--accent); stroke-width: 2; }
    .dash-spark .fill { fill: url(#sparkGrad); stroke: none; opacity: 0.4; }
    .dash-tags {
      display: flex; flex-wrap: wrap; gap: 6px;
    }
    .dash-tag {
      font-family: var(--mono); font-size: 10px;
      letter-spacing: 0.08em; text-transform: uppercase;
      padding: 5px 9px; background: var(--bg);
      border: 1px solid var(--line); border-radius: 4px; color: var(--ink-2);
    }

    .fv3-globe-wrap {
      width: 100%; height: 100%;
      display: grid; grid-template-columns: 1.2fr 1fr;
      gap: 32px; align-items: center;
    }
    .fv3-globe { width: 100%; aspect-ratio: 1; max-width: 460px; position: relative; margin-left: auto; }
    .fv3-globe svg { width: 100%; height: 100%; overflow: visible; }
    .globe-meridian, .globe-parallel { fill: none; stroke: var(--ink); stroke-width: 0.7; opacity: 0; }
    .globe-circle { fill: none; stroke: var(--ink); stroke-width: 1; opacity: 0.4; }
    .globe-pulse { fill: var(--accent); }
    .globe-pulse-ring { fill: none; stroke: var(--accent); stroke-width: 1; }
    .fv3-uptime { display: flex; flex-direction: column; gap: 18px; max-width: 380px; }
    .uptime-label {
      font-family: var(--mono); font-size: 11px;
      letter-spacing: 0.16em; text-transform: uppercase;
      color: var(--ink-2);
    }
    .uptime-num {
      font-size: clamp(48px, 6vw, 88px); font-weight: 600;
      letter-spacing: -0.04em; color: var(--ink);
      font-variant-numeric: tabular-nums; line-height: 1;
    }
    .uptime-num em { color: var(--accent); font-style: normal; }
    .uptime-bar {
      height: 4px; background: var(--ink-3); border-radius: 999px;
      overflow: hidden; position: relative;
    }
    .uptime-bar-fill {
      position: absolute; left: 0; top: 0; bottom: 0;
      background: var(--accent); transform-origin: left center;
      transform: scaleX(0); border-radius: 999px;
    }
    .uptime-detail {
      font-size: 13px; color: var(--ink-2); line-height: 1.45;
      font-family: var(--mono); letter-spacing: 0.04em;
    }

    .fv3-api {
      width: 100%; height: 100%;
      display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px;
    }
    .fv3-code-panel {
      background: var(--ink); color: #E0E5EE;
      border-radius: 14px; padding: 24px 24px 24px 24px;
      font-family: var(--mono); font-size: 13px; line-height: 1.7;
      overflow: hidden;
      box-shadow: 0 40px 80px -30px rgba(83,58,253,0.45);
      position: relative;
    }
    .fv3-code-panel::before {
      content: '● ● ●'; position: absolute; top: 14px; left: 18px;
      letter-spacing: 4px; font-size: 8px; color: rgba(255,255,255,0.22);
    }
    .fv3-code-panel-label {
      position: absolute; top: 14px; right: 20px;
      font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
      color: rgba(255,255,255,0.4);
    }
    .fv3-code-body { margin-top: 22px; white-space: pre; overflow: hidden; }
    .code-key { color: #C4B8FF; }
    .code-str { color: #FFD3BC; }
    .code-fn { color: #8B7CFF; }
    .code-num { color: #FFE0D1; }
    .code-cmt { color: rgba(255,255,255,0.32); }
    .fv3-latency {
      background: var(--paper); border: 1px solid var(--line);
      border-radius: 14px; padding: 24px;
      display: flex; flex-direction: column; gap: 18px;
      position: relative; overflow: hidden;
    }
    .lat-label {
      font-family: var(--mono); font-size: 11px;
      letter-spacing: 0.16em; text-transform: uppercase;
      color: var(--ink-2);
      display: flex; justify-content: space-between; align-items: center;
    }
    .lat-num {
      font-size: 56px; font-weight: 600; letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums; color: var(--ink); line-height: 1;
    }
    .lat-num small { font-size: 0.32em; color: var(--accent); margin-left: 5px; font-family: var(--mono); }
    .lat-bars {
      display: flex; gap: 4px; align-items: flex-end;
      height: 90px;
    }
    .lat-bar {
      flex: 1; background: var(--accent);
      border-radius: 2px 2px 0 0; transform-origin: bottom; transform: scaleY(0);
    }
    .lat-foot {
      font-family: var(--mono); font-size: 10px;
      letter-spacing: 0.12em; text-transform: uppercase;
      color: var(--ink-2);
      display: flex; justify-content: space-between;
    }

    .fv3-final {
      width: 100%; height: 100%;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 36px;
    }
    .fv3-final .fv3-title {
      font-size: clamp(56px, 7vw, 110px); max-width: 18ch;
    }
    .fv3-stat-grid {
      display: grid; grid-template-columns: repeat(2, 1fr);
      gap: 14px; width: min(720px, 92%);
    }
    .stat-card {
      background: var(--paper); border: 1px solid var(--line);
      border-radius: 12px; padding: 22px;
      display: flex; flex-direction: column; gap: 8px;
      position: relative; overflow: hidden;
    }
    .stat-card::before {
      content: ''; position: absolute;
      left: 0; top: 0; bottom: 0; width: 2px;
      background: var(--accent);
      transform: scaleY(0); transform-origin: top;
      transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .stat-card.show::before { transform: scaleY(1); }
    .stat-num {
      font-size: 30px; font-weight: 600; letter-spacing: -0.03em;
      color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1;
    }
    .stat-num em { color: var(--accent); font-style: normal; }
    .stat-desc { font-size: 13px; color: var(--ink-2); line-height: 1.45; }
  </style>

  <div class="fv3-paper"></div>
  <div class="fv3-grid"></div>
  <div class="fv3-vignette"></div>

  <div class="fv3-corner tl"><i></i>STRIPE / FILM_V3</div>
  <div class="fv3-corner tr">REC <span id="fv3-tc">00:00</span></div>
  <div class="fv3-corner bl">16:9 / 24FPS</div>
  <div class="fv3-corner br">IN ► OUT</div>

  <section class="fv3-scene" id="fv3-s1">
    <div class="fv3-head">
      <p class="fv3-kicker">Internet business infrastructure</p>
      <h1 class="fv3-title">Growth creates complexity</h1>
      <p class="fv3-sub">Payments, billing, payouts, and risk often live in disconnected systems.</p>
    </div>
    <div class="fv3-stage">
      <div class="fv3-chaos">
        <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet">
          <text x="20" y="30" class="chaos-axis-label">Tx · Volume</text>
          <text x="940" y="585" class="chaos-axis-label">t →</text>
          <line x1="40" y1="40" x2="40" y2="560" stroke="rgba(6,27,49,0.18)" stroke-width="0.8"/>
          <line x1="40" y1="560" x2="970" y2="560" stroke="rgba(6,27,49,0.18)" stroke-width="0.8"/>
          <g class="chaos-lines"></g>
          <g class="chaos-dots"></g>
        </svg>
      </div>
    </div>
  </section>

  <section class="fv3-scene" id="fv3-s2">
    <div class="fv3-head">
      <p class="fv3-kicker">Unified rails</p>
      <h2 class="fv3-title">One platform for money</h2>
    </div>
    <div class="fv3-stage">
      <div class="fv3-flow">
        <svg viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid meet">
          <g class="flow-edges"></g>
          <g class="flow-particles"></g>
        </svg>
        <div class="flow-hub-ring"></div>
        <div class="flow-hub">Stripe</div>
        <div class="flow-node n1" style="left:14%;top:22%"><i></i>Cards</div>
        <div class="flow-node n2" style="left:14%;top:78%"><i></i>Wallets</div>
        <div class="flow-node n3" style="left:86%;top:22%"><i></i>Banks</div>
        <div class="flow-node n4" style="left:86%;top:78%"><i></i>UPI</div>
      </div>
    </div>
  </section>

  <section class="fv3-scene" id="fv3-s3">
    <div class="fv3-head">
      <p class="fv3-kicker">Checkout</p>
      <h2 class="fv3-title">Accept payments everywhere</h2>
    </div>
    <div class="fv3-stage">
      <div class="fv3-checkout-wrap">
        <div class="fv3-checkout">
          <div class="ck-brand"><span>STRIPE CHECKOUT</span><span>SECURE</span></div>
          <div class="ck-amount">₹<span id="ck-num">2,499.00</span><small>INR</small></div>
          <div class="ck-field"><div class="ck-field-fill" data-text="name@company.com"></div></div>
          <div class="ck-field"><div class="ck-field-fill" data-text="4242 4242 4242 4242"></div></div>
          <div class="ck-field"><div class="ck-field-fill" data-text="12 / 28 · CVC 123"></div></div>
          <button class="ck-pay">Pay ₹2,499.00</button>
          <div class="ck-success">✓ Payment successful</div>
        </div>
        <div class="fv3-confetti"></div>
      </div>
    </div>
  </section>

  <section class="fv3-scene" id="fv3-s4">
    <div class="fv3-head">
      <p class="fv3-kicker">Billing</p>
      <h2 class="fv3-title">Automate recurring revenue</h2>
    </div>
    <div class="fv3-stage">
      <div class="fv3-subs">
        <div class="fv3-subs-left">
          <div class="fv3-subs-cycle">
            <div class="cycle-month">JAN</div><div class="cycle-month">FEB</div><div class="cycle-month">MAR</div>
            <div class="cycle-month">APR</div><div class="cycle-month">MAY</div><div class="cycle-month">JUN</div>
          </div>
          <div class="sub-card sub-card-1"><span class="label">Pro plan</span><span class="amt">₹999.00</span><span class="recur">Monthly</span></div>
          <div class="sub-card sub-card-2"><span class="label">Team seat × 12</span><span class="amt">₹14,400.00</span><span class="recur">Monthly</span></div>
          <div class="sub-card sub-card-3"><span class="label">Enterprise</span><span class="amt">₹2,49,000</span><span class="recur">Annual</span></div>
        </div>
        <div class="fv3-subs-grid-wrap">
          <div class="fv3-subs-grid-label"><span>Active subscriptions</span><em id="sub-counter">0</em></div>
          <div class="fv3-subs-grid"></div>
          <div class="fv3-subs-grid-label"><span>200M+ active subscriptions managed on Stripe Billing</span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="fv3-scene" id="fv3-s5">
    <div class="fv3-head">
      <p class="fv3-kicker">Connect</p>
      <h2 class="fv3-title">Scale payouts seamlessly</h2>
    </div>
    <div class="fv3-stage">
      <div class="fv3-map">
        <div class="fv3-map-svg">
          <svg viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid meet">
            <g class="map-arcs"></g>
            <g class="map-pins"></g>
            <g class="map-particles"></g>
          </svg>
          <div class="map-center">Platform</div>
        </div>
      </div>
    </div>
    <div style="position:absolute; bottom:10vh; left:0; right:0; display:flex; justify-content:center;">
      <div class="fv3-proof">Get sellers in 25 countries paid</div>
    </div>
  </section>

  <section class="fv3-scene" id="fv3-s6">
    <div class="fv3-head">
      <p class="fv3-kicker">Radar</p>
      <h2 class="fv3-title">Smarter fraud decisions</h2>
    </div>
    <div class="fv3-stage">
      <div class="fv3-fraud">
        <div class="fv3-fraud-legend">
          <span><i style="background:var(--accent)"></i>Approved</span>
          <span><i style="background:var(--risk)"></i>Blocked</span>
          <span>Decision boundary</span>
        </div>
        <div class="fv3-fraud-svg">
          <svg viewBox="0 0 1000 460" preserveAspectRatio="xMidYMid meet">
            <line x1="60" y1="40" x2="60" y2="420" class="fraud-axis"/>
            <line x1="60" y1="420" x2="960" y2="420" class="fraud-axis"/>
            <text x="14" y="220" class="fraud-axis-label" transform="rotate(-90 14 220)">Risk score</text>
            <text x="930" y="445" class="fraud-axis-label">Amount →</text>
            <g class="fraud-ticks"></g>
            <g class="fraud-dots"></g>
            <path class="fraud-boundary" d="M 60 200 Q 400 220 700 130 T 960 80"/>
          </svg>
        </div>
      </div>
    </div>
  </section>

  <section class="fv3-scene" id="fv3-s7">
    <div class="fv3-head">
      <p class="fv3-kicker">Sigma</p>
      <h2 class="fv3-title">Real-time performance visibility</h2>
    </div>
    <div class="fv3-stage">
      <div class="fv3-dash">
        <div class="dash-panel">
          <div class="dash-label"><span>Payments volume · 2025</span><span><i></i> LIVE</span></div>
          <div class="dash-num"><span id="fv3-v1">0.0</span><small>tn USD</small></div>
          <svg class="dash-spark" viewBox="0 0 400 80" preserveAspectRatio="none">
            <defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#533AFD" stop-opacity="0.4"/><stop offset="100%" stop-color="#533AFD" stop-opacity="0"/></linearGradient></defs>
            <path class="fill" id="spark-fill" d="M 0 80 L 0 60 L 25 55 L 50 58 L 75 50 L 100 52 L 125 45 L 150 42 L 175 40 L 200 35 L 225 32 L 250 28 L 275 30 L 300 22 L 325 18 L 350 14 L 375 10 L 400 6 L 400 80 Z"/>
            <path id="spark-line" d="M 0 60 L 25 55 L 50 58 L 75 50 L 100 52 L 125 45 L 150 42 L 175 40 L 200 35 L 225 32 L 250 28 L 275 30 L 300 22 L 325 18 L 350 14 L 375 10 L 400 6"/>
          </svg>
        </div>
        <div class="dash-panel">
          <div class="dash-label"><span>Currencies + methods</span><span><i></i> LIVE</span></div>
          <div class="dash-num" id="fv3-v2">0+</div>
          <div class="dash-tags">
            <span class="dash-tag">USD</span><span class="dash-tag">INR</span><span class="dash-tag">EUR</span><span class="dash-tag">GBP</span>
            <span class="dash-tag">JPY</span><span class="dash-tag">CAD</span><span class="dash-tag">AUD</span><span class="dash-tag">SGD</span>
            <span class="dash-tag">UPI</span><span class="dash-tag">+126</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="fv3-scene" id="fv3-s8">
    <div class="fv3-head">
      <p class="fv3-kicker">Infrastructure</p>
      <h2 class="fv3-title">Reliable global infrastructure</h2>
    </div>
    <div class="fv3-stage">
      <div class="fv3-globe-wrap">
        <div class="fv3-globe"><svg viewBox="-220 -220 440 440" preserveAspectRatio="xMidYMid meet"><circle cx="0" cy="0" r="200" class="globe-circle"/><g class="globe-meridians"></g><g class="globe-parallels"></g><g class="globe-pulses"></g></svg></div>
        <div class="fv3-uptime"><div class="uptime-label">Historical uptime</div><div class="uptime-num"><em>99.999</em>%</div><div class="uptime-bar"><div class="uptime-bar-fill"></div></div><div class="uptime-detail">99.999% historical uptime for Stripe services</div></div>
      </div>
    </div>
  </section>

  <section class="fv3-scene" id="fv3-s9">
    <div class="fv3-head">
      <p class="fv3-kicker">Developer</p>
      <h2 class="fv3-title">APIs built for speed</h2>
    </div>
    <div class="fv3-stage">
      <div class="fv3-api">
        <div class="fv3-code-panel"><div class="fv3-code-panel-label">POST /v1/checkout/sessions</div><pre class="fv3-code-body" id="fv3-code"></pre></div>
        <div class="fv3-latency"><div class="lat-label"><span>P50 latency</span><span><i style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--good);box-shadow:0 0 0 3px rgba(48,164,108,0.2)"></i></span></div><div class="lat-num"><span id="fv3-lat">0</span><small>ms</small></div><div class="lat-bars" id="lat-bars"></div><div class="lat-foot"><span>0ms</span><span>500ms</span></div></div>
      </div>
    </div>
  </section>

  <section class="fv3-scene" id="fv3-s10">
    <div class="fv3-final">
      <div><p class="fv3-kicker" style="justify-content:center;display:flex">Ready when you are</p><h2 class="fv3-title">Start now with Stripe</h2></div>
      <div class="fv3-stat-grid">
        <div class="stat-card sc-1"><div class="stat-num"><em id="fv3-st1">0</em>+</div><div class="stat-desc">currencies and payment methods supported</div></div>
        <div class="stat-card sc-2"><div class="stat-num">US$<em id="fv3-st2">0.0</em>tn</div><div class="stat-desc">in payments volume processed in 2025</div></div>
        <div class="stat-card sc-3"><div class="stat-num"><em id="fv3-st3">0</em>M+</div><div class="stat-desc">active subscriptions managed on Stripe Billing</div></div>
        <div class="stat-card sc-4"><div class="stat-num"><em id="fv3-st4">0</em>%</div><div class="stat-desc">of Fortune 100 companies have used Stripe</div></div>
      </div>
    </div>
  </section>

  <div class="fv3-grain"></div>
</div>`;

const SVG = 'http://www.w3.org/2000/svg';
function svgEl(name, attrs = {}) { const el = document.createElementNS(SVG, name); for (const k in attrs) el.setAttribute(k, attrs[k]); return el; }

function generateScene1() {
  const linesG = document.querySelector('#fv3-s1 .chaos-lines');
  const dotsG = document.querySelector('#fv3-s1 .chaos-dots');
  if (!linesG || !dotsG) return null;
  linesG.innerHTML = ''; dotsG.innerHTML = '';
  const dots = [];
  for (let i = 0; i < 90; i++) {
    const startX = 60 + (i % 3) * 4;
    const startY = 70 + i * 5.3;
    if (startY > 540) continue;
    const endX = 100 + Math.random() * 840;
    const endY = 80 + Math.random() * 460;
    const r = 2.2 + Math.random() * 1.8;
    const c = svgEl('circle', { class: 'chaos-dot', cx: startX, cy: startY, r });
    c.dataset.ex = endX;
    c.dataset.ey = endY;
    dotsG.appendChild(c);
    dots.push({ el: c, ex: endX, ey: endY });
  }
  for (let i = 0; i < 32; i++) {
    const a = dots[Math.floor(Math.random() * dots.length)];
    const b = dots[Math.floor(Math.random() * dots.length)];
    if (!a || !b || a === b) continue;
    linesG.appendChild(svgEl('line', { class: 'chaos-line', x1: a.ex, y1: a.ey, x2: b.ex, y2: b.ey }));
  }
  return dots;
}

function generateScene2() {
  const edgesG = document.querySelector('#fv3-s2 .flow-edges');
  const partsG = document.querySelector('#fv3-s2 .flow-particles');
  if (!edgesG || !partsG) return null;
  edgesG.innerHTML = '';
  partsG.innerHTML = '';
  const cx = 500;
  const cy = 250;
  const nodes = [{ x: 140, y: 110 }, { x: 140, y: 390 }, { x: 860, y: 110 }, { x: 860, y: 390 }];
  const paths = [];
  nodes.forEach((n, i) => {
    const d = `M ${n.x} ${n.y} Q ${(n.x + cx) / 2} ${n.y} ${cx} ${cy}`;
    edgesG.appendChild(svgEl('path', { class: 'flow-edge', d }));
    edgesG.appendChild(svgEl('path', { d, fill: 'none', stroke: 'transparent', id: `fv3-flowpath-${i}` }));
    paths.push({ d, n });
  });
  const particles = [];
  paths.forEach((path, pi) => {
    for (let i = 0; i < 3; i++) {
      const dot = svgEl('circle', { class: 'flow-particle', cx: path.n.x, cy: path.n.y, r: 2.4, opacity: 0 });
      partsG.appendChild(dot);
      particles.push({ el: dot, pathIndex: pi, offset: i * 0.33 });
    }
  });
  return { particles };
}

function generateScene4() {
  const grid = document.querySelector('#fv3-s4 .fv3-subs-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < 400; i++) {
    const cell = document.createElement('div');
    cell.className = 'sub-cell';
    grid.appendChild(cell);
  }
}

function generateScene5() {
  const arcsG = document.querySelector('#fv3-s5 .map-arcs');
  const pinsG = document.querySelector('#fv3-s5 .map-pins');
  const partsG = document.querySelector('#fv3-s5 .map-particles');
  if (!arcsG || !pinsG || !partsG) return null;
  arcsG.innerHTML = '';
  pinsG.innerHTML = '';
  partsG.innerHTML = '';
  const cx = 500;
  const cy = 250;
  const dests = [];
  for (let i = 0; i < 25; i++) {
    const angle = (i / 25) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
    const radius = 180 + Math.random() * 100;
    const x = cx + Math.cos(angle) * radius * 1.6;
    const y = cy + Math.sin(angle) * radius * 0.85;
    dests.push({ x, y });
    arcsG.appendChild(svgEl('path', { class: 'map-arc', d: `M ${cx} ${cy} Q ${(cx + x) / 2} ${(cy + y) / 2 - 40 - Math.random() * 30} ${x} ${y}` }));
    pinsG.appendChild(svgEl('circle', { class: 'map-pin-ring', cx: x, cy: y, r: 6 }));
    pinsG.appendChild(svgEl('circle', { class: 'map-pin', cx: x, cy: y, r: 2.5 }));
    const particle = svgEl('circle', { class: 'map-particle', cx, cy, r: 2, opacity: 0 });
    particle.dataset.tx = x;
    particle.dataset.ty = y;
    partsG.appendChild(particle);
  }
  return dests;
}

function generateScene6() {
  const dotsG = document.querySelector('#fv3-s6 .fraud-dots');
  const ticksG = document.querySelector('#fv3-s6 .fraud-ticks');
  if (!dotsG || !ticksG) return null;
  dotsG.innerHTML = '';
  ticksG.innerHTML = '';
  for (let i = 0; i <= 5; i++) ticksG.appendChild(svgEl('line', { class: 'fraud-axis-tick', x1: 60 + (i / 5) * 900, y1: 420, x2: 60 + (i / 5) * 900, y2: 425 }));
  for (let i = 0; i <= 4; i++) ticksG.appendChild(svgEl('line', { class: 'fraud-axis-tick', x1: 55, y1: 420 - (i / 4) * 380, x2: 60, y2: 420 - (i / 4) * 380 }));
  const pts = [];
  for (let i = 0; i < 95; i++) {
    const x = 80 + Math.random() * 870;
    const t = (x - 60) / 900;
    const yBound = 200 - t * 120 + 30 * Math.sin(t * 4);
    const isRisk = Math.random() < 0.18;
    const y = isRisk ? 60 + Math.random() * (yBound - 70) : yBound + 30 + Math.random() * (400 - yBound - 30);
    if (y < 50 || y > 415) continue;
    const c = svgEl('circle', { class: `fraud-dot ${isRisk ? 'risk' : 'safe'}`, cx: x, cy: y, r: 2 + Math.random() * 2 });
    dotsG.appendChild(c);
    pts.push({ el: c, isRisk });
  }
  return pts;
}

function generateScene8() {
  const meridG = document.querySelector('#fv3-s8 .globe-meridians');
  const parG = document.querySelector('#fv3-s8 .globe-parallels');
  const pulseG = document.querySelector('#fv3-s8 .globe-pulses');
  if (!meridG || !parG || !pulseG) return null;
  meridG.innerHTML = '';
  parG.innerHTML = '';
  pulseG.innerHTML = '';
  const R = 200;
  for (let i = 0; i < 9; i++) meridG.appendChild(svgEl('ellipse', { class: 'globe-meridian', cx: 0, cy: 0, rx: Math.abs(Math.cos(Math.PI * (i / 8))) * R, ry: R }));
  for (let i = -3; i <= 3; i++) {
    const y = (i / 4) * R;
    const r = Math.sqrt(Math.max(0, R * R - y * y));
    parG.appendChild(svgEl('ellipse', { class: 'globe-parallel', cx: 0, cy: y, rx: r, ry: r * 0.18 }));
  }
  const pulses = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * (R - 18);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr * 0.95;
    const dot = svgEl('circle', { class: 'globe-pulse', cx: x, cy: y, r: 3, opacity: 0 });
    const ring = svgEl('circle', { class: 'globe-pulse-ring', cx: x, cy: y, r: 3, opacity: 0 });
    pulseG.appendChild(ring);
    pulseG.appendChild(dot);
    pulses.push({ dot, ring, delay: i * 0.18 });
  }
  return pulses;
}

function generateScene9Bars() {
  const bars = document.getElementById('lat-bars');
  if (!bars) return [];
  bars.innerHTML = '';
  const heights = [];
  for (let i = 0; i < 28; i++) {
    const h = 0.18 + Math.random() * 0.55;
    heights.push(h);
    const b = document.createElement('div');
    b.className = 'lat-bar';
    b.style.height = `${h * 100}%`;
    b.style.transform = 'scaleY(0)';
    bars.appendChild(b);
  }
  return heights;
}

function generateConfetti() {
  const wrap = document.querySelector('#fv3-s3 .fv3-confetti');
  if (!wrap) return [];
  wrap.innerHTML = '';
  const colors = ['#533AFD', '#FFE0D1', '#061B31', '#8B7CFF', '#FFD3BC'];
  const conf = [];
  for (let i = 0; i < 28; i++) {
    const d = document.createElement('div');
    d.className = 'conf';
    d.style.left = '50%';
    d.style.top = '50%';
    d.style.background = colors[i % colors.length];
    if (i % 3 === 0) d.style.borderRadius = '1px';
    wrap.appendChild(d);
    conf.push(d);
  }
  return conf;
}

function paintCode() {
  const el = document.getElementById('fv3-code');
  if (!el) return;
  el.innerHTML = `<span class="code-cmt">// Create a Checkout Session</span>\n<span class="code-key">const</span> session = <span class="code-key">await</span> stripe.checkout.sessions.<span class="code-fn">create</span>({\n  mode: <span class="code-str">'payment'</span>,\n  line_items: [{ price: <span class="code-str">'price_xxx'</span>, quantity: <span class="code-num">1</span> }],\n  success_url: <span class="code-str">'https://example.com/success'</span>\n});`;
}

const hideScene = (id) => gsap.to(id, { autoAlpha: 0, scale: 1.04, filter: 'blur(10px)', duration: 0.55, ease: 'power2.in' });
const showScene = (id) => gsap.fromTo(id, { autoAlpha: 0, scale: 0.97, filter: 'blur(10px)' }, { autoAlpha: 1, scale: 1, filter: 'blur(0px)', duration: 0.85, ease: 'expo.out' });

export function buildTimeline(data = {}) {
  const s1Dots = generateScene1();
  const s2Flow = generateScene2();
  generateScene4();
  const s5Dests = generateScene5();
  const s6Pts = generateScene6();
  const s8Pulses = generateScene8();
  generateScene9Bars();
  const s3Conf = generateConfetti();
  paintCode();

  gsap.set('.fv3-root', { perspective: 1400 });
  gsap.set('.fv3-scene', { autoAlpha: 0, position: 'absolute', width: '100%', height: '100%', top: 0, left: 0 });
  gsap.set('.fv3-title, .fv3-sub, .fv3-kicker, .fv3-proof', { autoAlpha: 0, y: 24, transformOrigin: '50% 50%' });

  gsap.to('.fv3-grid', { backgroundPosition: '64px 64px', duration: 24, ease: 'none', repeat: -1 });
  gsap.to('.fv3-grain', { opacity: 0.45, duration: 0.9, repeat: -1, yoyo: true, ease: 'sine.inOut' });

  const tc = { v: 0 };
  gsap.to(tc, {
    v: 45,
    duration: 45,
    ease: 'none',
    repeat: -1,
    onUpdate: () => {
      const el = document.getElementById('fv3-tc');
      if (!el) return;
      const s = Math.floor(tc.v % 60).toString().padStart(2, '0');
      el.textContent = `00:${s}`;
    }
  });

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  tl.addLabel('s1')
    .call(() => gsap.set('#fv3-s1', { autoAlpha: 1, scale: 1, filter: 'blur(0px)' }))
    .to('#fv3-s1 .fv3-kicker', { autoAlpha: 1, y: 0, duration: 0.7, ease: 'expo.out' }, 's1')
    .to('#fv3-s1 .fv3-title', { autoAlpha: 1, y: 0, duration: 0.9, ease: 'expo.out' }, 's1+=0.08')
    .to('#fv3-s1 .fv3-sub', { autoAlpha: 1, y: 0, duration: 0.9, ease: 'expo.out' }, 's1+=0.18');

  if (s1Dots && s1Dots.length) {
    const dotEls = s1Dots.map((d) => d.el);
    tl.fromTo(dotEls, { opacity: 0 }, { opacity: 0.85, duration: 0.5, stagger: { each: 0.005, from: 'start' }, ease: 'power2.out' }, 's1+=0.2');
    tl.to(dotEls, {
      attr: { cx: (i, t) => parseFloat(t.dataset.ex), cy: (i, t) => parseFloat(t.dataset.ey) },
      duration: 1.6,
      ease: 'expo.out',
      stagger: { each: 0.006, from: 'random' }
    }, 's1+=0.5');
  }
  tl.to('#fv3-s1 .chaos-line', { opacity: 0.18, duration: 0.6, stagger: { each: 0.02, from: 'random' }, ease: 'power2.out' }, 's1+=1.6');
  tl.add(hideScene('#fv3-s1'), '+=0.5');

  tl.addLabel('s2', '-=0.2')
    .add(showScene('#fv3-s2'), 's2')
    .to('#fv3-s2 .fv3-kicker', { autoAlpha: 1, y: 0, duration: 0.7, ease: 'expo.out' }, 's2+=0.1')
    .to('#fv3-s2 .fv3-title', { autoAlpha: 1, y: 0, duration: 0.9, ease: 'expo.out' }, 's2+=0.15')
    .from('#fv3-s2 .flow-node', { autoAlpha: 0, scale: 0.6, x: (i) => (i < 2 ? -40 : 40), duration: 0.7, stagger: 0.06, ease: 'back.out(1.5)' }, 's2+=0.3')
    .from('#fv3-s2 .flow-hub', { autoAlpha: 0, scale: 0.4, duration: 0.8, ease: 'back.out(1.8)' }, 's2+=0.45')
    .from('#fv3-s2 .flow-hub-ring', { autoAlpha: 0, scale: 0.5, duration: 1.1, ease: 'expo.out' }, 's2+=0.5');

  if (s2Flow) {
    const s2pathEls = Array.from(document.querySelectorAll('#fv3-s2 .flow-edges path.flow-edge'));
    s2Flow.particles.forEach((p) => {
      const path = s2pathEls[p.pathIndex];
      if (!path) return;
      const len = path.getTotalLength();
      const proxy = { t: 0 };
      tl.to(p.el, { opacity: 1, duration: 0.2, ease: 'power2.out' }, `s2+=${0.8 + p.offset * 0.4}`);
      tl.to(proxy, {
        t: 1,
        duration: 1.6,
        ease: 'sine.inOut',
        repeat: 1,
        onUpdate: () => {
          const pt = path.getPointAtLength(proxy.t * len);
          p.el.setAttribute('cx', pt.x);
          p.el.setAttribute('cy', pt.y);
        }
      }, `s2+=${0.8 + p.offset * 0.4}`);
    });
  }
  tl.to('#fv3-s2 .flow-hub', { boxShadow: '0 30px 80px -20px rgba(83,58,253,0.85)', scale: 1.04, duration: 0.4, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 's2+=2.6');
  tl.add(hideScene('#fv3-s2'), '+=0.4');

  tl.addLabel('s3', '-=0.2')
    .add(showScene('#fv3-s3'), 's3')
    .to('#fv3-s3 .fv3-kicker', { autoAlpha: 1, y: 0, duration: 0.6, ease: 'expo.out' }, 's3+=0.1')
    .to('#fv3-s3 .fv3-title', { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' }, 's3+=0.15')
    .from('#fv3-s3 .fv3-checkout', { autoAlpha: 0, y: 30, scale: 0.94, duration: 0.8, ease: 'expo.out' }, 's3+=0.3');

  const fields = document.querySelectorAll('#fv3-s3 .ck-field-fill');
  fields.forEach((f, i) => {
    const text = f.dataset.text || '';
    const obj = { i: 0 };
    tl.to(obj, {
      i: text.length,
      duration: 0.4 + text.length * 0.018,
      ease: 'none',
      onUpdate: () => {
        f.textContent = text.slice(0, Math.floor(obj.i));
      }
    }, `s3+=${0.7 + i * 0.5}`);
  });

  tl.to('#fv3-s3 .ck-pay', { scale: 0.97, duration: 0.12, ease: 'power1.in' }, 's3+=2.7')
    .to('#fv3-s3 .ck-pay', { scale: 1, duration: 0.2, ease: 'power2.out' }, 's3+=2.85')
    .to('#fv3-s3 .ck-success', { autoAlpha: 1, duration: 0.35, ease: 'expo.out' }, 's3+=2.9');

  if (s3Conf && s3Conf.length) {
    s3Conf.forEach((c, i) => {
      const angle = (i / s3Conf.length) * Math.PI * 2;
      const dist = 80 + Math.random() * 110;
      tl.fromTo(c, { x: 0, y: 0, opacity: 1, scale: 1 }, { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist - 30, opacity: 0, scale: 0.6, duration: 1.2, ease: 'power2.out' }, 's3+=2.95');
    });
  }
  tl.add(hideScene('#fv3-s3'), '+=0.6');

  tl.addLabel('s4', '-=0.2')
    .add(showScene('#fv3-s4'), 's4')
    .to('#fv3-s4 .fv3-kicker', { autoAlpha: 1, y: 0, duration: 0.6, ease: 'expo.out' }, 's4+=0.1')
    .to('#fv3-s4 .fv3-title', { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' }, 's4+=0.15')
    .from('#fv3-s4 .cycle-month', { autoAlpha: 0, y: 10, stagger: 0.05, duration: 0.4, ease: 'power3.out' }, 's4+=0.3')
    .from('#fv3-s4 .sub-card', { autoAlpha: 0, x: -20, stagger: 0.1, duration: 0.5, ease: 'power3.out' }, 's4+=0.45')
    .to('#fv3-s4 .cycle-month', { backgroundColor: 'var(--accent)', color: 'white', borderColor: 'var(--accent)', duration: 0.25, stagger: 0.18, ease: 'power2.out' }, 's4+=1.1')
    .to('#fv3-s4 .sub-cell', { backgroundColor: '#533AFD', opacity: 1, duration: 0.25, stagger: { each: 0.0035, from: 'random' }, ease: 'power2.out' }, 's4+=0.6')
    .to({ v: 0 }, {
      v: 200,
      duration: 1.6,
      ease: 'power3.out',
      onUpdate: function onUpdate() {
        const el = document.getElementById('sub-counter');
        if (el) el.textContent = `${Math.floor(this.targets()[0].v)}M+`;
      }
    }, 's4+=0.6');
  tl.add(hideScene('#fv3-s4'), '+=0.5');

  tl.addLabel('s5', '-=0.2')
    .add(showScene('#fv3-s5'), 's5')
    .to('#fv3-s5 .fv3-kicker', { autoAlpha: 1, y: 0, duration: 0.6, ease: 'expo.out' }, 's5+=0.1')
    .to('#fv3-s5 .fv3-title', { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' }, 's5+=0.15')
    .from('#fv3-s5 .map-center', { autoAlpha: 0, scale: 0.6, duration: 0.6, ease: 'back.out(1.6)' }, 's5+=0.3');

  document.querySelectorAll('#fv3-s5 .map-arc').forEach((p) => {
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len}`;
    p.style.strokeDashoffset = `${len}`;
  });
  tl.to('#fv3-s5 .map-arc', { strokeDashoffset: 0, duration: 0.7, stagger: 0.025, ease: 'power2.out' }, 's5+=0.4')
    .from('#fv3-s5 .map-pin, #fv3-s5 .map-pin-ring', { autoAlpha: 0, scale: 0, transformOrigin: 'center', duration: 0.5, stagger: 0.03, ease: 'back.out(2)' }, 's5+=0.6');

  if (s5Dests) {
    const partEls = Array.from(document.querySelectorAll('#fv3-s5 .map-particles circle'));
    partEls.forEach((p, i) => {
      const tx = parseFloat(p.dataset.tx);
      const ty = parseFloat(p.dataset.ty);
      tl.to(p, { opacity: 1, duration: 0.1 }, `s5+=${0.85 + i * 0.025}`)
        .to(p, { attr: { cx: tx, cy: ty }, duration: 0.7, ease: 'power2.in' }, `s5+=${0.85 + i * 0.025}`)
        .to(p, { opacity: 0, duration: 0.2 }, `s5+=${1.5 + i * 0.025}`);
    });
  }

  tl.fromTo('#fv3-s5 .fv3-proof', { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'back.out(1.4)' }, 's5+=1.5');
  tl.add(hideScene('#fv3-s5'), '+=0.6');

  tl.addLabel('s6', '-=0.2')
    .add(showScene('#fv3-s6'), 's6')
    .to('#fv3-s6 .fv3-kicker', { autoAlpha: 1, y: 0, duration: 0.6, ease: 'expo.out' }, 's6+=0.1')
    .to('#fv3-s6 .fv3-title', { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' }, 's6+=0.15')
    .from('#fv3-s6 .fv3-fraud-legend > span', { autoAlpha: 0, y: 6, stagger: 0.08, duration: 0.4, ease: 'power3.out' }, 's6+=0.25')
    .from('#fv3-s6 .fraud-axis, #fv3-s6 .fraud-axis-tick', { autoAlpha: 0, duration: 0.4, stagger: 0.01, ease: 'power2.out' }, 's6+=0.3');

  if (s6Pts && s6Pts.length) {
    tl.from(s6Pts.map((p) => p.el), { autoAlpha: 0, scale: 0, transformOrigin: 'center', duration: 0.4, stagger: { each: 0.005, from: 'random' }, ease: 'back.out(1.4)' }, 's6+=0.5');
  }

  const boundary = document.querySelector('#fv3-s6 .fraud-boundary');
  if (boundary) {
    const len = boundary.getTotalLength();
    boundary.style.strokeDasharray = `${len}`;
    boundary.style.strokeDashoffset = `${len}`;
    tl.to(boundary, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut' }, 's6+=1.3');
  }

  const riskEls = s6Pts ? s6Pts.filter((p) => p.isRisk).map((p) => p.el) : [];
  if (riskEls.length) {
    tl.to(riskEls, { r: 4.5, duration: 0.2, ease: 'power2.out', stagger: 0.02 }, 's6+=2.4')
      .to(riskEls, { autoAlpha: 0, scale: 0, transformOrigin: 'center', duration: 0.4, stagger: 0.025, ease: 'power2.in' }, 's6+=2.7');
  }
  tl.add(hideScene('#fv3-s6'), '+=0.5');

  tl.addLabel('s7', '-=0.2')
    .add(showScene('#fv3-s7'), 's7')
    .to('#fv3-s7 .fv3-kicker', { autoAlpha: 1, y: 0, duration: 0.6, ease: 'expo.out' }, 's7+=0.1')
    .to('#fv3-s7 .fv3-title', { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' }, 's7+=0.15')
    .from('#fv3-s7 .dash-panel', { autoAlpha: 0, y: 24, stagger: 0.12, duration: 0.7, ease: 'expo.out' }, 's7+=0.3');

  const sparkLine = document.getElementById('spark-line');
  const sparkFill = document.getElementById('spark-fill');
  if (sparkLine) {
    const lineLen = sparkLine.getTotalLength();
    sparkLine.style.strokeDasharray = `${lineLen}`;
    sparkLine.style.strokeDashoffset = `${lineLen}`;
    tl.to(sparkLine, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.out' }, 's7+=0.7');
  }
  if (sparkFill) {
    tl.fromTo(sparkFill, { opacity: 0 }, { opacity: 0.4, duration: 1.2, ease: 'power2.out' }, 's7+=0.9');
  }

  tl.to({ v: 0 }, {
    v: 1.9,
    duration: 1.6,
    ease: 'power3.out',
    onUpdate: function onUpdate() {
      const el = document.getElementById('fv3-v1');
      if (el) el.textContent = this.targets()[0].v.toFixed(1);
    }
  }, 's7+=0.7')
    .to({ v: 0 }, {
      v: 135,
      duration: 1.6,
      ease: 'power3.out',
      onUpdate: function onUpdate() {
        const el = document.getElementById('fv3-v2');
        if (el) el.textContent = `${Math.floor(this.targets()[0].v)}+`;
      }
    }, 's7+=0.85')
    .from('#fv3-s7 .dash-tag', { autoAlpha: 0, y: 6, stagger: 0.04, duration: 0.4, ease: 'power3.out' }, 's7+=1.1');
  tl.add(hideScene('#fv3-s7'), '+=0.6');

  tl.addLabel('s8', '-=0.2')
    .add(showScene('#fv3-s8'), 's8')
    .to('#fv3-s8 .fv3-kicker', { autoAlpha: 1, y: 0, duration: 0.6, ease: 'expo.out' }, 's8+=0.1')
    .to('#fv3-s8 .fv3-title', { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' }, 's8+=0.15');

  const globeCircle = document.querySelector('#fv3-s8 .globe-circle');
  if (globeCircle) {
    const gLen = globeCircle.getTotalLength();
    globeCircle.style.strokeDasharray = `${gLen}`;
    globeCircle.style.strokeDashoffset = `${gLen}`;
    tl.to(globeCircle, { strokeDashoffset: 0, duration: 1, ease: 'power2.out' }, 's8+=0.3');
  }

  tl.to('#fv3-s8 .globe-meridian', { opacity: 0.18, duration: 0.5, stagger: 0.04, ease: 'power2.out' }, 's8+=0.6')
    .to('#fv3-s8 .globe-parallel', { opacity: 0.16, duration: 0.5, stagger: 0.05, ease: 'power2.out' }, 's8+=0.7')
    .to('#fv3-s8 .fv3-globe svg', { rotate: 12, transformOrigin: 'center', duration: 4.5, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 's8+=0.4');

  if (s8Pulses) {
    s8Pulses.forEach((p) => {
      tl.to(p.dot, { opacity: 1, duration: 0.2 }, `s8+=${0.9 + p.delay}`)
        .fromTo(p.ring, { opacity: 0.8, attr: { r: 3 } }, { opacity: 0, attr: { r: 22 }, duration: 1.2, ease: 'power2.out', repeat: 1, repeatDelay: 0.3 }, `s8+=${0.9 + p.delay}`);
    });
  }

  tl.from('#fv3-s8 .uptime-label, #fv3-s8 .uptime-num, #fv3-s8 .uptime-bar, #fv3-s8 .uptime-detail', { autoAlpha: 0, x: 20, stagger: 0.08, duration: 0.6, ease: 'expo.out' }, 's8+=0.7')
    .to('#fv3-s8 .uptime-bar-fill', { scaleX: 0.99999, duration: 1.4, ease: 'power3.out' }, 's8+=1.0');
  tl.add(hideScene('#fv3-s8'), '+=0.5');

  tl.addLabel('s9', '-=0.2')
    .add(showScene('#fv3-s9'), 's9')
    .to('#fv3-s9 .fv3-kicker', { autoAlpha: 1, y: 0, duration: 0.6, ease: 'expo.out' }, 's9+=0.1')
    .to('#fv3-s9 .fv3-title', { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' }, 's9+=0.15')
    .from('#fv3-s9 .fv3-code-panel', { autoAlpha: 0, y: 30, scale: 0.97, duration: 0.7, ease: 'expo.out' }, 's9+=0.3')
    .fromTo('#fv3-s9 .fv3-code-body', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 1.6, ease: 'steps(40)' }, 's9+=0.5')
    .from('#fv3-s9 .fv3-latency', { autoAlpha: 0, x: 30, duration: 0.7, ease: 'expo.out' }, 's9+=0.4')
    .to('#fv3-s9 .lat-bar', { scaleY: 1, duration: 0.3, stagger: 0.025, ease: 'back.out(1.4)' }, 's9+=0.7')
    .to({ v: 0 }, {
      v: 38,
      duration: 1.4,
      ease: 'power3.out',
      onUpdate: function onUpdate() {
        const el = document.getElementById('fv3-lat');
        if (el) el.textContent = Math.floor(this.targets()[0].v);
      }
    }, 's9+=0.7');
  tl.add(hideScene('#fv3-s9'), '+=0.6');

  tl.addLabel('s10', '-=0.2')
    .add(showScene('#fv3-s10'), 's10')
    .to('#fv3-s10 .fv3-kicker', { autoAlpha: 1, y: 0, duration: 0.6, ease: 'expo.out' }, 's10+=0.1')
    .to('#fv3-s10 .fv3-title', { autoAlpha: 1, y: 0, scale: 1.04, duration: 1.0, ease: 'expo.out' }, 's10+=0.2')
    .to('#fv3-s10 .fv3-title', { scale: 1, duration: 2.4, ease: 'power2.out' }, 's10+=1.3')
    .from('#fv3-s10 .stat-card', { autoAlpha: 0, y: 30, stagger: 0.1, duration: 0.7, ease: 'expo.out' }, 's10+=0.5');

  const stat1 = { v: 0 };
  const stat2 = { v: 0 };
  const stat3 = { v: 0 };
  const stat4 = { v: 0 };
  tl.to(stat1, { v: 135, duration: 1.4, ease: 'power3.out', onUpdate: () => { const el = document.getElementById('fv3-st1'); if (el) el.textContent = Math.floor(stat1.v); } }, 's10+=0.7')
    .to(stat2, { v: 1.9, duration: 1.4, ease: 'power3.out', onUpdate: () => { const el = document.getElementById('fv3-st2'); if (el) el.textContent = stat2.v.toFixed(1); } }, 's10+=0.8')
    .to(stat3, { v: 200, duration: 1.4, ease: 'power3.out', onUpdate: () => { const el = document.getElementById('fv3-st3'); if (el) el.textContent = Math.floor(stat3.v); } }, 's10+=0.9')
    .to(stat4, { v: 50, duration: 1.4, ease: 'power3.out', onUpdate: () => { const el = document.getElementById('fv3-st4'); if (el) el.textContent = Math.floor(stat4.v); } }, 's10+=1.0');

  document.querySelectorAll('#fv3-s10 .stat-card').forEach((c, i) => {
    tl.call(() => c.classList.add('show'), null, `s10+=${0.7 + i * 0.1}`);
  });
  tl.to({}, { duration: 1.5 });

  const targetDuration = Number(data.duration || 45);
  if (Number.isFinite(targetDuration) && targetDuration > 0) {
    const baseDuration = tl.duration();
    if (baseDuration > 0) tl.timeScale(baseDuration / targetDuration);
  }

  return tl;
}
