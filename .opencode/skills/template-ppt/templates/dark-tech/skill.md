# Dark Tech / Neon Glow Template Skill Reference

This document provides template-specific instructions, layout codes, and HTML/CSS renderers for the `DARK_TECH` theme.

---

## 🎨 Design Theme Specification

- **Palette**: Slate-900 `#0F172A`, Slate-800 card `#1E293B`, neon cyan `#06B6D4`, neon green `#10B981`, and secondary text slate `#94A3B8`.
- **Borders**: Sharp `2px solid #334155` with tech glows (`box-shadow: 0 0 15px rgba(6, 182, 212, 0.15)`).
- **Typography**: Industrial-grade monospaced text (`"Share Tech Mono"`, `"JetBrains Mono"`) for cyberpunk terminal aesthetic.
- **Images**: Treated with high contrast blue/cyan tint filter: `grayscale(100%) brightness(0.8) contrast(1.5) sepia(10%) hue-rotate(150deg);`.

---

## 📐 Layout Pools & Renderers

### Chart helper
```js
let _chartSeq = 0;
function renderChart(slide) {
    const cid = `chart_${++_chartSeq}`;
    const type = (slide.chartType || 'column').toLowerCase();
    const raw = slide.chartData || { labels: [], datasets: [] };
    const labels = raw.labels || [];
    const rawDS = raw.datasets || [];

    const themeObj = {
        bg: '#0F172A',
        primary: '#06B6D4',
        secondary: '#94A3B8',
        accent: '#10B981',
        border: '#334155',
        fontBody: '"JetBrains Mono", monospace'
    };

    /* ── Palette from theme ── */
    function h2rgba(hex, a) {
        const h = (hex || '#888').replace('#', '');
        const pd = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
        return `rgba(${parseInt(pd.substr(0,2),16)||128},${parseInt(pd.substr(2,2),16)||128},${parseInt(pd.substr(4,2),16)||128},${a})`;
    }
    const BG = [
        h2rgba(themeObj.primary,0.90), h2rgba(themeObj.secondary,0.85),
        h2rgba(themeObj.accent,0.80),  h2rgba(themeObj.primary,0.60),
        h2rgba(themeObj.secondary,0.60), h2rgba(themeObj.accent,0.55),
        h2rgba(themeObj.primary,0.40),  h2rgba(themeObj.secondary,0.40),
    ];
    const BD = [
        themeObj.primary, themeObj.secondary, themeObj.accent,
        themeObj.primary, themeObj.secondary, themeObj.accent,
        themeObj.primary, themeObj.secondary,
    ];
    const isDark = !((function(hex){
        const h=(hex||'#000').replace('#','');
        const pd=h.length===3?h.split('').map(x=>x+x).join(''):h;
        return (parseInt(pd.substr(0,2),16)*299+parseInt(pd.substr(2,2),16)*587+parseInt(pd.substr(4,2),16)*114)/1000;
    })(themeObj.bg) > 128);
    const textC = isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.80)';
    const gridC = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
    const tipBg = isDark ? 'rgba(10,10,20,0.92)'   : 'rgba(255,255,255,0.97)';

    const fontBodyClean = (function(fontString) {
        if (!fontString) return 'Inter';
        const clean = fontString.split(',')[0].replace(/['"]/g, '').trim();
        const fallbacks = {
            'cursorgothic': 'Outfit',
            'linear display': 'Outfit',
            'ferrarisans': 'Barlow',
            'geist': 'Inter',
            'circular': 'Inter',
            'coinbase display': 'Inter',
            'sf pro display': 'Inter',
            'sf pro text': 'Inter',
            'sst': 'Inter',
            'optimistic': 'Inter',
            'gt walsheim': 'Manrope',
            'super sans vf': 'Manrope',
            'abcdiatype': 'Manrope',
            'ibm plex sans': 'IBM Plex Sans',
            'd-din': 'Bebas Neue',
            'd-din-bold': 'Bebas Neue',
            'bugatti display': 'Playfair Display',
            'sohne-var': 'Plus Jakarta Sans',
            'salesforce-avant-garde': 'Plus Jakarta Sans',
            'sodosans': 'Inter',
            'lander grande': 'Playfair Display'
        };
        const lowerClean = clean.toLowerCase();
        for (const [key, val] of Object.entries(fallbacks)) {
            if (lowerClean.includes(key)) return val;
        }
        return clean;
    })(themeObj.fontBody);

    const tk  = `color:'${textC}',font:{family:'${fontBodyClean}',size:12}`;
    const tip = `tooltip:{backgroundColor:'${tipBg}',titleColor:'${textC}',bodyColor:'${textC}',borderColor:'${themeObj.primary}',borderWidth:1,padding:10}`;
    const leg = `legend:{labels:{color:'${textC}',font:{family:'${fontBodyClean}',size:13},padding:16}}`;
    const plug = `plugins:{${leg},${tip}}`;
    const cX = (s=false) => `x:{stacked:${s},ticks:{${tk}},grid:{color:'${gridC}'}}`;
    const cY = (s=false) => `y:{stacked:${s},ticks:{${tk}},grid:{color:'${gridC}'}}`;
    const baseOpts = `responsive:true,maintainAspectRatio:false,animation:{duration:0}`;
    const mkDs = (d,i,extra='') => JSON.stringify(Object.assign({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:1.5,borderRadius:4}, extra ? JSON.parse('{'+extra+'}') : {}));

    /* ── Build per-type config ── */
    let cjsType = 'bar', dsArr = [], optStr = '';

    switch (type) {

        case 'column':
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:1.5,borderRadius:4}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'column-stacked':
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:1.5,borderRadius:2}));
            optStr = `${baseOpts},${plug},scales:{${cX(true)},${cY(true)}}`;
            break;

        case 'column-100': {
            const tots = labels.map((_,ci)=>rawDS.reduce((s,d)=>s+(d.data[ci]||0),0));
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:(d.data||[]).map((v,ci)=>tots[ci]?+(v/tots[ci]*100).toFixed(1):0),backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:1.5,borderRadius:2}));
            optStr = `${baseOpts},${plug},scales:{${cX(true)},y:{stacked:true,max:100,ticks:{${tk},callback:function(v){return v+'%';}},grid:{color:'${gridC}'}}}`;
            break;
        }

        case 'bar':
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:1.5,borderRadius:4}));
            optStr = `indexAxis:'y',${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'bar-stacked':
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:1.5,borderRadius:2}));
            optStr = `indexAxis:'y',${baseOpts},${plug},scales:{${cX(true)},${cY(true)}}`;
            break;

        case 'line':
            cjsType = 'line';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:'transparent',borderColor:BD[i%BD.length],borderWidth:2.5,fill:false,tension:0.4,pointRadius:4,pointHoverRadius:7}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'area':
            cjsType = 'line';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:2.5,fill:true,tension:0.4,pointRadius:3,pointHoverRadius:6}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'area-stacked':
            cjsType = 'line';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:2,fill:true,tension:0.4,pointRadius:3}));
            optStr = `${baseOpts},${plug},scales:{${cX()},y:{stacked:true,ticks:{${tk}},grid:{color:'${gridC}'}}}`;
            break;

        case 'pie': {
            cjsType = 'pie';
            const sd = rawDS[0]?.data||[];
            dsArr = [JSON.stringify({data:sd,backgroundColor:sd.map((_,i)=>BG[i%BG.length]),borderColor:sd.map((_,i)=>BD[i%BD.length]),borderWidth:2})];
            optStr = `${baseOpts},plugins:{legend:{position:'right',labels:{color:'${textC}',font:{family:'${fontBodyClean}',size:13},padding:20,boxWidth:16}},${tip}}`;
            break;
        }

        case 'donut': {
            cjsType = 'doughnut';
            const sd = rawDS[0]?.data||[];
            dsArr = [JSON.stringify({data:sd,backgroundColor:sd.map((_,i)=>BG[i%BG.length]),borderColor:sd.map((_,i)=>BD[i%BD.length]),borderWidth:2})];
            optStr = `cutout:'65%',${baseOpts},plugins:{legend:{position:'right',labels:{color:'${textC}',font:{family:'${fontBodyClean}',size:13},padding:20,boxWidth:16}},${tip}}`;
            break;
        }

        case 'scatter':
            cjsType = 'scatter';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],pointRadius:6,pointHoverRadius:9}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'bubble':
            cjsType = 'bubble';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:1.5}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        case 'radar':
            cjsType = 'radar';
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:2,pointRadius:4,pointHoverRadius:7}));
            optStr = `${baseOpts},${plug},scales:{r:{ticks:{${tk},backdropColor:'transparent'},grid:{color:'${gridC}'},angleLines:{color:'${gridC}'},pointLabels:{color:'${textC}',font:{family:'${fontBodyClean}',size:13}}}}`;
            break;

        case 'polar': {
            cjsType = 'polarArea';
            const sd = rawDS[0]?.data||[];
            dsArr = [JSON.stringify({data:sd,backgroundColor:sd.map((_,i)=>BG[i%BG.length]),borderWidth:1.5})];
            optStr = `${baseOpts},plugins:{legend:{position:'right',labels:{color:'${textC}',font:{family:'${fontBodyClean}',size:13},padding:16}},${tip}},scales:{r:{ticks:{${tk},backdropColor:'transparent'},grid:{color:'${gridC}'}}}`;
            break;
        }

        case 'funnel': {
            const d0 = rawDS[0]||{data:[],label:'Value'};
            const pairs = labels.map((l,i)=>({l,v:d0.data[i]||0})).sort((a,b)=>b.v-a.v);
            const top = pairs[0]?.v||1;
            const fDS = JSON.stringify({label:d0.label||'Value',data:pairs.map(p=>p.v),backgroundColor:pairs.map((_,i)=>BG[Math.min(i,BG.length-1)]),borderColor:pairs.map((_,i)=>BD[Math.min(i,BD.length-1)]),borderWidth:1.5,borderRadius:4});
            return `<div style="position:relative;width:100%;height:100%;"><canvas id="${cid}"></canvas></div><script>(function(){var ctx=document.getElementById('${cid}');new Chart(ctx,{type:'bar',data:{labels:${JSON.stringify(pairs.map(p=>p.l))},datasets:[${fDS}]},options:{indexAxis:'y',${baseOpts},plugins:{legend:{display:false},tooltip:{backgroundColor:'${tipBg}',titleColor:'${textC}',bodyColor:'${textC}',borderColor:'${themeObj.primary}',borderWidth:1,callbacks:{label:function(c){return c.parsed.x+' ('+Math.round(c.parsed.x/${top}*100)+'%)';}}}},scales:{x:{ticks:{${tk}},grid:{color:'${gridC}'}},y:{ticks:{${tk}},grid:{display:false}}}}});})();<\/script>`;
        }

        case 'waterfall': {
            const d0 = rawDS[0]||{data:[],label:'Value'};
            const chgs = d0.data||[];
            let cum = 0;
            const floats = chgs.map(v=>{const s=cum;cum+=v;return [s,cum];});
            const wfDS = JSON.stringify({label:d0.label||'Value',data:floats,backgroundColor:chgs.map(v=>v>=0?BG[0]:BG[1]),borderColor:chgs.map(v=>v>=0?BD[0]:BD[1]),borderWidth:1.5,borderRadius:3});
            return `<div style="position:relative;width:100%;height:100%;"><canvas id="${cid}"></canvas></div><script>(function(){var ctx=document.getElementById('${cid}');new Chart(ctx,{type:'bar',data:{labels:${JSON.stringify(labels)},datasets:[${wfDS}]},options:{${baseOpts},plugins:{legend:{display:false},tooltip:{backgroundColor:'${tipBg}',titleColor:'${textC}',bodyColor:'${textC}',borderColor:'${themeObj.primary}',borderWidth:1}},scales:{x:{ticks:{${tk}},grid:{color:'${gridC}'}},y:{ticks:{${tk}},grid:{color:'${gridC}'}}}}});})();<\/script>`;
        }

        case 'combo':
            cjsType = 'bar';
            dsArr = rawDS.map((d,i)=>JSON.stringify({type:i===0?'bar':'line',label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:i===0?BG[0]:'transparent',borderColor:BD[i%BD.length],borderWidth:i===0?1.5:2.5,tension:0.4,pointRadius:i===0?0:5,fill:false,borderRadius:i===0?4:0,order:i===0?2:1}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
            break;

        default:
            dsArr = rawDS.map((d,i)=>JSON.stringify({label:d.label||`Series ${i+1}`,data:d.data||[],backgroundColor:BG[i%BG.length],borderColor:BD[i%BD.length],borderWidth:1.5,borderRadius:4}));
            optStr = `${baseOpts},${plug},scales:{${cX()},${cY()}}`;
    }

    return `<div style="position:relative;width:100%;height:100%;"><canvas id="${cid}"></canvas></div><script>(function(){var ctx=document.getElementById('${cid}');new Chart(ctx,{type:'${cjsType}',data:{labels:${JSON.stringify(labels)},datasets:[${dsArr.join(',')}]},options:{${optStr}}});})();<\/script>`;
}
```

### 1. `TECH-COVER` (Cyber Cover)
```js
if (slide.layout === 'TECH-COVER') {
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content flex-center">
            <div class="terminal-header">[ SYSTEM INTAKE ACTIVE ]</div>
            <h1 class="tech-cover-title">${slide.title}</h1>
            <div class="tech-cover-subtitle">> ${slide.subtitle || ''}</div>
            <div class="tech-cover-footer">HOST: ${config.presenter} // TIMESTAMP: ${config.date}</div>
        </div>
    </div>`;
}
```

### 2. `DASHBOARD-GLANCE` (Overview Dashboard)
```js
if (slide.layout === 'DASHBOARD-GLANCE') {
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content">
            <div class="tech-badge">SYS.OVERVIEW</div>
            <h2 class="tech-title">// ${slide.title}</h2>
            <div class="tech-dashboard-grid">
                <div class="tech-dash-left">
                    ${slide.image ? `<img class="tech-dash-img" src="${slide.image}">` : '<div class="tech-img-placeholder"></div>'}
                </div>
                <div class="tech-dash-right">
                    <div class="terminal-box">
                        <div class="terminal-bar"><span class="term-dot"></span><span class="term-dot"></span><span class="term-dot"></span></div>
                        <ul class="tech-list">
                            ${(slide.bullets || []).map(b => `<li><span class="tech-prompt">></span> ${b}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}
