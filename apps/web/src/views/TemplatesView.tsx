import { useAuth } from '@clerk/react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../App'
import { CreditChip } from '../components/CreditChip'
import { createProject } from '../lib/studio-api'
import { describeStudioError } from '../lib/studio-errors'

const IconPlay = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
)

const IconLoader = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="animate-spin"
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
)

const IconChevronDown = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const IconChevronUp = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="18 15 12 9 6 15" />
  </svg>
)

type SlideData = {
  layout: string
  title?: string
  subtitle?: string
  body?: string
  bullets?: string[]
  stats?: Array<{ value: string; label: string; description?: string }>
  items?: Array<{ icon?: string; heading: string; text: string }>
  chartType?: string
  chartData?: { labels: string[]; datasets: Array<{ label: string; data: number[] }> }
  source?: string
  badge?: string
  quote?: string
  author?: string
  image?: string
  leftTitle?: string
  leftBullets?: string[]
  rightTitle?: string
  rightBullets?: string[]
  statement?: string
  attribution?: string
  codeSnippet?: string
  steps?: Array<{
    year?: string
    date?: string
    title?: string
    heading?: string
    description?: string
    text?: string
  }>
  col1Title?: string
  col1Bullets?: string[]
  col2Title?: string
  col2Bullets?: string[]
  columns?: Array<{ heading: string; body: string }>
  // Tech Duel fields
  sections?: Array<{ number?: string; title: string; description?: string; page?: string }>
  specs?: Array<{ label: string; value: string }>
  price?: string
  priceNote?: string
  differentiator?: string
  productName?: string
  whatItIs?: string
  whatItIsnt?: string
  tagline?: string
  leftWins?: Array<string | { text: string }>
  rightWins?: Array<string | { text: string }>
  // Startup Amplify fields
  cards?: Array<{ title: string; body?: string; text?: string }>
  nextSteps?: Array<{ title: string; body?: string; text?: string }>
  nodes?: Array<{ title: string; subtitle?: string; desc?: string }>
  centerLabel?: string
  prompt?: string
  insight?: string
}

interface Template {
  id: string
  name: string
  description: string
  tags: string[]
  theme: {
    bg: string
    primary: string
    accent: string
    secondary: string
    fonts: string
    imageMode: string
  }
  previewSlides: Array<SlideData & { id: number }>
}

// ── Google Font imports per template ─────────────────────────────────────────
const TEMPLATE_FONTS: Record<string, string> = {
  BRUTALIST_NEWSPAPER: `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Serif:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Sans:wght@400;600&family=Oswald:wght@700;900&display=swap" rel="stylesheet">`,
  MINIMAL_CORPORATE: `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">`,
  DARK_TECH: `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">`,
  COMIC_POP: `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400&family=Dancing+Script:wght@400;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">`,
  TECH_DUEL: `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700&family=Quattrocento+Sans:wght@400;700&display=swap" rel="stylesheet">`,
  STARTUP_AMPLIFY: `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Liter:wght@400;700&family=Inter:wght@400;500;700&display=swap" rel="stylesheet">`,
}

// ── Template CSS (verbatim from each skill.md stylesheet section) ─────────────
const BRUTALIST_CSS = `
:root{--font-display:"Oswald",sans-serif;--font-title:"IBM Plex Serif",Georgia,serif;--font-body:"IBM Plex Sans","Microsoft YaHei",sans-serif;--primary:#CC2222;}
.brutalist-editorial{font-family:var(--font-body);color:#111111;background-color:#F3EFE0;box-sizing:border-box;padding:60px 72px;}
.news-grain{position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none;opacity:0.04;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");}
.news-header{position:absolute;top:30px;left:60px;right:60px;display:flex;justify-content:space-between;border-bottom:2px solid #111111;font-family:"Courier New",monospace;font-size:13px;font-weight:bold;padding-bottom:6px;z-index:5;}
.news-mega-title{font-family:var(--font-display);font-size:58px;font-weight:900;text-transform:uppercase;letter-spacing:-1.5px;border:none!important;padding-left:0!important;margin:0!important;line-height:0.95;text-align:center;}
.news-main-title-container{margin-top:55px;padding-top:15px;padding-bottom:12px;border-bottom:4px double #111111;z-index:5;position:relative;}
.news-hero-section{display:flex;gap:40px;margin-top:30px;height:380px;z-index:5;position:relative;}
.news-hero-left{flex:1.2;display:flex;flex-direction:column;justify-content:space-between;}
.editorial-lead{font-family:var(--font-title);font-size:26px;line-height:1.25;font-style:italic;color:#222222;margin:0;}
.news-author{font-family:"Courier New",monospace;font-size:13px;font-weight:bold;border-top:2px solid #111111;padding-top:12px;margin-top:20px;}
.news-hero-right{flex:1;border:3px solid #111111;overflow:hidden;}
.news-img-placeholder{width:100%;height:100%;background:#EAE6D5;}
.section-tag{position:absolute;top:40px;left:72px;font-family:"Courier New",monospace;font-size:13px;font-weight:bold;border:1px solid #111111;padding:3px 8px;background:#CC2222;color:#F3EFE0;}
.slide-title-brutalist{margin-top:10px;margin-bottom:30px;font-family:var(--font-title);font-size:38px;font-weight:800;border:none!important;padding-left:0!important;line-height:1.1;text-transform:none;letter-spacing:-0.5px;border-bottom:2px solid #111111!important;padding-bottom:10px!important;}
.glance-columns{display:flex;gap:40px;height:380px;}
.glance-col-left{flex:1;border:3px solid #111111;overflow:hidden;}
.glance-col-right{flex:1.2;display:flex;align-items:center;}
.brutalist-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:16px;}
.brutalist-list li{font-family:var(--font-body);font-size:21px;line-height:1.4;}
.bullet-tag{color:#CC2222;font-size:18px;margin-right:8px;}
.stats-table-container{display:flex;flex-direction:column;border-top:3px solid #111111;height:380px;overflow:hidden;}
.stats-table-row{flex:1;display:flex;border-bottom:2px solid #111111;align-items:center;}
.stat-big-val{width:250px;font-family:var(--font-display);font-size:76px;font-weight:900;color:#CC2222;text-align:left;letter-spacing:-2px;border-right:3px solid #111111;padding-right:20px;line-height:1;}
.stat-labels-col{padding-left:30px;display:flex;flex-direction:column;gap:6px;}
.stat-row-label{font-family:var(--font-title);font-size:24px;font-weight:bold;color:#111111;}
.stat-row-desc{font-family:var(--font-body);font-size:16px;color:#444444;line-height:1.4;}
.split-panel-grid{display:flex;gap:40px;height:385px;}
.panel-desc{flex:1.1;display:flex;flex-direction:column;gap:16px;justify-content:center;}
.panel-para{font-family:var(--font-title);font-size:22px;line-height:1.4;font-style:italic;margin:0;}
.panel-visual{flex:0.9;border:3px solid #111111;overflow:hidden;}
.flex-center-brutalist{display:flex;flex-direction:column;align-items:center;justify-content:center;}
.quote-stamp-box{width:900px;border:3px solid #111111;background-color:#EAE6D5;padding:60px;text-align:center;position:relative;}
.quote-large-mark{position:absolute;top:-35px;left:40px;font-family:var(--font-title);font-size:120px;font-weight:bold;color:#CC2222;line-height:1;}
.quote-text-brutalist{font-family:var(--font-title);font-size:28px;line-height:1.4;font-style:italic;color:#111111;margin:0 0 24px 0;z-index:2;position:relative;}
.quote-author-brutalist{font-family:"Courier New",monospace;font-size:15px;font-weight:bold;text-transform:uppercase;letter-spacing:1.5px;}
.dense-list-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;height:380px;}
.dense-list-card{border:3px solid #111111;background:#EAE6D5;padding:24px;display:flex;flex-direction:column;gap:14px;}
.card-num{font-family:"Courier New",monospace;font-size:14px;font-weight:bold;color:#CC2222;border-bottom:2px solid #111111;padding-bottom:6px;}
.card-title{font-family:var(--font-title);font-size:22px;font-weight:bold;color:#111111;line-height:1.2;}
.card-desc{font-family:var(--font-body);font-size:15px;line-height:1.45;color:#333333;}
.timeline-row{display:flex;gap:20px;height:380px;border-top:3px solid #111111;padding-top:30px;}
.timeline-node{flex:1;display:flex;flex-direction:column;gap:12px;}
.node-year{font-family:var(--font-display);font-size:24px;font-weight:bold;color:#CC2222;border-bottom:2px solid #111111;padding-bottom:6px;}
.node-heading{font-family:var(--font-title);font-size:19px;font-weight:bold;line-height:1.2;}
.node-text{font-family:var(--font-body);font-size:14px;line-height:1.4;color:#444444;}
.chart-editorial-container{height:380px;border:3px solid #111111;padding:20px;background:#EAE6D5;}
.icon-editorial-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;height:380px;}
.icon-editorial-card{border:3px solid #111111;background:#EAE6D5;padding:24px;display:flex;flex-direction:column;gap:12px;}
.icon-editorial-icon{font-size:32px;line-height:1;}
.icon-editorial-heading{font-family:"IBM Plex Serif",Georgia,serif;font-size:20px;font-weight:bold;color:#111111;line-height:1.2;}
.icon-editorial-text{font-family:"IBM Plex Sans","Microsoft YaHei",sans-serif;font-size:15px;line-height:1.45;color:#333333;}
.compare-panels-grid{display:flex;gap:40px;height:380px;}
.compare-panel-left,.compare-panel-right{flex:1;border:3px solid #111111;padding:32px;display:flex;flex-direction:column;gap:20px;}
.compare-panel-left{background:#EAE6D5;}
.compare-panel-right{background:#111111;color:#F3EFE0;}
.compare-panel-title{font-family:"IBM Plex Serif",Georgia,serif;font-size:28px;font-weight:bold;border-bottom:2px solid;padding-bottom:8px;}
.compare-panel-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:12px;}
.compare-panel-list li{font-family:"IBM Plex Sans","Microsoft YaHei",sans-serif;font-size:17px;line-height:1.45;}
.closing-card-brutalist{text-align:center;border:3px solid #F3EFE0;padding:60px 80px;background:#111111;width:800px;}
.closing-title{font-family:var(--font-display);font-size:64px;font-weight:900;text-transform:uppercase;letter-spacing:-1px;color:#F3EFE0;margin:0 0 16px 0!important;line-height:1;}
.closing-subtitle{font-family:var(--font-title);font-size:22px;font-style:italic;color:#CC2222;margin:0 0 40px 0;}
.closing-border-line{border-bottom:2px double #F3EFE0;margin-bottom:24px;}
.closing-contact{font-family:"Courier New",monospace;font-size:14px;font-weight:bold;color:#A8A495;}
.bg-black-editorial{background-color:#111111!important;color:#F3EFE0!important;}
.news-hero-img{width:100%;height:100%;object-fit:cover;filter:grayscale(100%) contrast(1.4) brightness(0.95);}
.glance-img{width:100%;height:100%;object-fit:cover;filter:grayscale(100%) contrast(1.4) brightness(0.95);}
`

const CORP_CSS = `
:root{--font-display:"Montserrat",sans-serif;--font-body:"Inter",sans-serif;--primary:#004080;}
.corp-minimal{font-family:var(--font-body);background-color:#F8F9FA;color:#555555;position:relative;box-sizing:border-box;}
.corp-content{padding:60px 80px;height:100%;box-sizing:border-box;display:flex;flex-direction:column;}
.flex-center{align-items:center;justify-content:center;}
.corp-cover-accent{position:absolute;top:0;left:0;right:0;height:6px;background:var(--primary);}
.corp-cover-title{font-family:var(--font-display);font-size:54px;font-weight:700;color:#1A1A1A;line-height:1.15;margin:0;border:none;padding-left:0;text-transform:none;letter-spacing:-0.5px;}
.corp-cover-subtitle{font-family:var(--font-body);font-size:20px;color:#555555;margin-top:16px;font-weight:400;}
.corp-cover-footer{position:absolute;bottom:50px;font-size:13px;color:#888888;font-family:var(--font-body);letter-spacing:0.5px;}
.corp-badge{align-self:flex-start;font-family:var(--font-display);font-size:11px;font-weight:700;letter-spacing:1.5px;color:var(--primary);background:rgba(0,64,128,0.06);padding:4px 10px;border-radius:4px;margin-bottom:12px;}
.corp-title{font-family:var(--font-display);font-size:32px;font-weight:700;color:#1A1A1A;margin:0 0 28px 0;border:none;padding-left:0;text-transform:none;letter-spacing:-0.5px;}
.corp-toc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:24px;margin-top:10px;}
.corp-toc-item{display:flex;gap:16px;align-items:center;background:#FFFFFF;border:1px solid #E9ECEF;padding:20px;border-radius:8px;}
.corp-toc-num{font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--primary);}
.corp-toc-text{font-family:var(--font-body);font-size:16px;font-weight:600;color:#333333;}
.corp-brief-split{display:flex;gap:48px;height:380px;}
.corp-brief-left{flex:1.2;display:flex;flex-direction:column;justify-content:center;}
.corp-brief-lead{font-size:18px;line-height:1.6;color:#333333;margin:0 0 16px 0;}
.corp-bullets{list-style:none;padding:0;margin:0;}
.corp-bullets li{position:relative;padding-left:20px;font-size:15px;line-height:1.6;margin-bottom:10px;}
.corp-bullets li::before{content:"";position:absolute;left:0;top:9px;width:6px;height:6px;border-radius:50%;background:var(--primary);}
.corp-brief-right{flex:0.8;border-radius:8px;overflow:hidden;border:1px solid #E9ECEF;}
.corp-img-placeholder{width:100%;height:100%;background:#F1F3F5;}
.corp-metrics-row{display:flex;gap:20px;height:380px;align-items:center;}
.corp-metric-card{flex:1;background:#FFFFFF;border:1px solid #E9ECEF;padding:24px;border-radius:8px;display:flex;flex-direction:column;gap:8px;}
.corp-metric-num{font-family:var(--font-display);font-size:48px;font-weight:700;color:var(--primary);line-height:1;}
.corp-metric-label{font-family:var(--font-display);font-size:14px;font-weight:700;color:#1A1A1A;}
.corp-metric-desc{font-size:13px;line-height:1.5;color:#666666;}
.corp-split-columns{display:flex;gap:24px;height:380px;}
.corp-column-card{flex:1;background:#FFFFFF;border:1px solid #E9ECEF;padding:28px;border-radius:8px;}
.corp-col-header{font-family:var(--font-display);font-size:18px;font-weight:700;color:#1A1A1A;margin-bottom:16px;border-bottom:2px solid var(--primary);padding-bottom:8px;}
.corp-dense-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;height:380px;}
.corp-grid-card{background:#FFFFFF;border:1px solid #E9ECEF;padding:20px;border-radius:8px;display:flex;flex-direction:column;gap:10px;}
.corp-grid-title{font-family:var(--font-display);font-size:16px;font-weight:700;color:#1A1A1A;}
.corp-grid-desc{font-size:13px;line-height:1.5;color:#666666;}
.corp-timeline{position:relative;display:flex;gap:20px;height:380px;padding-top:40px;}
.corp-timeline-line{position:absolute;top:48px;left:0;right:0;height:2px;background:#E9ECEF;z-index:1;}
.corp-timeline-node{flex:1;display:flex;flex-direction:column;gap:12px;position:relative;z-index:2;}
.corp-node-dot{width:16px;height:16px;border-radius:50%;background:#FFFFFF;border:3px solid var(--primary);margin-bottom:12px;}
.corp-node-year{font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--primary);}
.corp-node-title{font-family:var(--font-display);font-size:15px;font-weight:700;color:#1A1A1A;}
.corp-node-desc{font-size:13px;line-height:1.45;color:#666666;}
.corp-closing-bg{background-color:#004080!important;color:rgba(255,255,255,0.7)!important;}
.corp-closing-title{font-family:var(--font-display);font-size:54px;font-weight:700;color:#FFFFFF;border:none;padding-left:0;text-align:center;}
.corp-closing-subtitle{font-size:20px;color:rgba(255,255,255,0.8);margin-top:12px;}
.corp-closing-line{width:80px;height:2px;background:rgba(255,255,255,0.3);margin:30px auto;}
.corp-closing-footer{position:absolute;bottom:50px;font-size:13px;color:rgba(255,255,255,0.5);}
.corp-chart-full{flex:1;min-height:0;position:relative;background:#FFFFFF;border:1px solid #E9ECEF;border-radius:8px;padding:16px;}
.corp-chart-source{font-size:12px;color:#555555;text-align:right;margin-top:8px;}
.corp-split-chart{display:flex;gap:32px;flex:1;min-height:0;}
.corp-split-chart-left{width:40%;display:flex;flex-direction:column;justify-content:center;}
.corp-split-chart-right{flex:1;min-height:0;position:relative;background:#FFFFFF;border:1px solid #E9ECEF;border-radius:8px;padding:16px;}
.corp-icon-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;flex:1;}
.corp-icon-grid-item{background:#FFFFFF;border:1px solid #E9ECEF;border-radius:8px;padding:24px;display:flex;flex-direction:column;gap:10px;}
.corp-icon-grid-icon{font-size:28px;line-height:1;color:#004080;}
.corp-icon-grid-heading{font-family:var(--font-display);font-size:16px;font-weight:700;color:#1A1A1A;}
.corp-icon-grid-text{font-size:13px;line-height:1.5;color:#555555;}
.corp-compare-row{display:flex;gap:24px;flex:1;}
.corp-compare-panel{flex:1;background:#FFFFFF;border:1px solid #E9ECEF;border-radius:8px;padding:28px;}
.corp-compare-left{border-left:4px solid #004080;}
.corp-compare-right{border-left:4px solid #555555;}
.corp-compare-title{font-family:var(--font-display);font-size:18px;font-weight:700;color:#1A1A1A;margin-bottom:16px;}
.corp-impact-slide{position:relative;overflow:hidden;background:#1A1A1A!important;}
.corp-impact-overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,64,128,0.7);z-index:2;}
.corp-impact-content{z-index:5;position:relative;align-items:center;justify-content:center;}
.corp-impact-statement{font-family:var(--font-display);font-size:40px;font-weight:700;color:#FFFFFF;line-height:1.3;text-align:center;}
.corp-impact-attribution{font-size:16px;color:rgba(255,255,255,0.7);margin-top:20px;}
.corp-split-img{width:100%;height:100%;object-fit:cover;}
`

