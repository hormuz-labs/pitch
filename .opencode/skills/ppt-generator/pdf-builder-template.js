const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Helper to convert local file to Base64 data URI to ensure images are permanently embedded in the PDF
function getBase64Image(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        const ext = path.extname(filePath).replace('.', '');
        const data = fs.readFileSync(filePath).toString('base64');
        return `data:image/${ext};base64,${data}`;
    }
    return filePath; // Fallback to original URL if not a local file
}

/**
 * CHART RENDERER — 17 chart types via Chart.js
 * Returns an HTML string containing <canvas> + inline <script> for Chart.js.
 */
let _chartSeq = 0;
function renderChart(slide, themeObj) {
    const cid = `chart_${++_chartSeq}`;
    const type = (slide.chartType || 'column').toLowerCase();
    const raw = slide.chartData || { labels: [], datasets: [] };
    const labels = raw.labels || [];
    const rawDS = raw.datasets || [];

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
            optStr = `${baseOpts},plugins:{legend:{position:'right',labels:{color:'${textC}',font:{family:'Inter',size:13},padding:20,boxWidth:16}},${tip}}`;
            break;
        }

        case 'donut': {
            cjsType = 'doughnut';
            const sd = rawDS[0]?.data||[];
            dsArr = [JSON.stringify({data:sd,backgroundColor:sd.map((_,i)=>BG[i%BG.length]),borderColor:sd.map((_,i)=>BD[i%BD.length]),borderWidth:2})];
            optStr = `cutout:'65%',${baseOpts},plugins:{legend:{position:'right',labels:{color:'${textC}',font:{family:'Inter',size:13},padding:20,boxWidth:16}},${tip}}`;
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

/**
 * CONFIGURATION ENGINE

 * Update these tokens based on the chosen theme and generated slides.
 */
const CONFIG = {
    jobId: '',                          // ← Agent fills this
    title: 'PRESENTATION TITLE',       // ← Agent fills this
    subtitle: 'Subtitle goes here',     // ← Agent fills this
    presenter: 'Presenter Name',        // ← Agent fills this
    date: 'Month Year',                 // ← Agent fills this
    theme: {
        primary:     null,  // ← Agent fills: e.g. '#3B82F6'
        secondary:   null,  // ← Agent fills: e.g. '#93C5FD'
        bg:          null,  // ← Agent fills: e.g. '#0B0F19'
        accent:      null,  // ← Agent fills: e.g. '#FFFFFF'
        fontDisplay: null,  // ← Agent fills: e.g. "'Outfit', sans-serif"
        fontBody:    null,  // ← Agent fills: e.g. "'Inter', sans-serif"
    },
    slides: [
        /* Example slide structure:
        {
            layout: 'COVER',
            title: 'TITLE',
            subtitle: 'SUBTITLE',
            image: 'https://images.unsplash.com/...' 
        },
        {
            layout: 'SPLIT-R',
            title: 'SLIDE TITLE',
            bullets: ['Point 1', 'Point 2'],
            image: 'local/path/to/image.jpg'
        }
        */
    ]
};

/**
 * HTML TEMPLATE GENERATOR
 */
function generateHTML(config) {
    const { theme, slides } = config;

    /* ── Dynamic Google Fonts Resolution ── */
    function getGoogleFontFamily(fontString) {
        if (!fontString) return null;
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
    }

    const fontDisplayFam = getGoogleFontFamily(theme.fontDisplay) || 'Montserrat';
    const fontBodyFam = getGoogleFontFamily(theme.fontBody) || 'Inter';
    const fontImportUrl = `https://fonts.googleapis.com/css2?family=${fontDisplayFam.replace(/\s+/g, '+')}:wght@700;800&family=${fontBodyFam.replace(/\s+/g, '+')}:wght@400;700&display=swap`;

    /* ── Luminance-based dark/light detection — works for ANY hex color ── */
    function hexLuma(hex) {
        const h = (hex || '#000000').replace('#', '');
        const pad = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
        const r = parseInt(pad.substr(0, 2), 16) || 0;
        const g = parseInt(pad.substr(2, 2), 16) || 0;
        const b = parseInt(pad.substr(4, 2), 16) || 0;
        return (r * 299 + g * 587 + b * 114) / 1000; // 0 (black) – 255 (white)
    }
    const isLightBg  = hexLuma(theme.bg) > 128;
    const textColor  = isLightBg ? '#1a1a1a' : '#ffffff';
    const overlayVal = isLightBg ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.7)';
    
    let slidesHTML = slides.map(slide => {
        if (slide.layout === 'COVER') {
            return `
            <div class="slide cover">
                <div class="cover-overlay" style="background: transparent;"></div>
                ${slide.image ? `<img class="bg-img" src="${slide.image}">` : ''}
                <div class="content flex-center">
                    <h1 class="main-title">${slide.title}</h1>
                    <div class="subtitle">${slide.subtitle}</div>
                    <div class="footer">${config.presenter} | ${config.date}</div>
                </div>
            </div>`;
        }

        if (slide.layout === 'SPLIT-R' || slide.layout === 'SPLIT-L') {
            const isLeft = slide.layout === 'SPLIT-L';
            return `
            <div class="slide">
                <div class="content">
                    <h1>${slide.title}</h1>
                    <div class="split ${isLeft ? 'rev' : ''}">
                        <div class="split-text">
                            <ul>
                                ${slide.bullets.map(b => `<li>${b}</li>`).join('')}
                            </ul>
                        </div>
                        <div class="split-img">
                            ${slide.image ? `<img src="${slide.image}">` : '<div class="placeholder"></div>'}
                        </div>
                    </div>
                </div>
            </div>`;
        }

        if (slide.layout === 'STAT') {
            return `
            <div class="slide">
                <div class="content stat-content">
                    <h1>${slide.title}</h1>
                    <div class="stat-grid">
                        ${(slide.stats || []).map(s => `
                        <div class="stat-card">
                            <div class="stat-num">${s.value}</div>
                            <div class="stat-label">${s.label}</div>
                            ${s.description ? `<div class="stat-desc">${s.description}</div>` : ''}
                        </div>`).join('')}
                    </div>
                </div>
            </div>`;
        }
        
        if (slide.layout === 'SPLIT-INFO') {
            const cards = (slide.cards || []).slice(0, 3);
            return `
            <div class="slide">
                <div class="content si-content">
                    <div class="si-top">
                        <div class="si-left">
                            ${slide.category ? `<div class="si-badge">${slide.category}</div>` : ''}
                            <h1 class="si-title">${slide.title}</h1>
                            ${slide.body ? `<p class="si-body">${slide.body}</p>` : ''}
                        </div>
                        <div class="si-right">
                            ${slide.image ? `<img src="${slide.image}" alt="">` : '<div class="si-img-placeholder"></div>'}
                        </div>
                    </div>
                    ${cards.length > 0 ? `
                    <div class="si-cards">
                        ${cards.map(c => `
                        <div class="si-card">
                            <div class="si-card-heading">${c.heading}</div>
                            <div class="si-card-body">${c.text}</div>
                        </div>`).join('')}
                    </div>` : ''}
                </div>
            </div>`;
        }
        
        if (slide.layout === 'CHART-FULL') {
            const chartHTML = renderChart(slide, theme);
            return `
            <div class="slide">
                <div class="content" style="display:flex;flex-direction:column;padding:60px 72px;">
                    <h1 style="margin-bottom:16px;">${slide.title}</h1>
                    <div style="flex:1;min-height:0;position:relative;">
                        ${chartHTML}
                    </div>
                    ${slide.source ? `<div class="chart-source">${slide.source}</div>` : ''}
                </div>
            </div>`;
        }

        if (slide.layout === 'SPLIT-CHART') {
            const chartHTML = renderChart(slide, theme);
            return `
            <div class="slide">
                <div class="content" style="display:flex;flex-direction:column;padding:60px 72px;">
                    <h1 style="margin-bottom:20px;">${slide.title}</h1>
                    <div style="display:flex;gap:48px;flex:1;min-height:0;">
                        <div style="width:40%;display:flex;flex-direction:column;gap:16px;justify-content:center;">
                            <ul>
                                ${(slide.bullets || []).map(b => `<li>${b}</li>`).join('')}
                            </ul>
                        </div>
                        <div style="flex:1;min-height:0;position:relative;">
                            ${chartHTML}
                        </div>
                    </div>
                    ${slide.source ? `<div class="chart-source">${slide.source}</div>` : ''}
                </div>
            </div>`;
        }

        // Add other layout handlers here (AGENDA, QUOTE, etc.)
        return `<div class="slide"><div class="content"><h1>${slide.title}</h1><p>Layout ${slide.layout} not implemented</p></div></div>`;
    }).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
        <style>
            @import url('${fontImportUrl}');
            :root {
                --bg: ${theme.bg};
                --primary: ${theme.primary};
                --secondary: ${theme.secondary};
                --accent: ${theme.accent};
                --text: ${textColor};
                --overlay: ${overlayVal};
                --font-display: '${fontDisplayFam}', sans-serif;
                --font-body: '${fontBodyFam}', sans-serif;
            }
            body { margin: 0; padding: 0; background: var(--bg); color: var(--secondary); font-family: var(--font-body); }
            .slide {
                width: 1280px; height: 720px; position: relative; overflow: hidden;
                background: var(--bg); page-break-after: always;
            }
            .content { padding: 80px; height: 100%; box-sizing: border-box; z-index: 10; position: relative; }
            .flex-center { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
            h1 { font-family: var(--font-display); font-size: 48px; color: var(--accent); border-left: 12px solid var(--primary); padding-left: 24px; margin-bottom: 50px; text-transform: uppercase; letter-spacing: 1px; }
            .main-title { font-family: var(--font-display); font-size: 90px; margin: 0; color: var(--accent); border: none; padding: 0; text-transform: uppercase; letter-spacing: 3px; line-height: 1.1; }
            .subtitle { font-size: 32px; color: var(--secondary); margin-top: 24px; font-weight: 400; letter-spacing: 1px; font-family: var(--font-body); }
            .bg-img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; }
            .cover-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; background: transparent; }
            .split { display: flex; gap: 60px; height: 420px; align-items: center; }
            .split.rev { flex-direction: row-reverse; }
            .split-text { flex: 1.2; }
            .split-img { flex: 1; border-radius: 30px; overflow: hidden; background: transparent; border: 1px solid rgba(255,255,255,0.1); }
            .split-img img { width: 100%; height: 100%; object-fit: cover; }
            ul { list-style: none; padding: 0; }
            li { font-size: 24px; line-height: 1.5; margin-bottom: 20px; padding-left: 45px; position: relative; font-family: var(--font-body); }
            li::before { content: "•"; position: absolute; left: 0; color: var(--primary); font-weight: bold; font-size: 40px; top: -8px; }
            /* ── STAT layout ── */
            .stat-content { padding: 60px 72px; display: flex; flex-direction: column; gap: 24px; height: 100%; box-sizing: border-box; }
            .stat-content h1 { margin-bottom: 0; flex-shrink: 0; }
            .stat-grid { display: flex; gap: 28px; flex: 1; align-items: stretch; min-height: 0; }
            .stat-card {
                flex: 1; padding: 32px 28px; border-radius: 12px;
                border-top: 4px solid var(--primary);
                border-right: 1px solid var(--primary); border-bottom: 1px solid var(--primary); border-left: 1px solid var(--primary);
                background: rgba(128,128,128,0.06);
                display: flex; flex-direction: column; gap: 10px;
            }
            .stat-num {
                font-family: var(--font-display); font-size: 72px; font-weight: 800;
                color: var(--primary); line-height: 1; letter-spacing: -2px;
            }
            .stat-label {
                font-size: 17px; font-weight: 700; color: var(--accent);
                text-transform: uppercase; letter-spacing: 1.5px;
                font-family: var(--font-display);
            }
            .stat-desc {
                font-size: 14px; line-height: 1.55; color: var(--secondary);
                margin-top: auto; font-family: var(--font-body);
            }
            .footer { position: absolute; bottom: 50px; width: 100%; text-align: center; font-size: 18px; color: var(--secondary); opacity: 0.6; font-weight: 700; letter-spacing: 2px; font-family: var(--font-body); }
            /* ── SPLIT-INFO layout (layout geometry only — all colors from theme vars) ── */
            .si-content { padding: 60px 72px; display: flex; flex-direction: column; gap: 0; }
            .si-top { display: flex; align-items: center; gap: 48px; flex: 1; }
            .si-left { width: 38%; display: flex; flex-direction: column; gap: 16px; }
            .si-right { width: 55%; height: 380px; border-radius: 16px; overflow: hidden; flex-shrink: 0; }
            .si-right img { width: 100%; height: 100%; object-fit: cover; }
            .si-img-placeholder { width: 100%; height: 100%; background: var(--primary); opacity: 0.3; }
            .si-badge { display: inline-block; padding: 6px 14px; border-radius: 6px;
                        border: 1px solid var(--primary); color: var(--primary);
                        font-size: 13px; font-weight: 700; text-transform: uppercase;
                        letter-spacing: 0.08em; width: fit-content; font-family: var(--font-body); }
            .si-title { font-family: var(--font-display); font-size: 46px; font-weight: 800;
                        line-height: 1.15; margin: 0; color: var(--accent);
                        border: none; padding: 0; text-transform: none; letter-spacing: -0.5px; }
            .si-body { font-size: 18px; line-height: 1.7; margin: 0; color: var(--secondary); font-family: var(--font-body); }
            .si-cards { display: flex; gap: 24px; margin-top: 20px; }
            .si-card { flex: 1; padding: 20px 24px; border-radius: 8px;
                       border: 1px solid var(--primary); border-left: 5px solid var(--primary);
                       background: transparent; }
            .si-card-heading { font-size: 18px; font-weight: 700; color: var(--accent); margin-bottom: 8px; font-family: var(--font-display); }
            .si-card-body { font-size: 15px; line-height: 1.6; color: var(--secondary); font-family: var(--font-body); }
            /* ── Chart slide styles ── */
            .chart-source { font-size: 12px; color: var(--secondary); opacity: 0.65; text-align: right; margin-top: 8px; letter-spacing: 0.03em; font-style: italic; font-family: var(--font-body); }
        </style>
    </head>
    <body>
        ${slidesHTML}
    </body>
    </html>`;
}

/**
 * PDF & QA RENDERER
 */
async function build() {
    const html = generateHTML(CONFIG);
    fs.writeFileSync('output.html', html, 'utf8');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.setContent(html);
    
    // Wait for images to load
    await page.waitForTimeout(6000); // Extra time for Chart.js CDN + chart rendering

    // --- VISUAL QA LOOP: Screenshot each slide ---
    const qaDir = './qa-renders';
    if (!fs.existsSync(qaDir)) fs.mkdirSync(qaDir);
    
    const slides = await page.$$('.slide');
    console.log(`Starting Visual QA for ${slides.length} slides...`);
    
    for (let i = 0; i < slides.length; i++) {
        const slidePath = path.join(qaDir, `slide_${i + 1}.png`);
        await slides[i].screenshot({ path: slidePath });
        console.log(`  [QA] Slide ${i + 1} rendered to ${slidePath}`);
    }

    // --- FINAL PDF GENERATION ---
    const localPdfPath = 'output.pdf';
    await page.pdf({
        path: localPdfPath,
        width: '1280px',
        height: '720px',
        printBackground: true
    });
    
    // Helper to slugify the topic title
    const slugifyTopic = (text) => {
        return text.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40);
    };

    // Save copies inside the workspace pptx/ folder under separate unique folders
    const jobId = CONFIG.jobId || 'unknown';
    const folderName = `ppt-${jobId}`;
    const workspacePptxDir = path.join('/Users/mukundmadhav/pitch/pptx', folderName);
    
    if (fs.existsSync('/Users/mukundmadhav/pitch/pptx')) {
        if (!fs.existsSync(workspacePptxDir)) {
            fs.mkdirSync(workspacePptxDir, { recursive: true });
        }
        
        // Copy PDF
        const workspacePdfPath = path.join(workspacePptxDir, 'output.pdf');
        fs.copyFileSync(localPdfPath, workspacePdfPath);
        console.log(`[Workspace] Copy of PDF written to ${workspacePdfPath}`);
        
        // Copy HTML
        const localHtmlPath = 'output.html';
        if (fs.existsSync(localHtmlPath)) {
            const workspaceHtmlPath = path.join(workspacePptxDir, 'output.html');
            fs.copyFileSync(localHtmlPath, workspaceHtmlPath);
            console.log(`[Workspace] Copy of HTML written to ${workspaceHtmlPath}`);
        }
    }
    
    await browser.close();
    console.log('\nSUCCESS: PDF and QA Renders generated.');
}

build().catch(console.error);