```

### 3. `METRIC-GLOW` (Glowing Metric Cards)
```js
if (slide.layout === 'METRIC-GLOW') {
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content">
            <div class="tech-badge">SYS.TELEMETRY</div>
            <h2 class="tech-title">// ${slide.title}</h2>
            <div class="tech-metrics-row">
                ${(slide.stats || []).map(s => `
                <div class="tech-metric-card">
                    <div class="tech-metric-glow-bar"></div>
                    <div class="tech-metric-num">${s.value}</div>
                    <div class="tech-metric-label">&lt; ${s.label} &gt;</div>
                    ${s.description ? `<div class="tech-metric-desc">${s.description}</div>` : ''}
                </div>`).join('')}
            </div>
        </div>
    </div>`;
}
```

### 4. `GLOW-PANEL` (Double Column Panel Layout)
```js
if (slide.layout === 'GLOW-PANEL') {
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content">
            <div class="tech-badge">SYS.MODULES</div>
            <h2 class="tech-title">// ${slide.title}</h2>
            <div class="tech-panels-split">
                <div class="tech-panel-card">
                    <div class="tech-panel-header">&lt; MODULE_01 // INTENT &gt;</div>
                    <p class="tech-panel-text">${slide.body || ''}</p>
                </div>
                <div class="tech-panel-card card-accent-glow">
                    <div class="tech-panel-header color-accent">&lt; MODULE_02 // PARAMS &gt;</div>
                    <ul class="tech-list">
                        ${(slide.bullets || []).map(b => `<li><span class="tech-prompt">></span> ${b}</li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>
    </div>`;
}
```

### 5. `CODE-SPLIT` (Code Block / Detail split)
```js
if (slide.layout === 'CODE-SPLIT') {
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content">
            <div class="tech-badge">SYS.CODE_EXEC</div>
            <h2 class="tech-title">// ${slide.title}</h2>
            <div class="tech-code-split">
                <div class="code-terminal">
                    <div class="terminal-bar"><span class="term-dot"></span><span class="term-dot"></span><span class="term-dot"></span></div>
                    <pre><code>${slide.codeSnippet || '// Run script:\n$ npm run deploy\n> deploy: ok\n> status: listening :3000\n> memory: 42MB'}</code></pre>
                </div>
                <div class="code-explain">
                    <ul class="tech-list">
                        ${(slide.bullets || []).map(b => `<li><span class="tech-prompt">></span> ${b}</li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>
    </div>`;
}
```

### 6. `FLOW-STEPS` (Tech Pipeline / Workflow)
```js
if (slide.layout === 'FLOW-STEPS') {
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content">
            <div class="tech-badge">SYS.PIPELINE</div>
            <h2 class="tech-title">// ${slide.title}</h2>
            <div class="tech-pipeline-row">
                ${(slide.steps || []).map((step, idx) => `
                <div class="tech-pipeline-node">
                    <div class="node-index">#0${idx + 1}</div>
                    <div class="node-arrow-glow"></div>
                    <div class="node-heading">${step.heading || step.title}</div>
                    <div class="node-text">${step.text || step.description}</div>
                </div>`).join('')}
            </div>
        </div>
    </div>`;
}
```

### 7. `TECH-CHART` (Full-width chart)
```js
if (slide.layout === 'TECH-CHART') {
    const chartHTML = renderChart(slide);
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content">
            <div class="tech-badge">SYS.DATA_VIZ</div>
            <h2 class="tech-title">// ${slide.title}</h2>
            <div class="tech-chart-full">
                ${chartHTML}
            </div>
            ${slide.source ? `<div class="tech-chart-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 8. `TECH-SPLIT-CHART` (Context + chart)
```js
if (slide.layout === 'TECH-SPLIT-CHART') {
    const chartHTML = renderChart(slide);
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content">
            <div class="tech-badge">SYS.ANALYSIS</div>
            <h2 class="tech-title">// ${slide.title}</h2>
            <div class="tech-split-chart">
                <div class="tech-split-chart-text">
                    <ul class="tech-list">
                        ${(slide.bullets || []).map(b => `<li><span class="tech-prompt">></span> ${b}</li>`).join('')}
                    </ul>
                </div>
                <div class="tech-split-chart-viz">
                    ${chartHTML}
                </div>
            </div>
            ${slide.source ? `<div class="tech-chart-source">${slide.source}</div>` : ''}
        </div>
    </div>`;
}
```

### 9. `TECH-ICON-GRID` (2×3 icon grid)
```js
if (slide.layout === 'TECH-ICON-GRID') {
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content">
            ${slide.badge ? `<div class="tech-badge">${slide.badge}</div>` : '<div class="tech-badge">SYS.MODULES</div>'}
            <h2 class="tech-title">// ${slide.title}</h2>
            <div class="tech-icon-grid">
                ${(slide.items || []).map(item => `
                <div class="tech-icon-card">
                    <div class="tech-icon-symbol">${item.icon || '◆'}</div>
                    <div class="tech-icon-heading">${item.heading || item.title || ''}</div>
                    <div class="tech-icon-text">${item.text || item.description || ''}</div>
                </div>`).join('')}
            </div>
        </div>
    </div>`;
}
```

### 10. `TECH-COMPARE` (Side-by-side comparison)
```js
if (slide.layout === 'TECH-COMPARE') {
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content">
            <div class="tech-badge">SYS.COMPARE</div>
            <h2 class="tech-title">// ${slide.title}</h2>
            <div class="tech-compare-row">
                <div class="tech-compare-panel panel-primary">
                    <div class="tech-compare-header">&lt; ${slide.leftTitle || 'OPTION_A'} &gt;</div>
                    <ul class="tech-list">
                        ${(slide.leftBullets || []).map(b => `<li><span class="tech-prompt">></span> ${b}</li>`).join('')}
                    </ul>
                </div>
                <div class="tech-compare-panel panel-accent">
                    <div class="tech-compare-header color-accent">&lt; ${slide.rightTitle || 'OPTION_B'} &gt;</div>
                    <ul class="tech-list">
                        ${(slide.rightBullets || []).map(b => `<li><span class="tech-prompt">></span> ${b}</li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>
    </div>`;
}
```

### 11. `TECH-IMPACT` (Full-bleed image statement)
```js
if (slide.layout === 'TECH-IMPACT') {
    return `
    <div class="slide tech-glow bg-dark-slate tech-impact-slide">
        ${slide.image ? `<img class="tech-impact-bg" src="${slide.image}">` : ''}
        <div class="tech-impact-overlay"></div>
        <div class="tech-content flex-center">
            <div class="tech-impact-box">
                <div class="tech-impact-statement">“${slide.statement || slide.title || ''}”</div>
                ${slide.attribution ? `<div class="tech-impact-attribution">> ${slide.attribution}</div>` : ''}
            </div>
        </div>
    </div>`;
}
```

### 12. `TECH-CLOSING` (Terminal Shutdown CTA)
```js
if (slide.layout === 'TECH-CLOSING') {
    return `
    <div class="slide tech-glow bg-dark-slate">
        <div class="tech-grid-lines"></div>
        <div class="tech-content flex-center">
            <div class="closing-box">
                <h1 class="tech-closing-title">${slide.title}</h1>
                <p class="tech-closing-subtitle">> ${slide.subtitle || 'Connection closed.'}</p>
                <div class="closing-bracket">[ LOGOUT COMPLETE ]</div>
            </div>
        </div>
    </div>`;
}
```

---

## 🎨 Stylesheet Additions for Dark Tech

```css
/* Dark Tech Terminal Styles */
.tech-glow {
    font-family: var(--font-body);
    background-color: #0F172A;
    color: #94A3B8;
    position: relative;
    box-sizing: border-box;
}
.bg-dark-slate {
    background-color: #0F172A !important;
}
.tech-grid-lines {
    position: absolute;
    top: 0; left: 0; width: 100%; height: 100%;
    z-index: 1; pointer-events: none; opacity: 0.03;
    background-size: 30px 30px;
    background-image: linear-gradient(to right, #06B6D4 1px, transparent 1px),
                      linear-gradient(to bottom, #06B6D4 1px, transparent 1px);
}
.tech-content {
    padding: 60px 80px;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    z-index: 5; position: relative;
}
.terminal-header {
    font-family: var(--font-display);
    color: var(--primary);
    font-size: 14px; letter-spacing: 2px;
    margin-bottom: 20px;
}
.tech-cover-title {
    font-family: var(--font-display);
    font-size: 54px; font-weight: 700;
    color: #FFFFFF; line-height: 1.1;
    margin: 0; border: none; padding-left: 0;
    text-transform: uppercase; letter-spacing: -1px;
}
.tech-cover-subtitle {
    font-family: var(--font-body);
    font-size: 18px; color: var(--accent);
    margin-top: 20px;
}
.tech-cover-footer {
    position: absolute; bottom: 50px;
    font-size: 12px; color: #475569;
    font-family: var(--font-display);
    letter-spacing: 1px;
}
.tech-badge {
    align-self: flex-start;
    font-family: var(--font-display);
    font-size: 12px; font-weight: 700;
    letter-spacing: 2px; color: var(--primary);
    border: 1px dashed var(--primary);
    padding: 3px 8px; border-radius: 4px;
    margin-bottom: 16px;
}
.tech-title {
    font-family: var(--font-display);
    font-size: 30px; font-weight: 700;
    color: #FFFFFF; margin: 0 0 24px 0;
    border: none; padding-left: 0;
    text-transform: uppercase; letter-spacing: -0.5px;
}
.tech-dashboard-grid {
    display: flex; gap: 40px; height: 380px;
}
.tech-dash-left {
    flex: 1; border: 2px solid #334155; overflow: hidden; border-radius: 6px;
    box-shadow: 0 0 15px rgba(6, 182, 212, 0.1);
}
.tech-dash-img {
    width: 100%; height: 100%; object-fit: cover;
    filter: grayscale(100%) brightness(0.8) contrast(1.5) sepia(10%) hue-rotate(150deg);
}
.tech-img-placeholder {
    width: 100%; height: 100%; background: #1E293B;
}
.tech-dash-right {
    flex: 1.2; display: flex; flex-direction: column;
}
.terminal-box {
    background: #020617; border: 2px solid #334155; border-radius: 6px;
    flex: 1; padding: 20px; display: flex; flex-direction: column;
}
.terminal-bar {
    display: flex; gap: 6px; margin-bottom: 16px; border-bottom: 1px solid #1E293B;
    padding-bottom: 8px;
}
.term-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #334155;
}
.tech-list {
    list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 14px;
}
.tech-list li {
    font-family: var(--font-body); font-size: 15px; line-height: 1.5; color: #94A3B8;
    padding-left: 0 !important; margin-bottom: 0 !important;
}
.tech-list li::before {
    display: none !important;
}
.tech-prompt {
    color: var(--accent); font-weight: bold; margin-right: 8px;
}
.tech-metrics-row {
    display: flex; gap: 20px; height: 380px; align-items: center;
}
.tech-metric-card {
    flex: 1; background: #1E293B; border: 2px solid #334155;
    padding: 24px; border-radius: 6px; position: relative;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    display: flex; flex-direction: column; gap: 8px;
}
.tech-metric-glow-bar {
    position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: var(--primary); box-shadow: 0 0 10px var(--primary);
}
.tech-metric-num {
    font-family: var(--font-display); font-size: 44px;
    color: var(--primary); line-height: 1; text-shadow: 0 0 10px rgba(6, 182, 212, 0.3);
}
.tech-metric-label {
    font-family: var(--font-display); font-size: 13px; color: #FFFFFF;
}
.tech-metric-desc {
    font-size: 12px; line-height: 1.5; color: #64748B;
}
.tech-panels-split {
    display: flex; gap: 24px; height: 380px;
}
.tech-panel-card {
    flex: 1; background: #1E293B; border: 2px solid #334155;
    padding: 28px; border-radius: 6px;
}
.card-accent-glow {
    border-color: var(--accent) !important;
    box-shadow: 0 0 15px rgba(16, 185, 129, 0.1);
}
.tech-panel-header {
    font-family: var(--font-display); font-size: 15px;
    color: var(--primary); margin-bottom: 20px; border-bottom: 1px dashed #334155;
    padding-bottom: 10px;
}
.color-accent {
    color: var(--accent) !important;
}
.tech-panel-text {
    font-size: 14px; line-height: 1.6; color: #94A3B8; margin: 0;
}
.tech-code-split {
    display: flex; gap: 24px; height: 380px;
}
.code-terminal {
    flex: 1.2; background: #020617; border: 2px solid #334155; border-radius: 6px;
    padding: 20px; display: flex; flex-direction: column; overflow: hidden;
}
.code-terminal pre {
    margin: 0; flex: 1; overflow: auto;
}
.code-terminal code {
    font-family: var(--font-body); font-size: 13px; color: var(--accent); line-height: 1.5;
}
.code-explain {
    flex: 0.8; display: flex; align-items: center;
}
.tech-pipeline-row {
    display: flex; gap: 20px; height: 380px; padding-top: 40px;
}
.tech-pipeline-node {
    flex: 1; display: flex; flex-direction: column; gap: 12px; position: relative;
}
.node-index {
    font-family: var(--font-display); font-size: 13px; color: var(--accent);
}
.node-arrow-glow {
    height: 3px; background: #334155; margin-bottom: 12px; position: relative;
}
.tech-pipeline-node:not(:last-child) .node-arrow-glow::after {
    content: ""; position: absolute; right: -8px; top: -4px;
    border-top: 6px solid transparent; border-bottom: 6px solid transparent;
    border-left: 8px solid var(--accent);
}
.node-heading {
    font-family: var(--font-display); font-size: 15px; font-weight: bold; color: #FFFFFF;
}
.closing-box {
    text-align: center; border: 2px dashed var(--primary); padding: 50px 80px;
    background: #020617; border-radius: 6px;
    box-shadow: 0 0 20px rgba(6, 182, 212, 0.15);
}
.tech-closing-title {
    font-family: var(--font-display); font-size: 48px; color: #FFFFFF;
    margin: 0 0 16px 0 !important; border: none; padding-left: 0; text-transform: uppercase;
}
.tech-closing-subtitle {
    font-family: var(--font-body); font-size: 18px; color: var(--accent); margin: 0 0 30px 0;
}
.closing-bracket {
    font-family: var(--font-display); font-size: 13px; color: #475569;
}

/* ── TECH-CHART layouts ── */
.tech-chart-full {
    flex: 1; min-height: 0; position: relative; margin-top: 8px;
}
.tech-chart-source {
    font-family: var(--font-display); font-size: 10px; color: #94A3B8;
    text-align: right; margin-top: 10px; letter-spacing: 1px;
}

/* ── TECH-SPLIT-CHART layouts ── */
.tech-split-chart {
    display: flex; gap: 32px; flex: 1; min-height: 0;
}
.tech-split-chart-text {
    width: 40%; display: flex; flex-direction: column; justify-content: center;
}
.tech-split-chart-viz {
    flex: 1; min-height: 0; position: relative;
}

/* ── TECH-ICON-GRID layouts ── */
.tech-icon-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
    flex: 1; align-content: center;
}
.tech-icon-card {
    background: #1E293B; border: 2px solid #334155; border-radius: 4px;
    padding: 24px; display: flex; flex-direction: column; gap: 10px;
}
.tech-icon-symbol {
    font-size: 28px; color: var(--primary); line-height: 1;
}
.tech-icon-heading {
    font-family: var(--font-display); font-size: 15px; color: #FFFFFF;
}
.tech-icon-text {
    font-size: 12px; line-height: 1.5; color: #94A3B8;
}

/* ── TECH-COMPARE layouts ── */
.tech-compare-row {
    display: flex; gap: 24px; flex: 1; min-height: 0;
}
.tech-compare-panel {
    flex: 1; background: #1E293B; border: 2px solid #334155;
    border-radius: 4px; padding: 28px;
}
.tech-compare-panel.panel-primary {
    border-color: var(--primary);
    box-shadow: 0 0 15px rgba(6, 182, 212, 0.1);
}
.tech-compare-panel.panel-accent {
    border-color: var(--accent);
    box-shadow: 0 0 15px rgba(16, 185, 129, 0.1);
}
.tech-compare-header {
    font-family: var(--font-display); font-size: 15px;
    color: var(--primary); margin-bottom: 20px;
    border-bottom: 1px dashed #334155; padding-bottom: 10px;
}

/* ── TECH-IMPACT layouts ── */
.tech-impact-slide {
    position: relative; overflow: hidden;
}
.tech-impact-bg {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    object-fit: cover; z-index: 1;
    filter: grayscale(100%) brightness(0.8) contrast(1.5) sepia(10%) hue-rotate(150deg);
}
.tech-impact-overlay {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(15, 23, 42, 0.82); z-index: 2;
}
.tech-impact-box {
    position: relative; z-index: 5; text-align: center;
    max-width: 900px; padding: 50px;
    border: 2px solid var(--primary); border-radius: 4px;
    background: rgba(15, 23, 42, 0.70);
    box-shadow: 0 0 25px rgba(6, 182, 212, 0.2);
}
.tech-impact-statement {
    font-family: var(--font-display); font-size: 36px; color: #FFFFFF;
    line-height: 1.3; margin: 0 0 20px 0;
}
.tech-impact-attribution {
    font-family: var(--font-body); font-size: 14px; color: var(--accent);
}
```