const TECH_CSS = `
:root{--font-display:"Share Tech Mono","JetBrains Mono",monospace;--font-body:"JetBrains Mono",monospace;--primary:#06B6D4;--accent:#10B981;}
.tech-glow{font-family:var(--font-body);background-color:#0F172A;color:#94A3B8;position:relative;box-sizing:border-box;}
.bg-dark-slate{background-color:#0F172A!important;}
.tech-grid-lines{position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none;opacity:0.03;background-size:30px 30px;background-image:linear-gradient(to right,#06B6D4 1px,transparent 1px),linear-gradient(to bottom,#06B6D4 1px,transparent 1px);}
.tech-content{padding:60px 80px;height:100%;box-sizing:border-box;display:flex;flex-direction:column;z-index:5;position:relative;}
.flex-center{align-items:center;justify-content:center;}
.terminal-header{font-family:var(--font-display);color:var(--primary);font-size:14px;letter-spacing:2px;margin-bottom:20px;}
.tech-cover-title{font-family:var(--font-display);font-size:54px;font-weight:700;color:#FFFFFF;line-height:1.1;margin:0;border:none;padding-left:0;text-transform:uppercase;letter-spacing:-1px;}
.tech-cover-subtitle{font-family:var(--font-body);font-size:18px;color:var(--accent);margin-top:20px;}
.tech-cover-footer{position:absolute;bottom:50px;font-size:12px;color:#475569;font-family:var(--font-display);letter-spacing:1px;}
.tech-badge{align-self:flex-start;font-family:var(--font-display);font-size:12px;font-weight:700;letter-spacing:2px;color:var(--primary);border:1px dashed var(--primary);padding:3px 8px;border-radius:4px;margin-bottom:16px;}
.tech-title{font-family:var(--font-display);font-size:30px;font-weight:700;color:#FFFFFF;margin:0 0 24px 0;border:none;padding-left:0;text-transform:uppercase;letter-spacing:-0.5px;}
.tech-dashboard-grid{display:flex;gap:40px;height:380px;}
.tech-dash-left{flex:1;border:2px solid #334155;overflow:hidden;border-radius:6px;box-shadow:0 0 15px rgba(6,182,212,0.1);}
.tech-img-placeholder{width:100%;height:100%;background:#1E293B;}
.tech-dash-right{flex:1.2;display:flex;flex-direction:column;}
.terminal-box{background:#020617;border:2px solid #334155;border-radius:6px;flex:1;padding:20px;display:flex;flex-direction:column;}
.terminal-bar{display:flex;gap:6px;margin-bottom:16px;border-bottom:1px solid #1E293B;padding-bottom:8px;}
.term-dot{width:8px;height:8px;border-radius:50%;background:#334155;}
.tech-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:14px;}
.tech-list li{font-family:var(--font-body);font-size:15px;line-height:1.5;color:#94A3B8;}
.tech-prompt{color:var(--accent);font-weight:bold;margin-right:8px;}
.tech-metrics-row{display:flex;gap:20px;height:380px;align-items:center;}
.tech-metric-card{flex:1;background:#1E293B;border:2px solid #334155;padding:24px;border-radius:6px;position:relative;display:flex;flex-direction:column;gap:8px;}
.tech-metric-glow-bar{position:absolute;top:0;left:0;right:0;height:3px;background:var(--primary);box-shadow:0 0 10px var(--primary);}
.tech-metric-num{font-family:var(--font-display);font-size:44px;color:var(--primary);line-height:1;text-shadow:0 0 10px rgba(6,182,212,0.3);}
.tech-metric-label{font-family:var(--font-display);font-size:13px;color:#FFFFFF;}
.tech-metric-desc{font-size:12px;line-height:1.5;color:#64748B;}
.tech-panels-split{display:flex;gap:24px;height:380px;}
.tech-panel-card{flex:1;background:#1E293B;border:2px solid #334155;padding:28px;border-radius:6px;}
.card-accent-glow{border-color:var(--accent)!important;box-shadow:0 0 15px rgba(16,185,129,0.1);}
.tech-panel-header{font-family:var(--font-display);font-size:15px;color:var(--primary);margin-bottom:20px;border-bottom:1px dashed #334155;padding-bottom:10px;}
.color-accent{color:var(--accent)!important;}
.tech-panel-text{font-size:14px;line-height:1.6;color:#94A3B8;margin:0;}
.tech-pipeline-row{display:flex;gap:20px;height:380px;padding-top:40px;}
.tech-pipeline-node{flex:1;display:flex;flex-direction:column;gap:12px;position:relative;}
.node-index{font-family:var(--font-display);font-size:13px;color:var(--accent);}
.node-arrow-glow{height:3px;background:#334155;margin-bottom:12px;}
.node-heading{font-family:var(--font-display);font-size:15px;font-weight:bold;color:#FFFFFF;}
.node-text{font-size:13px;line-height:1.5;color:#94A3B8;}
.closing-box{text-align:center;border:2px dashed var(--primary);padding:50px 80px;background:#020617;border-radius:6px;box-shadow:0 0 20px rgba(6,182,212,0.15);}
.tech-closing-title{font-family:var(--font-display);font-size:48px;color:#FFFFFF;margin:0 0 16px 0!important;border:none;padding-left:0;text-transform:uppercase;}
.tech-closing-subtitle{font-family:var(--font-body);font-size:18px;color:var(--accent);margin:0 0 30px 0;}
.closing-bracket{font-family:var(--font-display);font-size:13px;color:#475569;}
.tech-chart-full{flex:1;min-height:0;position:relative;margin-top:8px;}
.tech-split-chart{display:flex;gap:32px;flex:1;min-height:0;}
.tech-split-chart-text{width:40%;display:flex;flex-direction:column;justify-content:center;}
.tech-split-chart-viz{flex:1;min-height:0;position:relative;}
.tech-icon-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;flex:1;align-content:center;}
.tech-icon-card{background:#1E293B;border:2px solid #334155;border-radius:4px;padding:24px;display:flex;flex-direction:column;gap:10px;}
.tech-icon-symbol{font-size:28px;color:var(--primary);line-height:1;}
.tech-icon-heading{font-family:var(--font-display);font-size:15px;color:#FFFFFF;}
.tech-icon-text{font-size:12px;line-height:1.5;color:#94A3B8;}
.tech-compare-row{display:flex;gap:24px;flex:1;min-height:0;}
.tech-compare-panel{flex:1;background:#1E293B;border:2px solid #334155;border-radius:4px;padding:28px;}
.tech-compare-panel.panel-primary{border-color:var(--primary);box-shadow:0 0 15px rgba(6,182,212,0.1);}
.tech-compare-panel.panel-accent{border-color:var(--accent);box-shadow:0 0 15px rgba(16,185,129,0.1);}
.tech-compare-header{font-family:var(--font-display);font-size:15px;color:var(--primary);margin-bottom:20px;border-bottom:1px dashed #334155;padding-bottom:10px;}
.tech-dash-img{width:100%;height:100%;object-fit:cover;filter:grayscale(100%) brightness(0.8) contrast(1.5) sepia(10%) hue-rotate(150deg);}
`

const COMIC_CSS = `
:root{--font-display:'Bebas Neue',sans-serif;--font-body:'Dancing Script',cursive;--font-label:'Nunito',sans-serif;--primary:#FBCC00;--accent:#191919;--secondary:#404040;--bg:#FFFDF5;}
.comic-pop{font-family:var(--font-body);background-color:#FFFDF5;color:#191919;position:relative;box-sizing:border-box;overflow:hidden;}
.comic-dot-bg{position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;background-image:radial-gradient(circle,#191919 1px,transparent 1px);background-size:24px 24px;opacity:0.035;}
.comic-dot-bg--dark{background-image:radial-gradient(circle,#FBCC00 1px,transparent 1px);opacity:0.06;}
.comic-content{padding:56px 72px 48px 72px;height:100%;box-sizing:border-box;display:flex;flex-direction:column;position:relative;z-index:2;}
.comic-badge{align-self:flex-start;font-family:'Nunito',sans-serif;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#191919;background:#FBCC00;border:2px solid #191919;border-radius:4px;padding:4px 12px;margin-bottom:14px;box-shadow:2px 2px 0 #191919;line-height:1.4;}
.comic-badge-lg{align-self:flex-start;font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#191919;background:#FBCC00;border:2.5px solid #191919;border-radius:6px;padding:6px 16px;margin-bottom:20px;box-shadow:3px 3px 0 #191919;}
.comic-title{font-family:'Bebas Neue',sans-serif;font-size:42px;font-weight:400;color:#191919;margin:0 0 24px 0;border:none!important;padding-left:0!important;line-height:1.05;letter-spacing:0.5px;}
.comic-cover-title{font-family:'Bebas Neue',sans-serif;font-size:68px;font-weight:400;color:#191919;line-height:1.0;margin:0 0 16px 0;border:none!important;padding-left:0!important;letter-spacing:1px;}
.comic-cover-subtitle{font-family:'Dancing Script',cursive;font-size:24px;font-weight:600;color:#404040;margin:0 0 24px 0;line-height:1.4;}
.comic-cover-meta{font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;color:#404040;border-top:2px solid #191919;padding-top:12px;display:inline-block;}
.comic-cover-layout{display:flex;gap:48px;height:100%;align-items:center;padding:60px 72px;position:relative;z-index:2;box-sizing:border-box;}
.comic-cover-left{flex:1.1;display:flex;flex-direction:column;justify-content:center;}
.comic-cover-right{flex:0.9;height:520px;}
.comic-cover-stripe{position:absolute;bottom:0;left:0;right:0;height:8px;background:#191919;z-index:3;}
.comic-img-card{width:100%;height:100%;border:2.5px solid #191919;border-radius:12px;box-shadow:6px 6px 0 #191919;overflow:hidden;background:#FFF8D6;}
.comic-img-fill{width:100%;height:100%;object-fit:cover;display:block;}
.comic-img-placeholder{display:flex;align-items:center;justify-content:center;background:#FFF8D6;}
.comic-placeholder-icon{font-size:48px;color:#FBCC00;text-shadow:2px 2px 0 #191919;}
.comic-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:12px;}
.comic-list li{display:flex;align-items:flex-start;gap:10px;font-family:'Dancing Script',cursive;font-size:19px;font-weight:600;line-height:1.35;color:#191919;padding-left:0!important;margin-bottom:0!important;}
.comic-list li::before{display:none!important;}
.comic-bullet-dot{color:#FBCC00;font-size:14px;line-height:1.6;flex-shrink:0;text-shadow:1px 1px 0 #191919;}
.comic-bullet-num{font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;background:#FBCC00;color:#191919;border:2px solid #191919;border-radius:4px;padding:2px 6px;min-width:28px;text-align:center;box-shadow:2px 2px 0 #191919;flex-shrink:0;}
.comic-bullet-text{flex:1;}
.comic-body-lead{font-family:'Dancing Script',cursive;font-size:21px;font-weight:600;color:#191919;line-height:1.45;margin:0 0 16px 0;}
.comic-glance-grid{display:flex;gap:40px;flex:1;min-height:0;}
.comic-glance-left{flex:0.9;}
.comic-glance-right{flex:1.1;display:flex;align-items:center;}
.comic-stats-row{display:flex;gap:20px;flex:1;align-items:stretch;}
.comic-stat-card{flex:1;background:#FFFFFF;border:2.5px solid #191919;border-radius:12px;box-shadow:4px 4px 0 #191919;padding:28px 24px;display:flex;flex-direction:column;gap:10px;position:relative;overflow:hidden;}
.comic-stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:5px;background:#191919;}
.comic-stat-card--yellow{background:#FBCC00;}
.comic-stat-value{font-family:'Bebas Neue',sans-serif;font-size:68px;font-weight:400;color:#191919;line-height:1.0;letter-spacing:0.5px;}
.comic-stat-label{font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#191919;}
.comic-stat-desc{font-family:'Dancing Script',cursive;font-size:16px;font-weight:500;color:#404040;line-height:1.4;}
.comic-split-layout{display:flex;gap:40px;flex:1;min-height:0;}
.comic-split-text{flex:1.1;display:flex;flex-direction:column;justify-content:center;gap:16px;}
.comic-split-visual{flex:0.9;}
.comic-quote-slide{display:flex;align-items:center;justify-content:center;}
.comic-quote-center{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:60px;position:relative;z-index:2;gap:24px;}
.comic-quote-box{background:#FFFFFF;border:2.5px solid #191919;border-radius:16px;box-shadow:6px 6px 0 #191919;padding:52px 60px 44px 60px;max-width:950px;text-align:center;position:relative;}
.comic-quote-mark{position:absolute;top:-36px;left:40px;font-family:'Bebas Neue',sans-serif;font-size:120px;color:#FBCC00;line-height:1;text-shadow:3px 3px 0 #191919;}
.comic-quote-text{font-family:'Dancing Script',cursive;font-size:30px;font-weight:700;color:#191919;line-height:1.4;margin:0 0 20px 0;position:relative;z-index:2;}
.comic-quote-author{font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;letter-spacing:1px;color:#404040;text-transform:uppercase;}
.comic-flow-row{display:flex;align-items:center;gap:0;flex:1;padding-top:8px;}
.comic-flow-node{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;position:relative;}
.comic-flow-num{font-family:'Nunito',sans-serif;font-size:11px;font-weight:800;color:#404040;letter-spacing:1px;}
.comic-flow-card{background:#FFFFFF;border:2.5px solid #191919;border-radius:10px;box-shadow:3px 3px 0 #191919;padding:16px 14px;width:100%;display:flex;flex-direction:column;gap:6px;}
.comic-flow-card--yellow{background:#FFF8D6;}
.comic-flow-heading{font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;color:#191919;line-height:1.2;}
.comic-flow-text{font-family:'Dancing Script',cursive;font-size:15px;font-weight:500;color:#404040;line-height:1.3;}
.comic-flow-arrow{font-size:24px;color:#FBCC00;text-shadow:1px 1px 0 #191919;font-weight:900;position:absolute;right:-16px;top:50%;transform:translateY(-50%);z-index:3;}
.comic-chart-full{flex:1;min-height:0;position:relative;background:#FFFFFF;border:2.5px solid #191919;border-radius:12px;box-shadow:4px 4px 0 #191919;padding:16px;margin-top:4px;}
.comic-chart-preview{flex:1;min-height:0;background:#FFFFFF;border:2.5px solid #191919;border-radius:12px;box-shadow:4px 4px 0 #191919;padding:20px;display:flex;align-items:flex-end;justify-content:space-around;gap:10px;}
.comic-chart-source{font-family:'Nunito',sans-serif;font-size:11px;font-weight:600;color:#404040;text-align:right;margin-top:8px;letter-spacing:0.5px;}
.comic-split-chart-layout{display:flex;gap:32px;flex:1;min-height:0;}
.comic-split-chart-left{width:38%;display:flex;flex-direction:column;justify-content:center;}
.comic-split-chart-right{flex:1;min-height:0;position:relative;background:#FFFFFF;border:2.5px solid #191919;border-radius:12px;box-shadow:4px 4px 0 #191919;padding:16px;display:flex;align-items:flex-end;justify-content:space-around;gap:10px;}
.comic-icon-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;flex:1;align-content:stretch;}
.comic-icon-card{background:#FFFFFF;border:2.5px solid #191919;border-radius:12px;box-shadow:4px 4px 0 #191919;padding:22px 20px;display:flex;flex-direction:column;gap:10px;}
.comic-icon-card--yellow{background:#FFF8D6;}
.comic-icon-symbol{font-size:30px;line-height:1;}
.comic-icon-heading{font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;color:#191919;line-height:1.2;}
.comic-icon-text{font-family:'Dancing Script',cursive;font-size:16px;font-weight:500;color:#404040;line-height:1.35;}
.comic-compare-row{display:flex;gap:0;flex:1;align-items:stretch;position:relative;}
.comic-compare-panel{flex:1;background:#FFFFFF;border:2.5px solid #191919;border-radius:12px;box-shadow:4px 4px 0 #191919;padding:28px 26px;display:flex;flex-direction:column;gap:16px;}
.comic-compare-panel--yellow{background:#FFF8D6;margin-left:40px;}
.comic-compare-header{font-family:'Bebas Neue',sans-serif;font-size:28px;color:#191919;border-bottom:2.5px solid #191919;padding-bottom:10px;line-height:1;}
.comic-vs-badge{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:5;font-family:'Bebas Neue',sans-serif;font-size:22px;background:#FBCC00;border:2.5px solid #191919;border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;box-shadow:3px 3px 0 #191919;color:#191919;}
.comic-flowchart-container{flex:1;min-height:0;position:relative;width:100%;background:#FFFFFF;border:2.5px solid #191919;border-radius:12px;box-shadow:4px 4px 0 #191919;padding:20px;display:flex;align-items:center;justify-content:center;gap:0;overflow:hidden;}
.comic-fc-node{display:inline-flex;align-items:center;justify-content:center;text-align:center;font-family:'Dancing Script',cursive;font-size:13px;font-weight:700;color:#191919;background:#FFFFFF;border:2.5px solid #191919;border-radius:8px;box-shadow:3px 3px 0 #191919;padding:8px 12px;line-height:1.2;min-width:100px;}
.comic-fc-node--start,.comic-fc-node--end{font-family:'Nunito',sans-serif;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;border-radius:50px;padding:8px 16px;}
.comic-fc-node--start{background:#FBCC00;}
.comic-fc-node--end{background:#191919;color:#FBCC00;}
.comic-fc-node--decision{background:#FFF8D6;border-radius:0;transform:rotate(45deg);width:70px;height:70px;padding:4px;}
.comic-fc-node--decision span{display:block;transform:rotate(-45deg);font-size:10px;}
.comic-fc-arrow{font-size:22px;color:#FBCC00;text-shadow:1px 1px 0 #191919;font-weight:900;padding:0 8px;flex-shrink:0;}
.comic-fc-label{font-family:'Nunito',sans-serif;font-size:10px;font-weight:800;background:#FBCC00;border:1.5px solid #191919;border-radius:3px;padding:1px 5px;position:absolute;top:-14px;left:50%;transform:translateX(-50%);white-space:nowrap;}
.comic-impact-slide{position:relative;overflow:hidden;}
.comic-impact-bg{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1;filter:brightness(0.65) contrast(1.2);}
.comic-impact-bg-placeholder{position:absolute;top:0;left:0;width:100%;height:100%;background:#191919;z-index:1;}
.comic-impact-overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(25,25,25,0.55);z-index:2;}
.comic-impact-content{position:relative;z-index:5;height:100%;display:flex;align-items:center;justify-content:center;padding:60px;}
.comic-impact-box{background:rgba(255,253,245,0.95);border:2.5px solid #191919;border-radius:16px;box-shadow:6px 6px 0 rgba(25,25,25,0.7);padding:48px 56px;max-width:900px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:20px;}
.comic-impact-statement{font-family:'Dancing Script',cursive;font-size:34px;font-weight:700;color:#191919;line-height:1.35;margin:0;}
.comic-impact-attribution{font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;color:#404040;letter-spacing:1px;}
.comic-closing-slide{background:#191919!important;display:flex;align-items:center;justify-content:center;}
.comic-closing-card{background:#FFFDF5;border:2.5px solid #FBCC00;border-radius:20px;box-shadow:8px 8px 0 rgba(251,204,0,0.5);padding:56px 72px;max-width:800px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:16px;position:relative;z-index:2;}
.comic-closing-badge{font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#191919;background:#FBCC00;border:2px solid #191919;border-radius:4px;padding:5px 14px;box-shadow:2px 2px 0 #191919;}
.comic-closing-title{font-family:'Bebas Neue',sans-serif;font-size:64px;font-weight:400;color:#191919;margin:0!important;border:none!important;padding-left:0!important;line-height:1.0;letter-spacing:1px;}
.comic-closing-subtitle{font-family:'Dancing Script',cursive;font-size:26px;font-weight:600;color:#404040;margin:0;line-height:1.4;}
.comic-closing-divider{width:80px;height:3px;background:#FBCC00;border:1px solid #191919;border-radius:2px;margin:8px auto;}
.comic-closing-meta{font-family:'Nunito',sans-serif;font-size:13px;font-weight:600;color:#404040;letter-spacing:0.5px;}
`

const TECH_DUEL_CSS = `
:root{--font-display:"Outfit",sans-serif;--font-body:"Quattrocento Sans",sans-serif;--font-label:"Outfit",sans-serif;}
.duel-dark{background:#0D1117;color:#E6EDF3;}
.duel-light{background:#F6F7F9;color:#1F2328;}
.duel-content{padding:52px 70px;height:100%;box-sizing:border-box;position:relative;z-index:5;}
.duel-green-text{color:#76B900!important;}
.duel-red-text{color:#ED1C24!important;}
.duel-accent-bar{position:absolute;top:0;left:70px;right:70px;height:5px;z-index:10;}
.duel-bar-green{background:#76B900;}
.duel-bar-red{background:#ED1C24;}
.duel-source{position:absolute;bottom:18px;left:70px;font-size:10px;color:#656D76;font-family:var(--font-body);}
.duel-cover{position:relative;overflow:hidden;}
.duel-cover-bg{position:absolute;top:0;right:0;width:55%;height:100%;object-fit:cover;z-index:1;}
.duel-cover-gradient{position:absolute;top:0;left:0;width:75%;height:100%;background:linear-gradient(90deg,#0D1117 0%,#0D1117 55%,rgba(13,17,23,0.6) 75%,rgba(13,17,23,0) 100%);z-index:2;}
.duel-cover-bar{position:absolute;left:70px;top:210px;width:7px;height:280px;background:#76B900;z-index:5;}
.duel-cover-content{display:flex;flex-direction:column;justify-content:center;padding-left:100px;}
.duel-cover-kicker{font-family:var(--font-label);font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#76B900;margin-bottom:14px;font-weight:700;}
.duel-cover-title{font-family:var(--font-display);font-size:54px;line-height:1.1;color:#76B900;margin:0;text-transform:uppercase;letter-spacing:-1px;max-width:720px;border:none;padding:0;}
.duel-cover-subtitle{font-family:var(--font-body);font-size:20px;color:#E6EDF3;margin-top:20px;max-width:600px;line-height:1.5;}
.duel-cover-date{font-family:var(--font-label);font-size:13px;color:#76B900;letter-spacing:1.5px;text-transform:uppercase;margin-top:30px;font-weight:700;}
.duel-cover-footer{position:absolute;bottom:36px;left:100px;font-size:12px;color:#656D76;letter-spacing:0.5px;}
.duel-toc-kicker{font-family:var(--font-label);font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#76B900;margin-bottom:8px;font-weight:700;}
.duel-toc-title{font-family:var(--font-display);font-size:48px;color:#E6EDF3;margin:0 0 40px 0;text-transform:uppercase;letter-spacing:-0.5px;border:none;padding:0;}
.duel-toc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px 50px;}
.duel-toc-item{display:flex;align-items:flex-start;gap:14px;}
.duel-toc-number{font-family:var(--font-display);font-size:26px;color:#76B900;line-height:1;font-weight:800;min-width:46px;}
.duel-toc-section-title{font-family:var(--font-display);font-size:16px;color:#E6EDF3;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin-bottom:3px;}
.duel-toc-section-desc{font-family:var(--font-body);font-size:12px;color:#9BA3AB;line-height:1.35;}
.duel-product-content{padding-top:60px;}
.duel-product-title{font-family:var(--font-display);font-size:28px;color:#1F2328;margin:0;border:none;padding:0;line-height:1.2;}
.duel-product-tagline{font-family:var(--font-body);font-size:15px;color:#656D76;margin-top:6px;margin-bottom:20px;}
.duel-product-grid{display:flex;gap:34px;height:320px;}
.duel-product-left{width:34%;display:flex;flex-direction:column;gap:12px;}
.duel-product-image-wrap{flex:1;border-radius:8px;overflow:hidden;background:#EAECEF;}
.duel-product-image{width:100%;height:100%;object-fit:cover;}
.duel-product-image-placeholder{width:100%;height:100%;background:#EAECEF;}
.duel-product-badge{display:inline-block;padding:6px 12px;border-radius:5px;font-family:var(--font-label);font-size:12px;font-weight:700;letter-spacing:0.5px;color:#0D1117;width:fit-content;}
.duel-badge-green{background:#76B900;}
.duel-badge-red{background:#ED1C24;}
.duel-product-right{flex:1;display:grid;grid-template-columns:1.3fr 0.7fr;gap:16px;}
.duel-product-specs{background:#fff;border:1px solid #D0D7DE;border-radius:8px;padding:16px;}
.duel-specs-header{font-family:var(--font-label);font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#656D76;margin-bottom:10px;font-weight:700;}
.duel-spec-row{font-family:var(--font-body);font-size:13px;line-height:1.7;color:#1F2328;}
.duel-spec-label{font-weight:700;}
.duel-spec-value{color:#656D76;}
.duel-product-price{background:#fff;border:1px solid #D0D7DE;border-radius:8px;padding:16px;}
.duel-price-label{font-family:var(--font-label);font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#656D76;margin-bottom:6px;font-weight:700;}
.duel-price-value{font-family:var(--font-display);font-size:32px;font-weight:800;line-height:1;margin-bottom:6px;}
.duel-price-note{font-family:var(--font-body);font-size:11px;color:#656D76;line-height:1.4;}
.duel-product-differentiator{grid-column:1/-1;background:#fff;border-left:4px solid;border-radius:0 8px 8px 0;padding:14px 16px;}
.duel-diff-label{font-family:var(--font-label);font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px;}
.duel-diff-text{font-family:var(--font-body);font-size:12px;color:#1F2328;line-height:1.5;}
.duel-product-bottom{margin-top:18px;background:#fff;border:1px solid #D0D7DE;border-radius:8px;padding:16px;}
.duel-bottom-header{font-family:var(--font-label);font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:8px;}
.duel-product-whatis p{font-family:var(--font-body);font-size:12px;line-height:1.55;color:#1F2328;margin:0 0 8px 0;}
.duel-product-whatis p:last-child{margin-bottom:0;}
.duel-closing{position:relative;overflow:hidden;}
.duel-closing-bg{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1;opacity:0.15;}
.duel-closing-overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(circle at center,rgba(13,17,23,0.5) 0%,rgba(13,17,23,0.88) 70%);z-index:2;}
.duel-closing-content{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;z-index:5;}
.duel-closing-bar{width:80px;height:5px;background:#76B900;margin-bottom:24px;}
.duel-closing-title{font-family:var(--font-display);font-size:42px;color:#E6EDF3;margin:0 0 14px 0;text-transform:uppercase;letter-spacing:-0.5px;border:none;padding:0;max-width:900px;line-height:1.15;}
.duel-closing-statement{font-family:var(--font-body);font-size:18px;color:#656D76;max-width:800px;line-height:1.5;margin-bottom:30px;}
.duel-closing-thankyou{font-family:var(--font-display);font-size:64px;color:#76B900;font-weight:800;text-transform:uppercase;letter-spacing:4px;margin-bottom:30px;}
.duel-closing-footer{font-family:var(--font-body);font-size:12px;color:#656D76;letter-spacing:1px;}
.duel-closing-separator{margin:0 12px;color:#76B900;}
`

const STARTUP_AMPLIFY_CSS = `
:root{--font-display:"Liter",sans-serif;--font-body:"Inter",sans-serif;}
.amp-cover,.amp-chapter,.amp-closing,.amp-content{background:#F4F4F4;color:#2C2C2C;box-sizing:border-box;}
.amp-content{padding:40px 60px;height:100%;position:relative;}
.amp-rule{position:absolute;left:0;width:100%;height:2px;background:#D91E18;z-index:10;}
.amp-rule-top{top:0;}.amp-rule-bottom{bottom:0;}
.amp-content-header{margin-bottom:20px;}
.amp-slide-title{font-family:var(--font-display);font-size:28px;font-weight:700;margin:0 0 6px 0;line-height:1.25;}
.amp-slide-subtitle{font-family:var(--font-body);font-size:13px;color:#888888;text-transform:uppercase;letter-spacing:0.5px;}
.amp-source{position:absolute;bottom:16px;left:60px;font-size:11px;color:#888888;font-family:var(--font-body);}
.amp-insight-bar{margin-top:16px;background:#FFFFFF;border-left:4px solid #D91E18;padding:12px 16px;font-family:var(--font-body);font-size:13px;line-height:1.5;}
.amp-insight-bar strong{color:#D91E18;font-weight:700;}
.amp-cover{position:relative;overflow:hidden;}
.amp-cover-bg{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0.22;z-index:0;}
.amp-cover-content{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;height:100%;padding:60px;}
.amp-cover-title{font-family:var(--font-display);font-size:54px;font-weight:700;margin:0;line-height:1.1;}
.amp-cover-subtitle{font-family:var(--font-display);font-size:26px;margin-top:14px;}
.amp-cover-meta{font-family:var(--font-body);font-size:14px;color:#888888;margin-top:14px;}
.amp-cover-stats{display:flex;gap:60px;margin-top:44px;}
.amp-cover-stat{text-align:left;min-width:170px;}
.amp-cover-stat-value{font-family:var(--font-display);font-size:40px;font-weight:700;line-height:1;}
.amp-cover-stat:nth-child(2) .amp-cover-stat-value{color:#D91E18;}
.amp-cover-stat-label{font-family:var(--font-body);font-size:13px;color:#888888;margin-top:6px;}
.amp-toc{padding:60px;height:100%;position:relative;}
.amp-toc-title{font-family:var(--font-display);font-size:34px;font-weight:700;margin:0 0 32px 0;}
.amp-toc-rows{display:flex;flex-direction:column;gap:22px;}
.amp-toc-row{display:flex;align-items:center;gap:24px;padding-bottom:20px;border-bottom:1px solid #CCCCCC;}
.amp-toc-num{font-family:var(--font-display);font-size:48px;font-weight:700;min-width:80px;line-height:1;}
.amp-toc-text{flex:1;}
.amp-toc-chapter-title{font-family:var(--font-display);font-size:22px;font-weight:700;}
.amp-toc-chapter-desc{font-family:var(--font-body);font-size:14px;color:#888888;margin-top:3px;}
.amp-toc-page{font-family:var(--font-display);font-size:18px;color:#D91E18;font-weight:700;}
.amp-footer{position:absolute;bottom:18px;left:60px;right:60px;display:flex;justify-content:space-between;font-family:var(--font-body);font-size:11px;color:#888888;}
.amp-split{display:flex;gap:36px;height:340px;}
.amp-split-left{flex:1.1;display:flex;flex-direction:column;gap:16px;}
.amp-split-right{flex:0.9;display:flex;flex-direction:column;gap:14px;}
.amp-split-img{width:100%;height:160px;object-fit:cover;border-radius:8px;}
.amp-split-bullets{margin:0;padding:0 0 0 18px;font-family:var(--font-body);font-size:15px;line-height:1.7;color:#2C2C2C;}
.amp-info-card{background:#FFFFFF;border-radius:8px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.06);}
.amp-info-card-title{font-family:var(--font-display);font-size:16px;font-weight:700;margin-bottom:4px;}
.amp-info-card-body{font-family:var(--font-body);font-size:13px;color:#555555;line-height:1.45;}
.amp-content-bottom{display:flex;gap:18px;margin-top:18px;}
.amp-content-stat{flex:1;background:#FFFFFF;border-radius:8px;padding:14px;text-align:center;}
.amp-content-stat-value{font-family:var(--font-display);font-size:26px;font-weight:700;color:#00A3A1;}
.amp-content-stat-label{font-family:var(--font-body);font-size:12px;color:#888888;margin-top:4px;}
.amp-gtm-flow{position:relative;height:260px;margin-top:10px;}
.amp-gtm-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3;}
.amp-gtm-node{font-family:var(--font-display);text-align:center;}
.amp-gtm-core{width:110px;height:110px;border-radius:50%;background:#E8762B;color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;box-shadow:0 4px 12px rgba(232,118,43,0.25);}
.amp-gtm-nodes{position:absolute;inset:0;}
.amp-gtm-outer{position:absolute;width:140px;background:#FFFFFF;border-radius:8px;padding:10px 8px;box-shadow:0 2px 6px rgba(0,0,0,0.06);}
.amp-gtm-outer[data-pos="0"]{left:50%;top:0;transform:translateX(-50%);}
.amp-gtm-outer[data-pos="1"]{right:5%;top:22%;}
.amp-gtm-outer[data-pos="2"]{right:8%;bottom:12%;}
.amp-gtm-outer[data-pos="3"]{left:8%;bottom:12%;}
.amp-gtm-outer[data-pos="4"]{left:5%;top:22%;}
.amp-gtm-node-title{font-size:14px;font-weight:700;color:#2C2C2C;}
.amp-gtm-node-sub{font-family:var(--font-body);font-size:11px;color:#888888;margin-top:2px;}
.amp-closing{position:relative;overflow:hidden;}
.amp-closing-content{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;height:100%;padding:60px;}
.amp-closing-title{font-family:var(--font-display);font-size:52px;font-weight:700;margin:0;line-height:1.1;}
.amp-closing-subtitle{font-family:var(--font-body);font-size:16px;color:#888888;margin-top:14px;max-width:700px;}
.amp-closing-cards{display:flex;gap:20px;margin-top:36px;}
.amp-closing-card{flex:1;background:#FFFFFF;border-radius:10px;padding:22px 18px;box-shadow:0 2px 8px rgba(0,0,0,0.06);text-align:left;min-width:180px;border-top:4px solid #00A3A1;}
.amp-closing-card:nth-child(2){border-top-color:#E8762B;}
.amp-closing-card:nth-child(3){border-top-color:#5B9BD5;}
.amp-closing-card-title{font-family:var(--font-display);font-size:18px;font-weight:700;margin-bottom:6px;}
.amp-closing-card-body{font-family:var(--font-body);font-size:13px;color:#555555;line-height:1.45;}
.amp-closing-prompt{font-family:var(--font-display);font-size:28px;font-weight:700;color:#D91E18;margin-top:34px;}
.amp-closing-footer{font-family:var(--font-body);font-size:12px;color:#888888;margin-top:18px;}
`

const TEMPLATE_CSS: Record<string, string> = {
  BRUTALIST_NEWSPAPER: BRUTALIST_CSS,
  MINIMAL_CORPORATE: CORP_CSS,
  DARK_TECH: TECH_CSS,
  COMIC_POP: COMIC_CSS,
  TECH_DUEL: TECH_DUEL_CSS,
  STARTUP_AMPLIFY: STARTUP_AMPLIFY_CSS,
}

// ── Build exact HTML per layout code (mirrors the skill.md renderers) ──────────

function buildSlideHtml(templateId: string, slide: SlideData): string {
  const t = slide.title ?? ''
  const sub = slide.subtitle ?? ''

  if (templateId === 'BRUTALIST_NEWSPAPER') {
    if (slide.layout === 'NEWSPAPER-COVER')
      return `
<div class="slide brutalist-editorial">
  <div class="news-grain"></div>
  <div class="news-header"><div>VOL. CXXVI No. 42,910</div><div>THE DAILY FORECAST</div><div>PRICE $1.50</div></div>
  <div class="news-main-title-container"><h1 class="news-mega-title">${t}</h1></div>
  <div class="news-hero-section">
    <div class="news-hero-left">
      <p class="editorial-lead">${sub}</p>
      <div class="news-author">Reported by AI Agent</div>
    </div>
    <div class="news-hero-right">${slide.image ? `<img class="news-hero-img" src="${slide.image}" />` : '<div class="news-img-placeholder"></div>'}</div>
  </div>
</div>`
    if (slide.layout === 'GLANCE')
      return `
<div class="slide brutalist-editorial">
  <div class="news-grain"></div>
  <div class="section-tag">AT A GLANCE</div>
  <h2 class="slide-title-brutalist">${t}</h2>
  <div class="glance-columns">
    <div class="glance-col-left">${slide.image ? `<img class="glance-img" src="${slide.image}" />` : '<div class="news-img-placeholder"></div>'}</div>
    <div class="glance-col-right">
      <ul class="brutalist-list">${(slide.bullets || []).map(b => `<li><span class="bullet-tag">◆</span> ${b}</li>`).join('')}</ul>
    </div>
  </div>
</div>`
    if (slide.layout === 'DATA-TABLE')
      return `
<div class="slide brutalist-editorial">
  <div class="news-grain"></div>
  <div class="section-tag">STATISTICAL BULLETIN</div>
  <h2 class="slide-title-brutalist">${t}</h2>
  <div class="stats-table-container">${(slide.stats || []).map(s => `<div class="stats-table-row"><div class="stat-big-val">${s.value}</div><div class="stat-labels-col"><div class="stat-row-label">${s.label}</div>${s.description ? `<div class="stat-row-desc">${s.description}</div>` : ''}</div></div>`).join('')}</div>
</div>`
    if (slide.layout === 'SPLIT-PANEL')
      return `
<div class="slide brutalist-editorial">
  <div class="news-grain"></div>
  <div class="section-tag">SPECIAL FOCUS</div>
  <h2 class="slide-title-brutalist">${t}</h2>
  <div class="split-panel-grid">
    <div class="panel-desc">
      <p class="panel-para">${slide.body || ''}</p>
      <ul class="panel-sub-list">
        ${(slide.bullets || []).map(b => `<li>• ${b}</li>`).join('')}
      </ul>
    </div>
    <div class="panel-visual">${slide.image ? `<img class="panel-img" src="${slide.image}" />` : '<div class="news-img-placeholder"></div>'}</div>
  </div>
</div>`
    if (slide.layout === 'QUOTE-STAMP')
      return `
<div class="slide brutalist-editorial flex-center-brutalist">
  <div class="news-grain"></div>
  <div class="quote-stamp-box">
    <div class="quote-large-mark">“</div>
    <p class="quote-text-brutalist">${slide.quote || slide.body || ''}</p>
    ${slide.author ? `<div class="quote-author-brutalist">— ${slide.author}</div>` : ''}
  </div>
</div>`
    if (slide.layout === 'DENSE-LIST')
      return `
<div class="slide brutalist-editorial">
  <div class="news-grain"></div>
  <div class="section-tag">INVESTIGATIVE BREAKDOWN</div>
  <h2 class="slide-title-brutalist">${t}</h2>
  <div class="dense-list-grid">
    ${(slide.items || [])
      .map(
        (item, idx) => `
    <div class="dense-list-card">
      <div class="card-num">${String(idx + 1).padStart(2, '0')}</div>
      <div class="card-title">${item.heading || ''}</div>
      <div class="card-desc">${item.text || ''}</div>
    </div>`,
      )
      .join('')}
  </div>
</div>`
    if (slide.layout === 'TIMELINE-GRID')
      return `
<div class="slide brutalist-editorial">
  <div class="news-grain"></div>
  <div class="section-tag">CHRONOLOGICAL DISPATCH</div>
  <h2 class="slide-title-brutalist">${t}</h2>
  <div class="timeline-row">
    ${(slide.steps || [])
      .map(
        (step, idx) => `
    <div class="timeline-node">
      <div class="node-year">${step.year || step.date || `PHASE ${idx + 1}`}</div>
      <div class="node-heading">${step.heading || step.title || ''}</div>
      <div class="node-text">${step.text || step.description || ''}</div>
    </div>`,
      )
      .join('')}
  </div>
</div>`
    if (slide.layout === 'CHART-EDITORIAL')
      return `
<div class="slide brutalist-editorial">
  <div class="news-grain"></div>
  <div class="section-tag">EDITORIAL CHART</div>
  <h2 class="slide-title-brutalist">${t}</h2>
  <div class="chart-editorial-container" style="display:flex;align-items:flex-end;justify-content:space-around;gap:12px;">
    ${[40, 55, 75, 60, 90, 65].map(h => `<div style="background:#CC2222;width:60px;height:${h}%;"></div>`).join('')}
  </div>
  ${slide.source ? `<div class="chart-source-brutalist">${slide.source}</div>` : ''}
</div>`
    if (slide.layout === 'SPLIT-CHART')
      return `
<div class="slide brutalist-editorial">
  <div class="news-grain"></div>
  <div class="section-tag">DATA DISPATCH</div>
  <h2 class="slide-title-brutalist">${t}</h2>
  <div class="split-chart-grid">
    <div class="split-chart-text">
      <ul class="brutalist-list">
        ${(slide.bullets || []).map(b => `<li><span class="bullet-tag">◆</span> ${b}</li>`).join('')}
      </ul>
    </div>
    <div class="split-chart-visual" style="display:flex;align-items:flex-end;justify-content:space-around;gap:12px;background:#EAE6D5;padding:16px;">
      ${[35, 50, 70, 95].map(h => `<div style="background:#CC2222;width:45px;height:${h}%;"></div>`).join('')}
    </div>
  </div>
  ${slide.source ? `<div class="chart-source-brutalist">${slide.source}</div>` : ''}
</div>`
    if (slide.layout === 'ICON-GRID')
      return `
<div class="slide brutalist-editorial">
  <div class="news-grain"></div>
  <div class="section-tag">${slide.badge || 'EDITORIAL GRID'}</div>
  <h2 class="slide-title-brutalist">${t}</h2>
  <div class="icon-editorial-grid">${(slide.items || []).map(item => `<div class="icon-editorial-card"><div class="icon-editorial-icon">${item.icon || '◆'}</div><div class="icon-editorial-heading">${item.heading}</div><div class="icon-editorial-text">${item.text}</div></div>`).join('')}</div>
</div>`
    if (slide.layout === 'COMPARE-PANEL')
      return `
<div class="slide brutalist-editorial">
  <div class="news-grain"></div>
  <div class="section-tag">COMPARE / DEBATE</div>
  <h2 class="slide-title-brutalist">${t}</h2>
  <div class="compare-panels-grid">
    <div class="compare-panel-left">
      <div class="compare-panel-title">${slide.leftTitle || 'POSITION A'}</div>
      <ul class="compare-panel-list">
        ${(slide.leftBullets || []).map(b => `<li>• ${b}</li>`).join('')}
      </ul>
    </div>
    <div class="compare-panel-right">
      <div class="compare-panel-title">${slide.rightTitle || 'POSITION B'}</div>
      <ul class="compare-panel-list">
        ${(slide.rightBullets || []).map(b => `<li>• ${b}</li>`).join('')}
      </ul>
    </div>
  </div>
</div>`
    if (slide.layout === 'IMPACT-STATEMENT')
      return `
<div class="slide brutalist-editorial impact-slide">
  <div class="news-grain"></div>
  ${slide.image ? `<img class="np-halftone-img" src="${slide.image}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1;" />` : ''}
  <div class="impact-overlay" style="position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(17,17,17,0.72);z-index:2;"></div>
  <div class="impact-content" style="position:relative;z-index:5;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:80px 120px;">
    <div class="impact-stamp" style="font-family:'Oswald',sans-serif;font-size:18px;font-weight:bold;letter-spacing:3px;color:#F3EFE0;background:#CC2222;padding:6px 16px;margin-bottom:30px;">BREAKING</div>
    <p class="impact-statement-text" style="font-family:'IBM Plex Serif',Georgia,serif;font-size:42px;font-weight:bold;line-height:1.2;color:#F3EFE0;margin:0 0 24px 0;">${slide.statement || slide.quote || slide.body || ''}</p>
    ${slide.attribution ? `<div class="impact-attribution" style="font-family:'Courier New',monospace;font-size:15px;font-weight:bold;color:#EAE6D5;text-transform:uppercase;letter-spacing:1.5px;">— ${slide.attribution}</div>` : ''}
  </div>
</div>`
    if (slide.layout === 'CLOSING-EDITORIAL')
      return `
<div class="slide brutalist-editorial flex-center-brutalist bg-black-editorial">
  <div class="news-grain"></div>
  <div class="closing-card-brutalist">
    <h1 class="closing-title">${t}</h1>
    <p class="closing-subtitle">${sub || 'End of Dispatch'}</p>
    <div class="closing-border-line"></div>
    <div class="closing-contact">AI Agent Dispatch</div>
  </div>
</div>`
  }

  if (templateId === 'MINIMAL_CORPORATE') {
    if (slide.layout === 'COVER')
      return `
<div class="slide corp-minimal">
  <div class="corp-cover-accent"></div>
  <div class="corp-content flex-center">
    <h1 class="corp-cover-title">${t}</h1>
    <div class="corp-cover-subtitle">${sub}</div>
    <div class="corp-cover-footer">Strategic Initiative | 2026</div>
  </div>
</div>`
    if (slide.layout === 'TOC')
      return `
<div class="slide corp-minimal">
  <div class="corp-content">
    <div class="corp-badge">AGENDA</div>
    <h2 class="corp-title">${t}</h2>
    <div class="corp-toc-grid">
      ${(slide.bullets || [])
        .map(
          (b, idx) => `
      <div class="corp-toc-item">
        <div class="corp-toc-num">${String(idx + 1).padStart(2, '0')}</div>
        <div class="corp-toc-text">${b}</div>
      </div>`,
        )
        .join('')}
    </div>
  </div>
</div>`
    if (slide.layout === 'BRIEF-EXPLAIN')
      return `
<div class="slide corp-minimal">
  <div class="corp-content">
    <div class="corp-badge">OVERVIEW</div>
    <h2 class="corp-title">${t}</h2>
    <div class="corp-brief-split">
      <div class="corp-brief-left">
        <p class="corp-brief-lead">${slide.body || ''}</p>
        <ul class="corp-bullets">${(slide.bullets || []).map(b => `<li>${b}</li>`).join('')}</ul>
      </div>
      <div class="corp-brief-right">${slide.image ? `<img class="corp-split-img" src="${slide.image}" />` : '<div class="corp-img-placeholder"></div>'}</div>
    </div>
  </div>
</div>`
    if (slide.layout === 'METRIC-ROW')
      return `
<div class="slide corp-minimal">
  <div class="corp-content">
    <div class="corp-badge">KEY METRICS</div>
    <h2 class="corp-title">${t}</h2>
    <div class="corp-metrics-row">${(slide.stats || []).map(s => `<div class="corp-metric-card"><div class="corp-metric-num">${s.value}</div><div class="corp-metric-label">${s.label}</div></div>`).join('')}</div>
  </div>
</div>`
    if (slide.layout === 'SPLIT-COL')
      return `
<div class="slide corp-minimal">
  <div class="corp-content">
    <div class="corp-badge">COMPARATIVE ANALYSIS</div>
    <h2 class="corp-title">${t}</h2>
    <div class="corp-split-columns">
      <div class="corp-column-card">
        <div class="corp-col-header">${slide.col1Title || 'OBJECTIVE A'}</div>
        <ul class="corp-bullets">
          ${(slide.col1Bullets || slide.bullets || []).map(b => `<li>${b}</li>`).join('')}
        </ul>
      </div>
      <div class="corp-column-card">
        <div class="corp-col-header">${slide.col2Title || 'OBJECTIVE B'}</div>
        <ul class="corp-bullets">
          ${(slide.col2Bullets || []).map(b => `<li>${b}</li>`).join('')}
        </ul>
      </div>
    </div>
  </div>
</div>`
    if (slide.layout === 'DENSE-GRID')
      return `
<div class="slide corp-minimal">
  <div class="corp-content">
    <div class="corp-badge">DETAILED BREAKDOWN</div>
    <h2 class="corp-title">${t}</h2>
    <div class="corp-dense-grid">
      ${(slide.items || [])
        .map(
          item => `
      <div class="corp-grid-card">
        <div class="corp-grid-title">${item.heading || ''}</div>
        <div class="corp-grid-desc">${item.text || ''}</div>
      </div>`,
        )
        .join('')}
    </div>
  </div>
</div>`
    if (slide.layout === 'TIMELINE-CLEAN')
      return `
<div class="slide corp-minimal">
  <div class="corp-content">
    <div class="corp-badge">MILESTONES</div>
    <h2 class="corp-title">${t}</h2>
    <div class="corp-timeline">
      <div class="corp-timeline-line"></div>
      ${(slide.steps || [])
        .map(
          (step, idx) => `
      <div class="corp-timeline-node">
        <div class="corp-node-dot"></div>
        <div class="corp-node-year">${step.year || step.date || `PHASE ${idx + 1}`}</div>
        <div class="corp-node-title">${step.heading || ''}</div>
        <div class="corp-node-desc">${step.text || ''}</div>
      </div>`,
        )
        .join('')}
    </div>
  </div>
</div>`
    if (slide.layout === 'CHART-CLEAN')
      return `
<div class="slide corp-minimal">
  <div class="corp-content">
    <h2 class="corp-title">${t}</h2>
    <div class="corp-chart-full" style="display:flex;align-items:flex-end;justify-content:space-around;gap:12px;">
      ${[42, 51, 63, 78, 85].map(h => `<div style="background:#004080;border-radius:4px 4px 0 0;width:60px;height:${h}%;"></div>`).join('')}
    </div>
    ${slide.source ? `<div class="corp-chart-source">${slide.source}</div>` : ''}
  </div>
</div>`
    if (slide.layout === 'SPLIT-CHART-CLEAN')
      return `
<div class="slide corp-minimal">
  <div class="corp-content">
    <h2 class="corp-title">${t}</h2>
    <div class="corp-split-chart">
      <div class="corp-split-chart-left">
        <ul class="corp-bullets">
          ${(slide.bullets || []).map(b => `<li>${b}</li>`).join('')}
        </ul>
      </div>
      <div class="corp-split-chart-right" style="display:flex;align-items:flex-end;justify-content:space-around;gap:12px;background:#FFFFFF;border:1px solid #E9ECEF;border-radius:8px;padding:16px;">
        ${[45, 60, 80, 95].map(h => `<div style="background:#004080;border-radius:4px 4px 0 0;width:45px;height:${h}%;"></div>`).join('')}
      </div>
    </div>
    ${slide.source ? `<div class="corp-chart-source">${slide.source}</div>` : ''}
  </div>
</div>`
    if (slide.layout === 'ICON-GRID-CLEAN')
      return `
<div class="slide corp-minimal">
  <div class="corp-content">
    <div class="corp-badge">${slide.badge || 'HIGHLIGHTS'}</div>
    <h2 class="corp-title">${t}</h2>
    <div class="corp-icon-grid">${(slide.items || []).map(item => `<div class="corp-icon-grid-item"><div class="corp-icon-grid-icon">${item.icon || '✓'}</div><div class="corp-icon-grid-heading">${item.heading}</div><div class="corp-icon-grid-text">${item.text}</div></div>`).join('')}</div>
  </div>
</div>`
    if (slide.layout === 'COMPARE-CLEAN')
      return `
<div class="slide corp-minimal">
  <div class="corp-content">
    <div class="corp-badge">COMPARE</div>
    <h2 class="corp-title">${t}</h2>
    <div class="corp-compare-row">
      <div class="corp-compare-panel corp-compare-left">
        <div class="corp-compare-title">${slide.leftTitle || 'Option A'}</div>
        <ul class="corp-bullets">
          ${(slide.leftBullets || []).map(b => `<li>${b}</li>`).join('')}
        </ul>
      </div>
      <div class="corp-compare-panel corp-compare-right">
        <div class="corp-compare-title">${slide.rightTitle || 'Option B'}</div>
        <ul class="corp-bullets">
          ${(slide.rightBullets || []).map(b => `<li>${b}</li>`).join('')}
        </ul>
      </div>
    </div>
  </div>
</div>`
    if (slide.layout === 'IMPACT-CLEAN')
      return `
<div class="slide corp-minimal corp-impact-slide">
  ${slide.image ? `<img class="corp-split-img" src="${slide.image}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1;" />` : ''}
  <div class="corp-impact-overlay"></div>
  <div class="corp-content corp-impact-content flex-center">
    <div class="corp-impact-statement">${slide.statement || ''}</div>
    ${slide.attribution ? `<div class="corp-impact-attribution">${slide.attribution}</div>` : ''}
  </div>
</div>`
    if (slide.layout === 'CLOSING-CLEAN')
      return `
<div class="slide corp-minimal corp-closing-bg">
  <div class="corp-content flex-center">
    <h1 class="corp-closing-title">${t}</h1>
    <p class="corp-closing-subtitle">${sub || 'Thank you for your attention'}</p>
    <div class="corp-closing-line"></div>
    <div class="corp-closing-footer">Strategic Initiative | 2026</div>
  </div>
</div>`
  }

  if (templateId === 'DARK_TECH') {
    if (slide.layout === 'TECH-COVER')
      return `
<div class="slide tech-glow bg-dark-slate">
  <div class="tech-grid-lines"></div>
  <div class="tech-content flex-center">
    <div class="terminal-header">[ SYSTEM INTAKE ACTIVE ]</div>
    <h1 class="tech-cover-title">${t}</h1>
    <div class="tech-cover-subtitle">&gt; ${sub}</div>
    <div class="tech-cover-footer">HOST: AGENT_SYSTEM // TIMESTAMP: 2026</div>
  </div>
</div>`
    if (slide.layout === 'DASHBOARD-GLANCE')
      return `
<div class="slide tech-glow bg-dark-slate">
  <div class="tech-grid-lines"></div>
  <div class="tech-content">
    <div class="tech-badge">SYS.OVERVIEW</div>
    <h2 class="tech-title">// ${t}</h2>
    <div class="tech-dashboard-grid">
      <div class="tech-dash-left">${slide.image ? `<img class="tech-dash-img" src="${slide.image}" />` : '<div class="tech-img-placeholder"></div>'}</div>
      <div class="tech-dash-right">
        <div class="terminal-box">
          <div class="terminal-bar"><span class="term-dot"></span><span class="term-dot"></span><span class="term-dot"></span></div>
          <ul class="tech-list">${(slide.bullets || []).map(b => `<li><span class="tech-prompt">&gt;</span> ${b}</li>`).join('')}</ul>
        </div>
      </div>
    </div>
  </div>
</div>`
    if (slide.layout === 'METRIC-GLOW')
      return `
<div class="slide tech-glow bg-dark-slate">
  <div class="tech-grid-lines"></div>
  <div class="tech-content">
    <div class="tech-badge">SYS.TELEMETRY</div>
    <h2 class="tech-title">// ${t}</h2>
    <div class="tech-metrics-row">${(slide.stats || []).map(s => `<div class="tech-metric-card"><div class="tech-metric-glow-bar"></div><div class="tech-metric-num">${s.value}</div><div class="tech-metric-label">&lt; ${s.label} &gt;</div></div>`).join('')}</div>
  </div>
</div>`
    if (slide.layout === 'GLOW-PANEL')
      return `
<div class="slide tech-glow bg-dark-slate">
  <div class="tech-grid-lines"></div>
  <div class="tech-content">
    <div class="tech-badge">SYS.MODULES</div>
    <h2 class="tech-title">// ${t}</h2>
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
</div>`
    if (slide.layout === 'CODE-SPLIT')
      return `
<div class="slide tech-glow bg-dark-slate">
  <div class="tech-grid-lines"></div>
  <div class="tech-content">
    <div class="tech-badge">SYS.CODE_EXEC</div>
    <h2 class="tech-title">// ${t}</h2>
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
</div>`
    if (slide.layout === 'FLOW-STEPS')
      return `
<div class="slide tech-glow bg-dark-slate">
  <div class="tech-grid-lines"></div>
  <div class="tech-content">
    <div class="tech-badge">SYS.PIPELINE</div>
    <h2 class="tech-title">// ${t}</h2>
    <div class="tech-pipeline-row">
      ${(slide.steps || [])
        .map(
          (step, idx) => `
      <div class="tech-pipeline-node">
        <div class="node-index">#0${idx + 1}</div>
        <div class="node-arrow-glow"></div>
        <div class="node-heading">${step.heading || ''}</div>
        <div class="node-text">${step.text || ''}</div>
      </div>`,
        )
        .join('')}
    </div>
  </div>
</div>`
    if (slide.layout === 'TECH-CHART')
      return `
<div class="slide tech-glow bg-dark-slate">
  <div class="tech-grid-lines"></div>
  <div class="tech-content">
    <div class="tech-badge">SYS.DATA_VIZ</div>
    <h2 class="tech-title">// ${t}</h2>
    <div class="tech-chart-full" style="display:flex;align-items:flex-end;justify-content:space-around;gap:10px;background:#1E293B;border:2px solid #334155;border-radius:4px;padding:16px;">
      ${[30, 45, 70, 60, 85, 95].map(h => `<div style="background:#06B6D4;border-radius:4px 4px 0 0;width:55px;height:${h * 0.7}%;opacity:0.85;"></div>`).join('')}
    </div>
    ${slide.source ? `<div class="tech-chart-source">${slide.source}</div>` : ''}
  </div>
</div>`
    if (slide.layout === 'TECH-SPLIT-CHART')
      return `
<div class="slide tech-glow bg-dark-slate">
  <div class="tech-grid-lines"></div>
  <div class="tech-content">
    <div class="tech-badge">SYS.ANALYSIS</div>
    <h2 class="tech-title">// ${t}</h2>
    <div class="tech-split-chart">
      <div class="tech-split-chart-text">
        <ul class="tech-list">
          ${(slide.bullets || []).map(b => `<li><span class="tech-prompt">></span> ${b}</li>`).join('')}
        </ul>
      </div>
      <div class="tech-split-chart-viz" style="display:flex;align-items:flex-end;justify-content:space-around;gap:10px;background:#1E293B;border:2px solid #334155;border-radius:4px;padding:16px;">
        ${[30, 45, 75, 95].map(h => `<div style="background:#06B6D4;border-radius:4px 4px 0 0;width:45px;height:${h * 0.7}%;opacity:0.85;"></div>`).join('')}
      </div>
    </div>
    ${slide.source ? `<div class="tech-chart-source">${slide.source}</div>` : ''}
  </div>
</div>`
    if (slide.layout === 'TECH-ICON-GRID')
      return `
<div class="slide tech-glow bg-dark-slate">
  <div class="tech-grid-lines"></div>
  <div class="tech-content">
    <div class="tech-badge">${slide.badge || 'SYS.MODULES'}</div>
    <h2 class="tech-title">// ${t}</h2>
    <div class="tech-icon-grid">${(slide.items || []).map(item => `<div class="tech-icon-card"><div class="tech-icon-symbol">${item.icon || '◈'}</div><div class="tech-icon-heading">${item.heading}</div><div class="tech-icon-text">${item.text}</div></div>`).join('')}</div>
  </div>
</div>`
    if (slide.layout === 'TECH-COMPARE')
      return `
<div class="slide tech-glow bg-dark-slate">
  <div class="tech-grid-lines"></div>
  <div class="tech-content">
    <div class="tech-badge">SYS.COMPARE</div>
    <h2 class="tech-title">// ${t}</h2>
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
</div>`
    if (slide.layout === 'TECH-IMPACT')
      return `
<div class="slide tech-glow bg-dark-slate tech-impact-slide">
  ${slide.image ? `<img class="tech-impact-bg" src="${slide.image}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1;" />` : ''}
  <div class="tech-impact-overlay"></div>
  <div class="tech-content flex-center">
    <div class="tech-impact-box">
      <div class="tech-impact-statement">“${slide.statement || ''}”</div>
      ${slide.attribution ? `<div class="tech-impact-attribution">> ${slide.attribution}</div>` : ''}
    </div>
  </div>
</div>`
    if (slide.layout === 'TECH-CLOSING')
      return `
<div class="slide tech-glow bg-dark-slate">
  <div class="tech-grid-lines"></div>
  <div class="tech-content flex-center">
    <div class="closing-box">
      <h1 class="tech-closing-title">${t}</h1>
      <p class="tech-closing-subtitle">&gt; ${sub}</p>
      <div class="closing-bracket">[ LOGOUT COMPLETE ]</div>
    </div>
  </div>
</div>`
  }

  if (templateId === 'COMIC_POP') {
    const badge = (slide.badge as string | undefined) ?? ''
    if (slide.layout === 'COMIC-COVER')
      return `
<div class="slide comic-pop">
  <div class="comic-dot-bg"></div>
  <div class="comic-cover-layout">
    <div class="comic-cover-left">
      ${badge ? `<div class="comic-badge-lg">${badge}</div>` : '<div class="comic-badge-lg">✦ PRESENTATION</div>'}
      <div class="comic-cover-title">${t}</div>
      <div class="comic-cover-subtitle">${sub}</div>
    </div>
    <div class="comic-cover-right">
      ${slide.image ? `<div class="comic-img-card"><img class="comic-img-fill" src="${slide.image}"></div>` : '<div class="comic-img-card comic-img-placeholder"><div class="comic-placeholder-icon">✦</div></div>'}
    </div>
  </div>
  <div class="comic-cover-stripe"></div>
</div>`
    if (slide.layout === 'COMIC-GLANCE')
      return `
<div class="slide comic-pop">
  <div class="comic-dot-bg"></div>
  <div class="comic-content">
    <div class="comic-badge">${badge || 'AT A GLANCE'}</div>
    <div class="comic-title">${t}</div>
    <div class="comic-glance-grid">
      <div class="comic-glance-left">
        ${slide.image ? `<div class="comic-img-card"><img class="comic-img-fill" src="${slide.image}"></div>` : '<div class="comic-img-card comic-img-placeholder"><div class="comic-placeholder-icon">✦</div></div>'}
      </div>
      <div class="comic-glance-right">
        <ul class="comic-list">${(slide.bullets || []).map((b, i) => `<li><span class="comic-bullet-num">${String(i + 1).padStart(2, '0')}</span><span class="comic-bullet-text">${b}</span></li>`).join('')}</ul>
      </div>
    </div>
  </div>
</div>`
    if (slide.layout === 'COMIC-STATS')
      return `
<div class="slide comic-pop">
  <div class="comic-dot-bg"></div>
  <div class="comic-content">
    <div class="comic-badge">${badge || 'KEY NUMBERS'}</div>
    <div class="comic-title">${t}</div>
    <div class="comic-stats-row">
      ${(slide.stats || []).map((s, i) => `<div class="comic-stat-card${i === 0 ? ' comic-stat-card--yellow' : ''}"><div class="comic-stat-value">${s.value}</div><div class="comic-stat-label">${s.label}</div>${s.description ? `<div class="comic-stat-desc">${s.description}</div>` : ''}</div>`).join('')}
    </div>
  </div>
</div>`
    if (slide.layout === 'COMIC-SPLIT')
      return `
<div class="slide comic-pop">
  <div class="comic-dot-bg"></div>
  <div class="comic-content">
    <div class="comic-badge">${badge || 'DEEP DIVE'}</div>
    <div class="comic-title">${t}</div>
    <div class="comic-split-layout">
      <div class="comic-split-text">
        ${(slide.body as string | undefined) ? `<p class="comic-body-lead">${slide.body}</p>` : ''}
        <ul class="comic-list">${(slide.bullets || []).map(b => `<li><span class="comic-bullet-dot">◆</span><span class="comic-bullet-text">${b}</span></li>`).join('')}</ul>
      </div>
      <div class="comic-split-visual">
        ${slide.image ? `<div class="comic-img-card"><img class="comic-img-fill" src="${slide.image}"></div>` : '<div class="comic-img-card comic-img-placeholder"><div class="comic-placeholder-icon">✦</div></div>'}
      </div>
    </div>
  </div>
</div>`
    if (slide.layout === 'COMIC-QUOTE')
      return `
<div class="slide comic-pop comic-quote-slide">
  <div class="comic-dot-bg"></div>
  <div class="comic-quote-center">
    <div class="comic-quote-box">
      <div class="comic-quote-mark">"</div>
      <p class="comic-quote-text">${(slide.quote as string | undefined) || (slide.body as string | undefined) || ''}</p>
      ${(slide.author as string | undefined) ? `<div class="comic-quote-author">— ${slide.author}</div>` : ''}
    </div>
  </div>
</div>`
    if (slide.layout === 'COMIC-FLOW')
      return `
<div class="slide comic-pop">
  <div class="comic-dot-bg"></div>
  <div class="comic-content">
    <div class="comic-badge">${badge || 'HOW IT WORKS'}</div>
    <div class="comic-title">${t}</div>
    <div class="comic-flow-row">
      ${(slide.steps || []).map((step, idx, arr) => `<div class="comic-flow-node"><div class="comic-flow-num">${String(idx + 1).padStart(2, '0')}</div><div class="comic-flow-card${idx % 2 !== 0 ? ' comic-flow-card--yellow' : ''}"><div class="comic-flow-heading">${step.heading || step.title || ''}</div><div class="comic-flow-text">${step.text || step.description || ''}</div></div>${idx < arr.length - 1 ? '<div class="comic-flow-arrow">→</div>' : ''}</div>`).join('')}
    </div>
  </div>
</div>`
    if (slide.layout === 'COMIC-CHART')
      return `
<div class="slide comic-pop">
  <div class="comic-dot-bg"></div>
  <div class="comic-content">
    <div class="comic-badge">${badge || 'THE DATA'}</div>
    <div class="comic-title">${t}</div>
    <div class="comic-chart-preview">
      ${[40, 55, 75, 90, 60, 82].map(h => `<div style="background:#FBCC00;border:2px solid #191919;border-radius:4px 4px 0 0;width:55px;height:${h}%;box-shadow:2px 2px 0 #191919;"></div>`).join('')}
    </div>
    ${(slide.source as string | undefined) ? `<div class="comic-chart-source">${slide.source}</div>` : ''}
  </div>
</div>`
    if (slide.layout === 'COMIC-SPLIT-CHART')
      return `
<div class="slide comic-pop">
  <div class="comic-dot-bg"></div>
  <div class="comic-content">
    <div class="comic-badge">${badge || 'DATA + CONTEXT'}</div>
    <div class="comic-title">${t}</div>
    <div class="comic-split-chart-layout">
      <div class="comic-split-chart-left">
        <ul class="comic-list">${(slide.bullets || []).map(b => `<li><span class="comic-bullet-dot">◆</span><span class="comic-bullet-text">${b}</span></li>`).join('')}</ul>
      </div>
      <div class="comic-split-chart-right">
        ${[35, 60, 80, 95].map(h => `<div style="background:#FBCC00;border:2px solid #191919;border-radius:4px 4px 0 0;width:45px;height:${h}%;box-shadow:2px 2px 0 #191919;"></div>`).join('')}
      </div>
    </div>
  </div>
</div>`
    if (slide.layout === 'COMIC-ICON-GRID')
      return `
<div class="slide comic-pop">
  <div class="comic-dot-bg"></div>
  <div class="comic-content">
    <div class="comic-badge">${badge || 'HIGHLIGHTS'}</div>
    <div class="comic-title">${t}</div>
    <div class="comic-icon-grid">
      ${(slide.items || [])
        .slice(0, 6)
        .map(
          (item, i) =>
            `<div class="comic-icon-card${i === 1 || i === 4 ? ' comic-icon-card--yellow' : ''}"><div class="comic-icon-symbol">${item.icon || '✦'}</div><div class="comic-icon-heading">${item.heading}</div><div class="comic-icon-text">${item.text}</div></div>`,
        )
        .join('')}
    </div>
  </div>
</div>`
    if (slide.layout === 'COMIC-COMPARE')
      return `
<div class="slide comic-pop">
  <div class="comic-dot-bg"></div>
  <div class="comic-content">
    <div class="comic-badge">${badge || 'COMPARE'}</div>
    <div class="comic-title">${t}</div>
    <div class="comic-compare-row">
      <div class="comic-compare-panel">
        <div class="comic-compare-header">${(slide.leftTitle as string | undefined) || 'Option A'}</div>
        <ul class="comic-list">${(slide.leftBullets || []).map(b => `<li><span class="comic-bullet-dot">◆</span><span class="comic-bullet-text">${b}</span></li>`).join('')}</ul>
      </div>
      <div class="comic-vs-badge">VS</div>
      <div class="comic-compare-panel comic-compare-panel--yellow">
        <div class="comic-compare-header">${(slide.rightTitle as string | undefined) || 'Option B'}</div>
        <ul class="comic-list">${(slide.rightBullets || []).map(b => `<li><span class="comic-bullet-dot">◆</span><span class="comic-bullet-text">${b}</span></li>`).join('')}</ul>
      </div>
    </div>
  </div>
</div>`
    if (slide.layout === 'COMIC-FLOWCHART')
      return `
<div class="slide comic-pop">
  <div class="comic-dot-bg"></div>
  <div class="comic-content">
    <div class="comic-badge">${badge || 'PROCESS MAP'}</div>
    <div class="comic-title">${t}</div>
    <div class="comic-flowchart-container">
      <div class="comic-fc-node comic-fc-node--start">Start</div>
      <div class="comic-fc-arrow">→</div>
      <div class="comic-fc-node">Research Topic</div>
      <div class="comic-fc-arrow">→</div>
      <div class="comic-fc-node comic-fc-node--decision"><span>Has Data?</span></div>
      <div class="comic-fc-arrow">→</div>
      <div class="comic-fc-node">Build Content</div>
      <div class="comic-fc-arrow">→</div>
      <div class="comic-fc-node comic-fc-node--end">Output</div>
    </div>
  </div>
</div>`
    if (slide.layout === 'COMIC-IMPACT')
      return `
<div class="slide comic-pop comic-impact-slide">
  <div class="comic-dot-bg" style="z-index:1;"></div>
  ${slide.image ? `<img class="comic-impact-bg" src="${slide.image}">` : '<div class="comic-impact-bg-placeholder"></div>'}
  <div class="comic-impact-overlay"></div>
  <div class="comic-impact-content">
    <div class="comic-impact-box">
      ${badge ? `<div class="comic-badge">${badge}</div>` : ''}
      <p class="comic-impact-statement">${(slide.statement as string | undefined) || (slide.quote as string | undefined) || (slide.body as string | undefined) || ''}</p>
      ${(slide.attribution as string | undefined) ? `<div class="comic-impact-attribution">— ${slide.attribution}</div>` : ''}
    </div>
  </div>
</div>`
    if (slide.layout === 'COMIC-CLOSING')
      return `
<div class="slide comic-pop comic-closing-slide">
  <div class="comic-dot-bg comic-dot-bg--dark"></div>
  <div class="comic-closing-card">
    <div class="comic-closing-badge">${badge || '✦ THANK YOU'}</div>
    <div class="comic-closing-title">${t}</div>
    <div class="comic-closing-subtitle">${sub || "Let's build something great together."}</div>
    <div class="comic-closing-divider"></div>
  </div>
</div>`
  }

  if (templateId === 'TECH_DUEL') {
    if (slide.layout === 'DUEL-COVER')
      return `
<div class="slide duel-dark duel-cover">
  ${slide.image ? `<img class="duel-cover-bg" src="${slide.image}" />` : ''}
  <div class="duel-cover-gradient"></div>
  <div class="duel-cover-bar"></div>
  <div class="duel-content duel-cover-content">
    <div class="duel-cover-kicker">Comparative Analysis</div>
    <h1 class="duel-cover-title">${t}</h1>
    <div class="duel-cover-subtitle">${sub}</div>
    <div class="duel-cover-date">2026</div>
    <div class="duel-cover-footer">Pitch AI</div>
  </div>
</div>`
    if (slide.layout === 'DUEL-TOC')
      return `
<div class="slide duel-dark duel-toc">
  <div class="duel-content">
    <div class="duel-toc-kicker">Executive Overview</div>
    <h2 class="duel-toc-title">${t}</h2>
    <div class="duel-toc-grid">
      ${(slide.sections || [])
        .map(
          s => `
      <div class="duel-toc-item">
        <div class="duel-toc-number">${s.number || ''}</div>
        <div class="duel-toc-text">
          <div class="duel-toc-section-title">${s.title}</div>
          <div class="duel-toc-section-desc">${s.description || ''}</div>
        </div>
      </div>`,
        )
        .join('')}
    </div>
  </div>
</div>`
    if (slide.layout === 'DUEL-PRODUCT-A')
      return `
<div class="slide duel-light duel-product">
  <div class="duel-accent-bar duel-bar-green"></div>
  <div class="duel-content duel-product-content">
    <h2 class="duel-product-title">${t}</h2>
    <div class="duel-product-tagline">${slide.tagline || ''}</div>
    <div class="duel-product-grid">
      <div class="duel-product-left">
        <div class="duel-product-image-wrap">
          ${slide.image ? `<img class="duel-product-image" src="${slide.image}" />` : '<div class="duel-product-image-placeholder"></div>'}
        </div>
        <div class="duel-product-badge duel-badge-green">${slide.badge || 'PRODUCT A'}</div>
      </div>
      <div class="duel-product-right">
        <div class="duel-product-specs">
          <div class="duel-specs-header">Key Specifications</div>
          ${(slide.specs || [])
            .map(
              s => `
          <div class="duel-spec-row">
            <span class="duel-spec-label">${s.label}:</span>
            <span class="duel-spec-value">${s.value}</span>
          </div>`,
            )
            .join('')}
        </div>
        <div class="duel-product-price">
          <div class="duel-price-label">Pricing</div>
          <div class="duel-price-value duel-green-text">${slide.price || ''}</div>
          <div class="duel-price-note">${slide.priceNote || ''}</div>
        </div>
        <div class="duel-product-differentiator" style="border-left-color:#76B900;">
          <div class="duel-diff-label duel-green-text">Key Differentiator</div>
          <div class="duel-diff-text">${slide.differentiator || ''}</div>
        </div>
      </div>
    </div>
    <div class="duel-product-bottom">
      <div class="duel-product-whatis">
        <div class="duel-bottom-header duel-green-text">What ${slide.productName || 'it'} is — and isn't</div>
        <p><strong>${slide.productName || 'Product A'} is:</strong> ${slide.whatItIs || ''}</p>
        <p><strong>${slide.productName || 'Product A'} is NOT:</strong> ${slide.whatItIsnt || ''}</p>
      </div>
    </div>
    ${slide.source ? `<div class="duel-source">${slide.source}</div>` : ''}
  </div>
</div>`
    if (slide.layout === 'DUEL-PRODUCT-B')
      return `
<div class="slide duel-light duel-product">
  <div class="duel-accent-bar duel-bar-red"></div>
  <div class="duel-content duel-product-content">
    <h2 class="duel-product-title">${t}</h2>
    <div class="duel-product-tagline">${slide.tagline || ''}</div>
    <div class="duel-product-grid">
      <div class="duel-product-left">
        <div class="duel-product-image-wrap">
          ${slide.image ? `<img class="duel-product-image" src="${slide.image}" />` : '<div class="duel-product-image-placeholder"></div>'}
        </div>
        <div class="duel-product-badge duel-badge-red">${slide.badge || 'PRODUCT B'}</div>
      </div>
      <div class="duel-product-right">
        <div class="duel-product-specs">
          <div class="duel-specs-header">Key Specifications</div>
          ${(slide.specs || [])
            .map(
              s => `
          <div class="duel-spec-row">
            <span class="duel-spec-label">${s.label}:</span>
            <span class="duel-spec-value">${s.value}</span>
          </div>`,
            )
            .join('')}
        </div>
        <div class="duel-product-price">
          <div class="duel-price-label">Pricing</div>
          <div class="duel-price-value duel-red-text">${slide.price || ''}</div>
          <div class="duel-price-note">${slide.priceNote || ''}</div>
        </div>
        <div class="duel-product-differentiator" style="border-left-color:#ED1C24;">
          <div class="duel-diff-label duel-red-text">Key Differentiator</div>
          <div class="duel-diff-text">${slide.differentiator || ''}</div>
        </div>
      </div>
    </div>
    <div class="duel-product-bottom">
      <div class="duel-product-whatis">
        <div class="duel-bottom-header duel-red-text">What ${slide.productName || 'it'} is — and isn't</div>
        <p><strong>${slide.productName || 'Product B'} is:</strong> ${slide.whatItIs || ''}</p>
        <p><strong>${slide.productName || 'Product B'} is NOT:</strong> ${slide.whatItIsnt || ''}</p>
      </div>
    </div>
    ${slide.source ? `<div class="duel-source">${slide.source}</div>` : ''}
  </div>
</div>`
    if (slide.layout === 'DUEL-CLOSING')
      return `
<div class="slide duel-dark duel-closing">
  ${slide.image ? `<img class="duel-closing-bg" src="${slide.image}" />` : ''}
  <div class="duel-closing-overlay"></div>
  <div class="duel-content duel-closing-content">
    <div class="duel-closing-bar"></div>
    <h2 class="duel-closing-title">${t}</h2>
    <div class="duel-closing-statement">${slide.statement || sub}</div>
    <div class="duel-closing-thankyou">Thank You</div>
    <div class="duel-closing-footer">
      <span>2026</span>
      <span class="duel-closing-separator">|</span>
      <span>Pitch AI</span>
    </div>
  </div>
</div>`
  }

  if (templateId === 'STARTUP_AMPLIFY') {
    if (slide.layout === 'AMP-COVER')
      return `
<div class="slide amp-cover">
  ${slide.image ? `<img class="amp-cover-bg" src="${slide.image}" />` : ''}
  <div class="amp-rule amp-rule-top"></div>
  <div class="amp-cover-content">
    <h1 class="amp-cover-title">${t}</h1>
    <div class="amp-cover-subtitle">${sub}</div>
    <div class="amp-cover-meta">Pitch AI | 2026</div>
    <div class="amp-cover-stats">
      ${(slide.stats || [])
        .map(
          s => `
      <div class="amp-cover-stat">
        <div class="amp-cover-stat-value">${s.value}</div>
        <div class="amp-cover-stat-label">${s.label}</div>
      </div>`,
        )
        .join('')}
    </div>
  </div>
  <div class="amp-rule amp-rule-bottom"></div>
</div>`
    if (slide.layout === 'AMP-TOC')
      return `
<div class="slide amp-toc">
  <div class="amp-content">
    <h2 class="amp-toc-title">CONTENTS</h2>
    <div class="amp-toc-rows">
      ${(slide.sections || [])
        .map(
          s => `
      <div class="amp-toc-row">
        <div class="amp-toc-num">${s.number || ''}</div>
        <div class="amp-toc-text">
          <div class="amp-toc-chapter-title">${s.title}</div>
          <div class="amp-toc-chapter-desc">${s.description || ''}</div>
        </div>
        <div class="amp-toc-page">${s.page || ''}</div>
      </div>`,
        )
        .join('')}
    </div>
    <div class="amp-footer"><span>Pitch AI | 2026</span><span class="amp-footer-page">02</span></div>
  </div>
</div>`
    if (slide.layout === 'AMP-CONTENT-SPLIT')
      return `
<div class="slide amp-content">
  <div class="amp-content-header">
    <h2 class="amp-slide-title">${t}</h2>
    <div class="amp-slide-subtitle">${sub}</div>
  </div>
  <div class="amp-split">
    <div class="amp-split-left">
      ${slide.image ? `<img class="amp-split-img" src="${slide.image}" />` : ''}
      ${(() => {
        const bullets = slide.bullets || []
        return bullets.length > 0
          ? `
      <ul class="amp-split-bullets">
        ${bullets.map(b => `<li>${b}</li>`).join('')}
      </ul>`
          : ''
      })()}
    </div>
    <div class="amp-split-right">
      ${(slide.cards || [])
        .map(
          c => `
      <div class="amp-info-card">
        <div class="amp-info-card-title">${c.title}</div>
        <div class="amp-info-card-body">${c.body || c.text || ''}</div>
      </div>`,
        )
        .join('')}
    </div>
  </div>
  <div class="amp-content-bottom">
    ${(slide.stats || [])
      .map(
        s => `
    <div class="amp-content-stat">
      <div class="amp-content-stat-value">${s.value}</div>
      <div class="amp-content-stat-label">${s.label}</div>
    </div>`,
      )
      .join('')}
  </div>
  ${slide.source ? `<div class="amp-source">${slide.source}</div>` : ''}
</div>`
    if (slide.layout === 'AMP-GTM-FLOW')
      return `
<div class="slide amp-content">
  <div class="amp-content-header">
    <h2 class="amp-slide-title">${t}</h2>
    <div class="amp-slide-subtitle">${sub}</div>
  </div>
  <div class="amp-gtm-flow">
    <div class="amp-gtm-center">
      <div class="amp-gtm-node amp-gtm-core">${slide.centerLabel || 'GTM'}</div>
    </div>
    <div class="amp-gtm-nodes">
      ${(slide.nodes || [])
        .map(
          (n, i) => `
      <div class="amp-gtm-node amp-gtm-outer" data-pos="${i}">
        <div class="amp-gtm-node-title">${n.title}</div>
        <div class="amp-gtm-node-sub">${n.subtitle || n.desc || ''}</div>
      </div>`,
        )
        .join('')}
    </div>
  </div>
  ${slide.source ? `<div class="amp-source">${slide.source}</div>` : ''}
</div>`
    if (slide.layout === 'AMP-CLOSING')
      return `
<div class="slide amp-closing">
  <div class="amp-rule amp-rule-top"></div>
  <div class="amp-closing-content">
    <h2 class="amp-closing-title">${t}</h2>
    <div class="amp-closing-subtitle">${sub}</div>
    <div class="amp-closing-cards">
      ${(slide.nextSteps || [])
        .map(
          n => `
      <div class="amp-closing-card">
        <div class="amp-closing-card-title">${n.title}</div>
        <div class="amp-closing-card-body">${n.body || n.text || ''}</div>
      </div>`,
        )
        .join('')}
    </div>
    <div class="amp-closing-prompt">${slide.prompt || 'Questions?'}</div>
    <div class="amp-closing-footer">Pitch AI | 2026</div>
  </div>
  <div class="amp-rule amp-rule-bottom"></div>
</div>`
  }

  // Fallback
  return `<div class="slide" style="display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:20px;color:#888;background:#111;">${slide.layout}</div>`
}

const TEMPLATES: Template[] = [
  {
    id: 'BRUTALIST_NEWSPAPER',
    name: 'Brutalist AI Newspaper 2026',
    description:
      'High-contrast editorial style inspired by modern brutalist aesthetics and retro-futuristic news layouts. Uses vintage paper texture, strict black/red highlights, halftone photo filters, thick borders, and now chart data slides.',
    tags: ['Brutalist', 'Editorial', 'Bold', 'Retro-Futuristic', 'Charts'],
    theme: {
      bg: '#F3EFE0',
      primary: '#CC2222',
      accent: '#111111',
      secondary: '#444444',
      fonts: 'IBM Plex Serif + Oswald + Courier',
      imageMode: 'Grayscale Halftone Contrast',
    },
    previewSlides: [
      {
        id: 1,
        title: 'THE AI REVOLUTION',
        subtitle: 'HOW GENERATIVE MODELS ARE REDEFINING AESTHETICS IN 2026',
        layout: 'NEWSPAPER-COVER',
        image:
          'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=600&q=80',
      },
      {
        id: 2,
        title: 'CHRONICLES & CORNERS',
        bullets: [
          'Halftone image filtering for high contrast',
          'Thick grid lines and strict layout divisions',
          'Monospaced labels paired with serif headlines',
        ],
        layout: 'GLANCE',
        image:
          'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=600&q=80',
      },
      {
        id: 3,
        title: 'STATISTICAL BULLETINS',
        stats: [
          { value: '94%', label: 'Retention Rate', description: 'Monthly rolling user cohorts' },
          { value: '2.4x', label: 'Growth Speed', description: 'Year-over-year revenue expansion' },
          { value: '$1.2B', label: 'Market Cap', description: 'Consolidated network valuation' },
        ],
        layout: 'DATA-TABLE',
      },
      {
        id: 4,
        title: 'SPECIAL EDITORIAL FOCUS',
        body: 'This layout showcases a split panel with structured columns. Perfect for detailed explanations accompanied by high-contrast visual elements.',
        bullets: ['Grotesque body font', 'Rigid grid borders', 'Halftone news-grain filter'],
        image:
          'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=600&q=80',
        layout: 'SPLIT-PANEL',
      },
      {
        id: 5,
        quote: 'Design is not just what it looks like and feels like. Design is how it works.',
        author: 'Steve Jobs',
        layout: 'QUOTE-STAMP',
      },
      {
        id: 6,
        title: 'INVESTIGATIVE PILLARS',
        items: [
          { heading: 'Editorial Line', text: 'Classic newspaper formatting guidelines.' },
          { heading: 'Visual Balance', text: 'Stark contrasts and solid lines.' },
          { heading: 'Grid Systems', text: 'Structured column widths.' },
        ],
        layout: 'DENSE-LIST',
      },
      {
        id: 7,
        title: 'CHRONOLOGICAL DISPATCH',
        steps: [
          { year: '2024', heading: 'Automated Layouts', text: 'Initial layout engines compiled.' },
          {
            year: '2025',
            heading: 'Visual QA Integration',
            text: 'Realtime visual feedback loops.',
          },
          { year: '2026', heading: 'Halftone Filtering', text: 'Vintage print styles unlocked.' },
        ],
        layout: 'TIMELINE-GRID',
      },
      {
        id: 8,
        title: 'EDITORIAL CHART: ADOPTION TRENDS',
        chartType: 'column',
        chartData: {
          labels: ['2022', '2023', '2024', '2025', '2026'],
          datasets: [{ label: 'AI Adoption %', data: [12, 28, 47, 68, 84] }],
        },
        source: 'Source: Industry Report 2026',
        layout: 'CHART-EDITORIAL',
      },
      {
        id: 9,
        title: 'DATA DISPATCH ANALYSIS',
        bullets: [
          'Steady market share expansion',
          'Outperformed standard indices',
          'Strong consumer interest',
        ],
        chartType: 'column',
        chartData: {
          labels: ['Q1', 'Q2', 'Q3', 'Q4'],
          datasets: [{ label: 'Margin %', data: [20, 24, 28, 35] }],
        },
        source: 'Source: Financial Dispatch',
        layout: 'SPLIT-CHART',
      },
      {
        id: 10,
        title: 'KEY EDITORIAL PILLARS',
        badge: 'FRAMEWORK',
        items: [
          {
            icon: '◆',
            heading: 'Contrast',
            text: 'High-contrast halftone imagery for instant focus.',
          },
          {
            icon: '◆',
            heading: 'Grid',
            text: "Strict column divisions that guide the reader's eye.",
          },
          {
            icon: '◆',
            heading: 'Typography',
            text: 'Serif headlines paired with monospace labels.',
          },
          {
            icon: '◆',
            heading: 'Data',
            text: 'Charts rendered directly inside the editorial frame.',
          },
          { icon: '◆', heading: 'Impact', text: 'Full-bleed statements for memorable takeaways.' },
          { icon: '◆', heading: 'Compare', text: 'Side-by-side panels for debate and contrast.' },
        ],
        layout: 'ICON-GRID',
      },
      {
        id: 11,
        title: 'EDITORIAL POSITIONING',
        leftTitle: 'PROPOSAL A: CLASSIC PRINT',
        leftBullets: ['Higher tactile feedback', 'Timeless aesthetics', 'Limited dynamic scaling'],
        rightTitle: 'PROPOSAL B: AUTO-NODE',
        rightBullets: [
          'Infinite scaling parameters',
          'Instantly generated',
          'Reduced raw production costs',
        ],
        layout: 'COMPARE-PANEL',
      },
      {
        id: 12,
        statement: 'THE NEWS HAS BEEN FULLY AUTOMATED.',
        attribution: 'AI Chief Editor',
        image:
          'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=600&q=80',
        layout: 'IMPACT-STATEMENT',
      },
      {
        id: 13,
        title: 'END OF DISPATCH',
        subtitle: 'Thank you for reading the Daily Forecast',
        layout: 'CLOSING-EDITORIAL',
      },
    ],
  },
  {
    id: 'MINIMAL_CORPORATE',
    name: 'Minimal Corporate',
    description:
      'Sleek, high-end corporate presentation template with a light color scheme, geometric sans-serif fonts, thin elegant borders, clean data callouts, and chart-driven data slides.',
    tags: ['Clean', 'Professional', 'Corporate', 'Minimalist', 'Charts'],
    theme: {
      bg: '#F8F9FA',
      primary: '#004080',
      accent: '#1A1A1A',
      secondary: '#555555',
      fonts: 'Montserrat + Inter',
      imageMode: 'Natural Soft Light Stock',
    },
    previewSlides: [
      {
        id: 1,
        title: 'STRATEGIC INITIATIVE',
        subtitle: 'Annual Growth Plan and Market Analysis',
        layout: 'COVER',
      },
      {
        id: 2,
        title: 'AGENDA & DISCUSSION',
        bullets: [
          'Executive Overview',
          'Key Metrics & Telemetry',
          'Comparative Analysis',
          'Pillars of Growth',
        ],
        layout: 'TOC',
      },
      {
        id: 3,
        title: 'OUR CORE OBJECTIVES',
        body: 'We aim to align our core infrastructure with carbon-neutral targets, utilizing global telemetry data loops.',
        bullets: [
          'Focus on sustainable, carbon-neutral supply chain systems.',
          'Leverage edge computing capabilities for global telemetry data.',
          'Deliver seamless micro-service performance indicators.',
        ],
        layout: 'BRIEF-EXPLAIN',
        image:
          'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80',
      },
      {
        id: 4,
        title: 'ANNUAL PERFORMANCE METRICS',
        stats: [
          { value: '+45%', label: 'Year-Over-Year Revenue' },
          { value: '< 10ms', label: 'API Response Latency' },
          { value: '99.9%', label: 'Uptime SLA' },
        ],
        layout: 'METRIC-ROW',
      },
      {
        id: 5,
        title: 'BALANCED STRATEGY',
        col1Title: 'ORGANIC GROWTH',
        col1Bullets: [
          'Expand current marketing',
          'Increase customer retention',
          'Optimize internal processes',
        ],
        col2Title: 'ACQUISITIVE EXPANSION',
        col2Bullets: [
          'Identify high-value SaaS products',
          'Integrate developer talent',
          'Acquire market share',
        ],
        layout: 'SPLIT-COL',
      },
      {
        id: 6,
        title: 'DETAILED OPERATIONS',
        items: [
          {
            heading: 'Operational Excellence',
            text: 'Streamline core processes across all regions.',
          },
          { heading: 'Customer Centricity', text: 'Embed feedback loops into product releases.' },
          { heading: 'Data-Driven Decisions', text: 'Real-time dashboards for every function.' },
        ],
        layout: 'DENSE-GRID',
      },
      {
        id: 7,
        title: 'HORIZONTAL MILESTONES',
        steps: [
          { year: 'Q1 2026', heading: 'Phase 1 Launch', text: 'Deploy core microservices.' },
          {
            year: 'Q2 2026',
            heading: 'Telemetry Integration',
            text: 'Hook up global telemetry dashboards.',
          },
          {
            year: 'Q3 2026',
            heading: 'Compliance Review',
            text: 'Obtain security certifications.',
          },
        ],
        layout: 'TIMELINE-CLEAN',
      },
      {
        id: 8,
        title: 'MARKET GROWTH OUTLOOK',
        chartType: 'line',
        chartData: {
          labels: ['Q1', 'Q2', 'Q3', 'Q4'],
          datasets: [
            { label: 'Revenue ($M)', data: [4.2, 5.1, 6.3, 7.8] },
            { label: 'Target ($M)', data: [4.0, 5.0, 6.0, 7.5] },
          ],
        },
        source: 'Source: Internal Forecast 2026',
        layout: 'CHART-CLEAN',
      },
      {
        id: 9,
        title: 'PERFORMANCE ANALYSIS',
        bullets: [
          'Strong growth across Q3/Q4',
          'SLA remains at 99.9%',
          'Scale matches forecast targets',
        ],
        chartType: 'line',
        chartData: {
          labels: ['Q1', 'Q2', 'Q3', 'Q4'],
          datasets: [{ label: 'SLA Uptime', data: [99.2, 99.5, 99.8, 99.9] }],
        },
        source: 'Source: Operations Report',
        layout: 'SPLIT-CHART-CLEAN',
      },
      {
        id: 10,
        title: 'STRATEGIC PILLARS',
        badge: 'FRAMEWORK',
        items: [
          {
            icon: '✓',
            heading: 'Operational Excellence',
            text: 'Streamline core processes across all regions.',
          },
          {
            icon: '✓',
            heading: 'Customer Centricity',
            text: 'Embed feedback loops into product releases.',
          },
          {
            icon: '✓',
            heading: 'Data-Driven Decisions',
            text: 'Use real-time dashboards for every function.',
          },
          {
            icon: '✓',
            heading: 'Sustainable Growth',
            text: 'Balance margin expansion with ESG goals.',
          },
          { icon: '✓', heading: 'Talent Density', text: 'Hire and retain top-tier specialists.' },
          {
            icon: '✓',
            heading: 'Global Scale',
            text: 'Expand into priority markets with partners.',
          },
        ],
        layout: 'ICON-GRID-CLEAN',
      },
      {
        id: 11,
        title: 'COMPARATIVE MATRIX',
        leftTitle: 'STRATEGY A: SCALE OUT',
        leftBullets: [
          'Lower infrastructure initial costs',
          'Simpler design architecture',
          'Requires wider orchestration scale',
        ],
        rightTitle: 'STRATEGY B: CONSOLIDATE',
        rightBullets: [
          'High initial optimization costs',
          'Extremely low runtime latency',
          'Maximum control over node data',
        ],
        layout: 'COMPARE-CLEAN',
      },
      {
        id: 12,
        statement: 'EFFICIENCY IS OUR CORE STRENGTH.',
        attribution: 'CEO Statement',
        image:
          'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80',
        layout: 'IMPACT-CLEAN',
      },
      {
        id: 13,
        title: 'STRATEGIC PARTNERSHIPS',
        subtitle: 'Let us build the future together',
        layout: 'CLOSING-CLEAN',
      },
    ],
  },
  {
    id: 'DARK_TECH',
    name: 'Dark Tech / Neon Glow',
    description:
      'Sophisticated dark theme with neon cyan and green accents, glowing border lines, and modern tech sans fonts. Best for AI, SaaS, and cybersecurity. Now includes chart telemetry, icon grids, and impact slides.',
    tags: ['Dark Mode', 'Technology', 'Cybersecurity', 'SaaS', 'Charts'],
    theme: {
      bg: '#0F172A',
      primary: '#06B6D4',
      accent: '#10B981',
      secondary: '#94A3B8',
      fonts: 'Share Tech Mono + JetBrains Mono',
      imageMode: 'Cyan Hue High-Contrast Tint',
    },
    previewSlides: [
      {
        id: 1,
        title: 'CYBER INFRASTRUCTURE',
        subtitle: 'Security and AI Ops Dashboard',
        layout: 'TECH-COVER',
      },
      {
        id: 2,
        title: 'LOGICAL NODE ANALYSIS',
        bullets: [
          'Realtime tracing across all microservice instances.',
          'Anomaly scoring powered by local clustering algorithms.',
          'Active threat mitigation triggers upon token decay.',
        ],
        layout: 'DASHBOARD-GLANCE',
        image:
          'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=600&q=80',
      },
      {
        id: 3,
        title: 'SYSTEM TELEMETRY SUMMARY',
        stats: [
          { value: '99.99%', label: 'System Uptime Rate' },
          { value: '42ms', label: 'Mean Mitigation Time' },
          { value: '0', label: 'Critical Breaches' },
        ],
        layout: 'METRIC-GLOW',
      },
      {
        id: 4,
        title: 'MODULE COMPARISON',
        body: 'System modules run in isolation. Node perimeter scans check API gateways continuously to prevent buffer leakage.',
        bullets: [
          'Dockerized isolation layers',
          'Memory capped at 256MB per node',
          'Continuous TLS handshake audits',
        ],
        layout: 'GLOW-PANEL',
      },
      {
        id: 5,
        title: 'SYSTEM INITIALIZATION',
        codeSnippet:
          '// Initialize node client:\nconst sys = new SystemNodeClient();\nawait sys.connect({ secure: true });\nconsole.log("> Client active.");',
        bullets: [
          'Loads encrypted credentials',
          'Establishes SSH tunnel endpoints',
          'Generates runtime diagnostics',
        ],
        layout: 'CODE-SPLIT',
      },
      {
        id: 6,
        title: 'THREAT INTAKE PIPELINE',
        steps: [
          { heading: 'Endpoint Scan', text: 'Analyze incoming packet headers.' },
          { heading: 'AI Classification', text: 'Evaluate signature patterns.' },
          { heading: 'Isolation Trigger', text: 'Sandbox anomalous nodes.' },
        ],
        layout: 'FLOW-STEPS',
      },
      {
        id: 7,
        title: 'THREAT DETECTION TRENDS',
        chartType: 'area',
        chartData: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [{ label: 'Blocked Intrusions', data: [120, 190, 300, 250, 420, 510] }],
        },
        source: 'Source: Security Ops 2026',
        layout: 'TECH-CHART',
      },
      {
        id: 8,
        title: 'LATENCY TELEMETRY ANALYSIS',
        bullets: [
          'Optimized query path in Q2',
          'Replaced database indices',
          'Memory caching layer engaged',
        ],
        chartType: 'area',
        chartData: {
          labels: ['1s', '2s', '3s', '4s', '5s'],
          datasets: [{ label: 'Latency (ms)', data: [12, 10, 8, 42, 11] }],
        },
        source: 'Source: Telemetry Logs',
        layout: 'TECH-SPLIT-CHART',
      },
      {
        id: 9,
        title: 'DEFENSE MODULES',
        badge: 'SYS.MODULES',
        items: [
          {
            icon: '◈',
            heading: 'Perimeter Scan',
            text: 'Continuous port and endpoint reconnaissance.',
          },
          {
            icon: '◈',
            heading: 'Behavioral AI',
            text: 'Detect anomalies in user and machine traffic.',
          },
          { icon: '◈', heading: 'Auto-Response', text: 'Trigger countermeasures in milliseconds.' },
          { icon: '◈', heading: 'Threat Intel', text: 'Ingest global indicators of compromise.' },
          { icon: '◈', heading: 'Audit Logs', text: 'Immutable records for compliance review.' },
          { icon: '◈', heading: 'API Shield', text: 'Rate limiting and schema validation.' },
        ],
        layout: 'TECH-ICON-GRID',
      },
      {
        id: 10,
        title: 'SYSTEM BOUNDARY PROTOCOLS',
        leftTitle: 'PROTOCOL ALPHA',
        leftBullets: [
          'Heavy payload encryption standard',
          'Strict multi-party handshake',
          'Requires high compute overhead',
        ],
        rightTitle: 'PROTOCOL BETA',
        rightBullets: [
          'Lightweight UDP packet transmission',
          'Low overhead signature check',
          'Optimized for high-throughput nodes',
        ],
        layout: 'TECH-COMPARE',
      },
      {
        id: 11,
        statement: 'SECURE BY DEFAULT. RESILIENT BY DESIGN.',
        attribution: 'CISO Directive',
        image:
          'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=600&q=80',
        layout: 'TECH-IMPACT',
      },
      {
        id: 12,
        title: 'DISCONNECTING SYSTEM',
        subtitle: 'Connection closed. Session terminated safely.',
        layout: 'TECH-CLOSING',
      },
    ],
  },
  {
    id: 'COMIC_POP',
    name: 'Marblism Comic Pop',
    description:
      'Neo-brutalist comic-book inspired template referencing Marblism.com — warm cream #FFFDF5 canvas with bold yellow #FBCC00 accent, thick 2.5px ink borders with hard 4px drop shadows, handwritten Dancing Script cursive body, Bebas Neue compressed display titles, and a radial dot pattern background. Includes a unique SVG-based flowchart layout. All images generated exclusively via Google Imagen.',
    tags: ['Comic', 'Neo-Brutalist', 'Handwritten', 'Marblism', 'Flowchart'],
    theme: {
      bg: '#FFFDF5',
      primary: '#FBCC00',
      accent: '#191919',
      secondary: '#404040',
      fonts: 'Bebas Neue + Dancing Script + Nunito',
      imageMode: 'Google Imagen (Bold Flat Illustration)',
    },
    previewSlides: [
      {
        id: 1,
        title: 'THE FUTURE OF AI EMPLOYEES',
        subtitle: 'How intelligent agents are transforming how small businesses scale',
        badge: '✦ KEYNOTE 2026',
        layout: 'COMIC-COVER',
        image: '/templates/comic_cover_preview.png',
      },
      {
        id: 2,
        title: 'WHAT WE COVER TODAY',
        badge: 'AT A GLANCE',
        bullets: [
          'The rise of AI employees in modern business',
          'Key metrics and adoption statistics',
          'How to build your AI-powered workforce',
          'Real-world case studies and results',
          'Getting started in 30 days',
        ],
        layout: 'COMIC-GLANCE',
        image: '/templates/comic_glance_preview.png',
      },
      {
        id: 3,
        title: 'BY THE NUMBERS',
        badge: 'KEY METRICS',
        stats: [
          {
            value: '40K+',
            label: 'Businesses Using AI',
            description: 'Across 50+ countries worldwide',
          },
          {
            value: '50hrs',
            label: 'Saved Per Month',
            description: 'Average time reclaimed per business',
          },
          {
            value: '4.8★',
            label: 'Customer Rating',
            description: 'Based on 965+ verified reviews',
          },
        ],
        layout: 'COMIC-STATS',
        image: '/templates/comic_stats_preview.png',
      },
      {
        id: 4,
        title: 'MEET YOUR AI TEAM',
        badge: 'AI EMPLOYEES',
        items: [
          {
            icon: '📧',
            heading: 'Eva — Executive Assistant',
            text: 'Handles inbox, calendar, and meeting notes automatically.',
          },
          {
            icon: '📱',
            heading: 'Sonny — Community Manager',
            text: 'Turns your social media into a lead-generating machine.',
          },
          {
            icon: '🎯',
            heading: 'Stan — Lead Generation',
            text: 'Finds leads, runs outreach, and follows up relentlessly.',
          },
          {
            icon: '✍️',
            heading: 'Penny — SEO Expert',
            text: 'Writes SEO-optimized blogs that Google loves.',
          },
          {
            icon: '📞',
            heading: 'Rachel — Receptionist',
            text: 'Answers calls and qualifies leads while you focus.',
          },
          {
            icon: '⚖️',
            heading: 'Linda — Legal Assistant',
            text: 'Drafts contracts and answers legal questions instantly.',
          },
        ],
        layout: 'COMIC-ICON-GRID',
        image: '/templates/comic_icon_grid_preview.png',
      },
      {
        id: 5,
        title: 'HOW THE PROCESS WORKS',
        badge: 'PROCESS MAP',
        layout: 'COMIC-FLOWCHART',
        image: '/templates/comic_flowchart_preview.png',
      },
    ],
  },
  {
    id: 'TECH_DUEL',
    name: 'Tech Duel Comparison',
    description:
      'High-contrast two-sided comparison deck inspired by the NVIDIA DGX Spark vs. AMD Threadripper PRO 7000 presentation. Uses deep obsidian dark slides, clean light content slides, duel green (#76B900) for Product A and duel red (#ED1C24) for Product B. Perfect for head-to-head technology, product, platform, or concept comparisons with spec sheets, architecture breakdowns, benchmarks, and decision matrices.',
    tags: ['Comparison', 'Technology', 'Duel', 'Product', 'Benchmarks'],
    theme: {
      bg: '#0D1117',
      primary: '#76B900',
      accent: '#ED1C24',
      secondary: '#F6F7F9',
      fonts: 'Outfit + Quattrocento Sans',
      imageMode: 'Pinterest + Gemini fallback',
    },
    previewSlides: [
      {
        id: 1,
        title: 'DGX SPARK VS. THREADRIPPER',
        subtitle: 'The Battle for Desktop AI Supremacy',
        layout: 'DUEL-COVER',
        image: '/templates/tech_duel_cover_preview.png',
      },
      {
        id: 2,
        title: 'TABLE OF CONTENTS',
        sections: [
          {
            number: '01',
            title: 'Product Overview',
            description: 'Two approaches to desktop supercomputing',
          },
          {
            number: '02',
            title: 'Architecture Deep Dive',
            description: 'ARM SoC vs x86 Zen 4 design philosophies',
          },
          {
            number: '03',
            title: 'Specs & Performance',
            description: 'Head-to-head benchmarks and real-world numbers',
          },
          {
            number: '04',
            title: 'Use Cases & Workloads',
            description: 'Matching platforms to the right workloads',
          },
          {
            number: '05',
            title: 'Price & Value Analysis',
            description: 'Total cost of ownership and value verdict',
          },
        ],
        layout: 'DUEL-TOC',
        image: '/templates/tech_duel_toc_preview.png',
      },
      {
        id: 3,
        title: 'DGX Spark packs 128GB unified memory into a 1.8L chassis',
        badge: 'NVIDIA DGX SPARK',
        productName: 'NVIDIA DGX Spark',
        price: '$4,699',
        specs: [
          { label: 'SoC', value: 'GB10 Grace Blackwell' },
          { label: 'CPU', value: '20-core ARM' },
          { label: 'GPU', value: 'Blackwell 6,144 CUDA' },
          { label: 'Memory', value: '128GB unified' },
        ],
        layout: 'DUEL-PRODUCT-A',
        image: '/templates/tech_duel_product_a_preview.png',
      },
      {
        id: 4,
        title: 'Threadripper PRO scales from 12 to 96 Zen 4 cores',
        badge: 'AMD THREADRIPPER PRO',
        productName: 'AMD Threadripper PRO',
        price: '$2,650 - $10K+',
        specs: [
          { label: 'Architecture', value: 'Zen 4 (TSMC 5nm)' },
          { label: 'Cores', value: '12 to 96' },
          { label: 'Memory', value: '8-ch DDR5, up to 2TB' },
          { label: 'PCIe', value: '128 lanes Gen 5.0' },
        ],
        layout: 'DUEL-PRODUCT-B',
        image: '/templates/tech_duel_product_b_preview.png',
      },
      {
        id: 5,
        title: 'THANK YOU',
        subtitle: 'Questions? Let’s settle the debate.',
        layout: 'DUEL-CLOSING',
        image: '/templates/tech_duel_closing_preview.png',
      },
    ],
  },
  {
    id: 'STARTUP_AMPLIFY',
    name: 'Startup Amplify',
    description:
      'Light, card-based startup growth and GTM playbook inspired by the AMPLIFY YOUR STARTUP deck. Uses a warm light-gray canvas, red top/bottom rules, teal (#00A3A1) and orange (#E8762B) accents, and clean card-based layouts for chapters, stats, frameworks, tool stacks, pricing, and takeaways.',
    tags: ['Startup', 'GTM', 'Growth', 'Strategy', 'AI Automation', 'Charts', 'Frameworks'],
    theme: {
      bg: '#F4F4F4',
      primary: '#00A3A1',
      accent: '#D91E18',
      secondary: '#E8762B',
      fonts: 'Liter + Inter',
      imageMode: 'Clean Bright Stock / UI Shots',
    },
    previewSlides: [
      {
        id: 1,
        title: 'AMPLIFY YOUR STARTUP',
        subtitle: 'Marketing, GTM & AI Automation',
        stats: [
          { value: '47%', label: 'Productivity Gain with AI GTM' },
          { value: '4-7x', label: 'Conversion Rate Improvement' },
          { value: '300%', label: 'Average ROI from AI Tools' },
        ],
        layout: 'AMP-COVER',
        image: '/templates/startup_amplify_cover_preview.png',
      },
      {
        id: 2,
        title: 'CONTENTS',
        sections: [
          {
            number: '01',
            title: 'Marketing Growth Engine',
            description: 'Content, data-driven decisions & social media strategy',
            page: '03',
          },
          {
            number: '02',
            title: 'The Road to GTM',
            description: 'Framework, 90-day plan & motion selection',
            page: '07',
          },
          {
            number: '03',
            title: 'AI Automation for GTM',
            description: 'AI tools, autonomous platforms & implementation roadmap',
            page: '11',
          },
        ],
        layout: 'AMP-TOC',
        image: '/templates/startup_amplify_toc_preview.png',
      },
      {
        id: 3,
        title: 'Content marketing remains the highest-ROI channel for early-stage startups',
        subtitle: 'CONTENT MARKETING DELIVERS 3X MORE LEADS AT 62% LOWER COST',
        bullets: [
          'Identify persona needs and pain points',
          'Produce original, high-value content',
          'Optimize for SEO across all formats',
          'Distribute via website, social, email',
        ],
        cards: [
          {
            title: 'Content Strategy Best Practices',
            body: 'Persona-led, SEO-optimized, multi-format distribution.',
          },
          {
            title: 'Content Formats That Work',
            body: 'Blogs, video, whitepapers, case studies, newsletters.',
          },
        ],
        stats: [
          { value: '3x', label: 'More leads vs paid-only' },
          { value: '62%', label: 'Lower cost per lead' },
          { value: '72%', label: 'B2B buyers read 3+ pieces before buying' },
        ],
        layout: 'AMP-CONTENT-SPLIT',
        image: '/templates/startup_amplify_content_preview.png',
      },
      {
        id: 4,
        title: 'Five interconnected components define every successful GTM strategy',
        subtitle: 'MISS ANY ONE COMPONENT AND THE ENTIRE SYSTEM BECOMES UNSTABLE',
        centerLabel: 'GTM',
        nodes: [
          { title: 'Market Definition', subtitle: 'TAM / SAM / SOM' },
          { title: 'Ideal Customer Profile', subtitle: 'Who, Pain, Trigger' },
          { title: 'Pricing Model', subtitle: 'How you monetize' },
          { title: 'Value Proposition', subtitle: 'Why you, why now' },
          { title: 'Channel Strategy', subtitle: 'How you reach customers' },
        ],
        layout: 'AMP-GTM-FLOW',
        image: '/templates/startup_amplify_gtm_preview.png',
      },
      {
        id: 5,
        title: 'READY TO SCALE?',
        subtitle: 'Start with one channel, measure obsessively, and automate what works.',
        nextSteps: [
          {
            title: 'Audit Your Stack',
            body: 'Map tools, data, and handoffs across marketing and sales.',
          },
          { title: 'Pick One Motion', body: 'PLG, sales-led, or ABM — commit for 90 days.' },
          {
            title: 'Deploy AI Agents',
            body: 'Automate research, outreach, and meeting follow-ups.',
          },
        ],
        prompt: 'Questions?',
        layout: 'AMP-CLOSING',
        image: '/templates/startup_amplify_closing_preview.png',
      },
    ],
  },
]

// ── Gallery thumbnail: self-contained iframe preview, measures its own container ──
function GalleryThumb({ template }: { template: Template }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.36)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / 1280)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const slide = template.previewSlides[0]
  if (!slide) return null
  const VIRTUAL_W = 1280
  const VIRTUAL_H = 720
  const css = TEMPLATE_CSS[template.id] ?? ''
  const googleFonts = TEMPLATE_FONTS[template.id] ?? ''
  const slideHtml = buildSlideHtml(template.id, slide)

  const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${googleFonts}
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{width:${VIRTUAL_W}px;height:${VIRTUAL_H}px;overflow:hidden;}
.slide{width:${VIRTUAL_W}px;height:${VIRTUAL_H}px;position:relative;overflow:hidden;}
${css}
</style>
</head>
<body>${slideHtml}</body>
</html>`

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <iframe
        srcDoc={doc}
        title={template.name}
        scrolling="no"
        style={{
          width: VIRTUAL_W,
          height: VIRTUAL_H,
          border: 'none',
          transformOrigin: '0 0',
          transform: `scale(${scale})`,
          display: 'block',
          pointerEvents: 'none',
        }}
        sandbox="allow-scripts"
      />
    </div>
  )
}

interface TemplatesViewProps {
  /** Called whenever the user enters/exits the template detail view */
  onDetailModeChange?: (inDetail: boolean) => void
  /** Receives a function that clears the selected template (the shell's back button calls it) */
  onClearSelectionReady?: (clear: (() => void) | null) => void
}

/**
 * Template gallery. Picking a template and a topic creates a deck project
 * (POST /projects, flow "deck") and opens it in the studio.
 */
export const TemplatesView = ({
  onDetailModeChange,
  onClearSelectionReady,
}: TemplatesViewProps) => {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [topic, setTopic] = useState('')
  const [slideCount, setSlideCount] = useState(10)
  const [headings, setHeadings] = useState<string[]>(Array(20).fill(''))
  const [showHeadings, setShowHeadings] = useState(false)
  const [previewSlideIdx, setPreviewSlideIdx] = useState(0)
  const [previewScale, setPreviewScale] = useState(0.36)
  const previewCarouselRef = useRef<HTMLDivElement>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Measure carousel viewport → compute exact scale for 1280×720 virtual slide
  useEffect(() => {
    const el = previewCarouselRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setPreviewScale(entry.contentRect.width / 1280)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [selectedTemplate])

  // Keep parent header in sync whenever detail mode changes
  const clearSelection = () => {
    setSelectedTemplate(null)
    setPreviewSlideIdx(0)
    setErrors({})
    onDetailModeChange?.(false)
  }

  // Expose clearSelection so the shell's back button can trigger it.
  //
  // Registered ONCE, through a ref, rather than on every change of the
  // callback prop. Keyed on the prop it re-fired whenever the parent
  // re-rendered, and since registering sets state in the parent, that was a
  // loop — one an inline arrow up there is enough to start. A ref makes the
  // parent's memoisation an optimisation rather than a correctness condition.
  const readyRef = useRef(onClearSelectionReady)
  readyRef.current = onClearSelectionReady
  const clearRef = useRef(clearSelection)
  clearRef.current = clearSelection
  useEffect(() => {
    readyRef.current?.(() => clearRef.current())
    return () => readyRef.current?.(null)
  }, [])

  const wordCount = (text: string) => {
    const clean = text.trim().replace(/\s+/g, ' ')
    return clean === '' ? 0 : clean.split(' ').length
  }

  const currentWords = wordCount(topic)
  const isWordLimitExceeded = currentWords > 30

  const handleHeadingChange = (index: number, val: string) => {
    const next = [...headings]
    next[index] = val
    setHeadings(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTemplate) return

    const errs: Record<string, string> = {}
    if (!topic.trim()) {
      errs.topic = 'Please enter a presentation topic'
    } else if (isWordLimitExceeded) {
      errs.topic = 'Topic cannot exceed 30 words'
    }

    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }

    const jobHeadings = headings
      .slice(0, slideCount)
      .map(h => h.trim())
      .filter(h => h !== '')

    setIsSubmitting(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not signed in')
      const project = await createProject(token, {
        flow: 'deck',
        prompt: topic.trim(),
        options: {
          topic: topic.trim(),
          slideCount,
          headings: jobHeadings,
          template: selectedTemplate.id,
        },
      })
      window.dispatchEvent(new Event('credits-changed'))
      navigate(`/p/${project.id}`)
    } catch (err) {
      toast(describeStudioError(err, 'Could not create the deck'), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Iframe-based pixel-perfect preview ───────────────────────────────────────
  // Renders the exact same HTML+CSS used in the real PDF, scaled to fit the card.
  const renderMiniPreviewSlide = (template: Template, idx: number) => {
    const slide = template.previewSlides[idx]
    if (!slide) return null

    const slideHtml = buildSlideHtml(template.id, slide)
    const css = TEMPLATE_CSS[template.id] ?? ''
    const googleFonts = TEMPLATE_FONTS[template.id] ?? ''

    const VIRTUAL_W = 1280
    const VIRTUAL_H = 720

    const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${googleFonts}
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{width:${VIRTUAL_W}px;height:${VIRTUAL_H}px;overflow:hidden;}
.slide{width:${VIRTUAL_W}px;height:${VIRTUAL_H}px;position:relative;overflow:hidden;}
${css}
</style>
</head>
<body>${slideHtml}</body>
</html>`

    return (
      <div className="w-full h-full relative overflow-hidden">
        <iframe
          srcDoc={doc}
          title={`${template.name} – ${slide.layout}`}
          scrolling="no"
          style={{
            width: VIRTUAL_W,
            height: VIRTUAL_H,
            border: 'none',
            transformOrigin: '0 0',
            // previewScale = containerWidth / 1280 (measured by ResizeObserver)
            transform: `scale(${previewScale})`,
            display: 'block',
          }}
          sandbox="allow-scripts"
        />
      </div>
    )
  }

  const inputBase =
    'w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors bg-white'
  const inputError = 'border-red-300 focus:ring-red-200 focus:border-red-400'

  if (selectedTemplate) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2 uppercase tracking-tight">
              {selectedTemplate.name}
            </h1>
            <p className="text-sm text-gray-500 mt-1 max-w-xl">{selectedTemplate.description}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedTemplate.tags.map(t => (
              <span
                key={t}
                className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Split Preview and Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Premium Preview Carousel */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Live Design Preview
              </div>
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                {previewSlideIdx + 1} / {selectedTemplate.previewSlides.length} layouts
              </div>
            </div>

            {/* Carousel Viewport */}
            <div
              ref={previewCarouselRef}
              className="aspect-[16/9] w-full rounded-xl overflow-hidden border border-gray-200 shadow-md bg-gray-100 relative"
              style={{ userSelect: 'none' }}
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'ArrowRight')
                  setPreviewSlideIdx(i => (i + 1) % selectedTemplate.previewSlides.length)
                if (e.key === 'ArrowLeft')
                  setPreviewSlideIdx(
                    i =>
                      (i - 1 + selectedTemplate.previewSlides.length) %
                      selectedTemplate.previewSlides.length,
                  )
              }}
            >
              {/* Slide strip: all slides side-by-side, translated by active index */}
              <div
                className="absolute inset-0 flex transition-transform duration-500 ease-in-out"
                style={{
                  transform: `translateX(-${previewSlideIdx * (100 / selectedTemplate.previewSlides.length)}%)`,
                  width: `${selectedTemplate.previewSlides.length * 100}%`,
                }}
              >
                {selectedTemplate.previewSlides.map((_, idx) => (
                  <div
                    key={idx}
                    className="relative shrink-0"
                    style={{ width: `${100 / selectedTemplate.previewSlides.length}%` }}
                  >
                    {renderMiniPreviewSlide(selectedTemplate, idx)}
                  </div>
                ))}
              </div>

              {/* Layout name badge */}
              <div className="absolute bottom-2 left-2 z-10 pointer-events-none">
                <span
                  className="text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-widest"
                  style={{
                    background: 'rgba(0,0,0,0.55)',
                    color: '#fff',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {selectedTemplate.previewSlides[previewSlideIdx]?.layout}
                </span>
              </div>

              {/* Prev arrow */}
              {previewSlideIdx > 0 && (
                <button
                  onClick={() => setPreviewSlideIdx(i => i - 1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center border-none outline-none cursor-pointer transition-all duration-200 hover:scale-110"
                  style={{
                    background: 'rgba(0,0,0,0.45)',
                    color: '#fff',
                    backdropFilter: 'blur(4px)',
                  }}
                  aria-label="Previous layout"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              )}

              {/* Next arrow */}
              {previewSlideIdx < selectedTemplate.previewSlides.length - 1 && (
                <button
                  onClick={() => setPreviewSlideIdx(i => i + 1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center border-none outline-none cursor-pointer transition-all duration-200 hover:scale-110"
                  style={{
                    background: 'rgba(0,0,0,0.45)',
                    color: '#fff',
                    backdropFilter: 'blur(4px)',
                  }}
                  aria-label="Next layout"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
            </div>

            {/* Pill dot indicators */}
            <div className="flex items-center justify-center gap-1.5">
              {selectedTemplate.previewSlides.map((slide, idx) => (
                <button
                  key={idx}
                  onClick={() => setPreviewSlideIdx(idx)}
                  title={slide.layout}
                  className={`transition-all duration-300 border-none outline-none cursor-pointer rounded-full ${
                    previewSlideIdx === idx
                      ? 'w-5 h-2 bg-gray-900'
                      : 'w-2 h-2 bg-gray-300 hover:bg-gray-500'
                  }`}
                />
              ))}
            </div>

            {/* Specs Panel */}
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mt-1">
              <div className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wider">
                Style Specifications
              </div>
              <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                <div>
                  <span className="text-gray-400 block mb-0.5">Background color</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-3.5 h-3.5 rounded border border-gray-300"
                      style={{ backgroundColor: selectedTemplate.theme.bg }}
                    ></span>
                    <span className="font-mono text-gray-800">{selectedTemplate.theme.bg}</span>
                  </div>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Primary Accent</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-3.5 h-3.5 rounded border border-gray-300"
                      style={{ backgroundColor: selectedTemplate.theme.primary }}
                    ></span>
                    <span className="font-mono text-gray-800">
                      {selectedTemplate.theme.primary}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Typography stack</span>
                  <span className="font-semibold text-gray-800">
                    {selectedTemplate.theme.fonts}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Image Rendering</span>
                  <span className="font-semibold text-gray-800">
                    {selectedTemplate.theme.imageMode}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Generation Form */}
          <div className="lg:col-span-7">
            <form
              onSubmit={handleSubmit}
              className="bg-white border border-gray-200 rounded-xl p-6 space-y-6 shadow-sm"
            >
              {/* Topic Section */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                    <span className="text-red-500">*</span>Presentation Topic / Prompt
                  </label>
                  <span
                    className={`text-xs font-semibold ${isWordLimitExceeded ? 'text-red-500' : 'text-gray-400'}`}
                  >
                    {currentWords} / 30 words
                  </span>
                </div>
                <textarea
                  id="template-topic-input"
                  rows={3}
                  className={`${inputBase} resize-none ${errors.topic || isWordLimitExceeded ? inputError : ''}`}
                  placeholder={`e.g. AI-driven newspapers in 2026: How digital journalism utilizes automated layout nodes and halftone filters to revive classic prints.`}
                  value={topic}
                  onChange={e => {
                    setTopic(e.target.value)
                    setErrors(prev => {
                      const next = { ...prev }
                      delete next.topic
                      return next
                    })
                  }}
                />
                {errors.topic && <p className="text-xs text-red-500 mt-1">{errors.topic}</p>}
              </div>

              {/* Slide Count */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                  Slide Count (5 to 20 slides)
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={5}
                    max={20}
                    value={slideCount}
                    onChange={e => setSlideCount(parseInt(e.target.value, 10))}
                    className="flex-1 accent-gray-900 cursor-pointer h-1.5 bg-gray-200 rounded-lg appearance-none"
                  />
                  <span className="text-sm font-bold text-gray-900 w-16 text-right shrink-0">
                    {slideCount} slides
                  </span>
                </div>
              </div>

              {/* Collapsible Slide Headings */}
              <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50">
                <button
                  type="button"
                  onClick={() => setShowHeadings(!showHeadings)}
                  className="w-full flex items-center justify-between text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors border-none outline-none bg-transparent cursor-pointer"
                >
                  <span>Custom Slide Headings (Optional)</span>
                  <span>{showHeadings ? <IconChevronUp /> : <IconChevronDown />}</span>
                </button>

                {showHeadings && (
                  <div className="mt-4 space-y-3 max-h-56 overflow-y-auto pr-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <p className="text-xs text-gray-400 mb-2">
                      Leave blank to let AI automatically generate headings for those slides.
                    </p>
                    {Array.from({ length: slideCount }, (_, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-gray-400 w-16 select-none shrink-0">
                          Slide {idx + 1}:
                        </span>
                        <input
                          type="text"
                          className={inputBase}
                          placeholder={`e.g. Slide ${idx + 1} Heading`}
                          value={headings[idx]}
                          onChange={e => handleHeadingChange(idx, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Action */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || isWordLimitExceeded}
                  id="generate-template-pdf-btn"
                  className="w-full flex items-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm transition-all duration-500 ease-out disabled:opacity-50 flex items-center justify-center border-none cursor-pointer bg-transparent bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 [background-size:200%_auto] [background-position:0%_center] text-white hover:[background-position:99%_center] shadow-lg shadow-black/5 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? <IconLoader /> : <IconPlay />}
                  {isSubmitting ? 'Creating deck…' : 'Create deck in studio'}
                  {!isSubmitting && <CreditChip amount={1} className="bg-white text-gray-900" />}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto w-full">
      {/* Page Heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">
          Premium Style Gallery
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Select a pre-designed premium template preset below to lock in the visual identity. The AI
          agent will write and build your deck using the exact styling and constraints of that
          design.
        </p>
      </div>

      {/* Grid of Templates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TEMPLATES.map(template => (
          <div
            key={template.id}
            onClick={() => {
              setSelectedTemplate(template)
              onDetailModeChange?.(true)
            }}
            className="group cursor-pointer bg-white border border-gray-200 hover:border-gray-950 hover:shadow-lg transition-all duration-300 rounded-xl overflow-hidden flex flex-col h-full hover:-translate-y-0.5"
          >
            {/* Template Card Mini-Deck Screen */}
            <div className="aspect-[16/10] bg-gray-100 border-b border-gray-100 overflow-hidden relative">
              <GalleryThumb template={template} />
            </div>

            {/* Template Info */}
            <div className="p-5 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-950 uppercase group-hover:text-gray-900 transition-colors">
                  {template.name}
                </h3>
                <p className="text-xs text-gray-500 line-clamp-3 mt-2 leading-relaxed">
                  {template.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-1">
                {template.tags.slice(0, 3).map(tag => (
                  <span
                    key={tag}
                    className="text-[10px] bg-gray-50 text-gray-500 font-medium px-2 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
