import { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import type { Project } from '../types';
import { PdfProgressWidget } from '../components/PdfProgressWidget';
import { PitchLogoAnimation } from '../components/PitchLogoAnimation';
import { api } from '../lib/api';
import { useAuth } from '@clerk/clerk-react';

interface PdfEditorViewProps {
  projects: Project[];
}

const normalizeColor = (col: string): string => {
  if (!col) return '';
  const trimmed = col.trim().toLowerCase();
  if (trimmed === 'transparent' || trimmed === 'rgba(0, 0, 0, 0)') return 'transparent';
  if (trimmed.startsWith('#')) return trimmed;
  const match = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (match) {
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    const a = match[4] ? parseFloat(match[4]) : 1;
    if (a === 0) return 'transparent';
    const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    return hex;
  }
  return trimmed;
};

const TEXT_PRESETS = ['#000000', '#ffffff', '#4b5563', '#9ca3af', '#3b82f6', '#ef4444'];
const BG_PRESETS = ['transparent', '#ffffff', '#000000', '#f3f4f6', '#e5e7eb', '#1f2937'];

export const PdfEditorView = ({ projects }: PdfEditorViewProps) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { getToken } = useAuth();

  const selectedProject = projects.find(p => p.id === id);

  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loadingHtml, setLoadingHtml] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [slides, setSlides] = useState<{ id: number; title: string }[]>([]);
  const [activeSlide, setActiveSlide] = useState<number>(0);
  const [scale, setScale] = useState(1);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  // Styling editor states
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedBgColor, setSelectedBgColor] = useState<string>('');
  const [selectedFontSize, setSelectedFontSize] = useState<string>('');
  const [elType, setElType] = useState<string>('');

  // Canva-like color extraction and bulk states
  const [slideColorsHash, setSlideColorsHash] = useState<number>(0);
  const [changeAllState, setChangeAllState] = useState<{
    oldColor: string;
    newColor: string;
    type: 'color' | 'bgColor';
  } | null>(null);

  const slideColorStats = useMemo(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return [];

    const slideEl = iframe.contentDocument.getElementById(`slide-node-${activeSlide}`);
    if (!slideEl) return [];

    const colorCounts: { [color: string]: { textCount: number; bgCount: number } } = {};

    // Check slide background itself
    const slideBg = normalizeColor(slideEl.style.backgroundColor || window.getComputedStyle(slideEl).backgroundColor);
    if (slideBg && slideBg !== 'transparent') {
      colorCounts[slideBg] = { textCount: 0, bgCount: 1 };
    }

    // Find all child elements
    const children = slideEl.querySelectorAll('*');
    children.forEach((child) => {
      const htmlChild = child as HTMLElement;
      if (!htmlChild.style) return;

      // Extract text color
      const textColor = normalizeColor(htmlChild.style.color || window.getComputedStyle(htmlChild).color);
      if (textColor && textColor !== 'transparent') {
        if (!colorCounts[textColor]) {
          colorCounts[textColor] = { textCount: 0, bgCount: 0 };
        }
        colorCounts[textColor].textCount += 1;
      }

      // Extract background color
      const bgColor = normalizeColor(htmlChild.style.backgroundColor || window.getComputedStyle(htmlChild).backgroundColor);
      if (bgColor && bgColor !== 'transparent') {
        if (!colorCounts[bgColor]) {
          colorCounts[bgColor] = { textCount: 0, bgCount: 0 };
        }
        colorCounts[bgColor].bgCount += 1;
      }
    });

    return Object.entries(colorCounts)
      .map(([color, stats]) => ({
        color,
        textCount: stats.textCount,
        bgCount: stats.bgCount,
        totalCount: stats.textCount + stats.bgCount,
      }))
      .sort((a, b) => b.totalCount - a.totalCount);
  }, [activeSlide, slideColorsHash, htmlContent, loadingHtml]);

  const slideColors = useMemo(() => {
    return slideColorStats.map(stat => stat.color);
  }, [slideColorStats]);

  useEffect(() => {
    // TopHeader renders #pdf-editor-header-actions when isPdfEditorPage is true
    setPortalTarget(document.getElementById('pdf-editor-header-actions'));
  }, []);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeImageRef = useRef<{ id: string; src: string } | null>(null);

  // 1. Handle responsive scaling for the 1280x720 viewport
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const calculatedScale = Math.min((width - 40) / 1280, 1);
      setScale(calculatedScale > 0.2 ? calculatedScale : 0.2);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [htmlContent]);

  // 2. Fetch the raw presentation HTML from storage
  useEffect(() => {
    if (!selectedProject || selectedProject.status !== 'COMPLETED') return;

    const htmlUrl = selectedProject.parameters?.htmlUrl;
    if (!htmlUrl) {
      setLoadingHtml(false);
      return;
    }

    setLoadingHtml(true);
    fetch(htmlUrl)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch presentation HTML');
        return res.text();
      })
      .then((text) => {
        setHtmlContent(text);
        setLoadingHtml(false);
      })
      .catch((err) => {
        console.error('Error fetching presentation HTML:', err);
        setLoadingHtml(false);
      });
  }, [selectedProject]);

  // 3. Inject interactive handlers (contentEditable & image upload click) once iframe loads
  const handleIframeLoad = () => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;

    const doc = iframe.contentDocument;

    // Inject styles for helper overlays in editor mode
    const style = doc.createElement('style');
    style.textContent = `
      [contenteditable="true"]:hover {
        box-shadow: 0 0 0 1px #3b82f6 !important;
        border-radius: 4px;
        cursor: text;
      }
      [contenteditable="true"]:focus {
        box-shadow: 0 0 0 2px #2563eb !important;
        outline: none;
        border-radius: 4px;
      }
      .selected-for-styling {
        outline: 2px solid #10b981 !important; /* Premium emerald selection border */
        outline-offset: 2px;
        border-radius: 4px;
      }
      img:hover {
        box-shadow: 0 0 0 2px #3b82f6 !important;
        cursor: pointer;
        opacity: 0.9;
        transition: all 0.2s ease-in-out;
      }
    `;
    doc.head.appendChild(style);

    // Make text contentEditable
    const selectors = 'h1, p, li, .subtitle, .stat-num, .stat-label, .stat-desc, .si-card-heading, .si-card-body, .main-title, .chart-source';
    const textEls = doc.querySelectorAll(selectors);
    textEls.forEach((el) => {
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'false');

      // Click listener to select element for styling
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        
        doc.querySelectorAll('.selected-for-styling').forEach(item => {
          item.classList.remove('selected-for-styling');
        });
        el.classList.add('selected-for-styling');

        const htmlEl = el as HTMLElement;
        setSelectedEl(htmlEl);
        setElType(htmlEl.tagName === 'H1' ? 'Heading' : htmlEl.tagName === 'LI' ? 'List Item' : 'Text Block');
        setSelectedColor(htmlEl.style.color || window.getComputedStyle(htmlEl).color);
        setSelectedBgColor(htmlEl.style.backgroundColor || window.getComputedStyle(htmlEl).backgroundColor);
        setSelectedFontSize(htmlEl.style.fontSize || window.getComputedStyle(htmlEl).fontSize);
      });
    });

    // Tag slide elements and register click mapping
    const slideElements = doc.querySelectorAll('.slide');
    const slideMetaList = Array.from(slideElements).map((slideEl, index) => {
      const h1 = slideEl.querySelector('h1, .main-title');
      const title = h1?.textContent?.trim() || `Slide ${index + 1}`;
      // Add id to slide element for easy scrolling
      slideEl.setAttribute('id', `slide-node-${index}`);

      // Click listener to select slide background for styling
      slideEl.addEventListener('click', (e) => {
        if (e.target === slideEl || (e.target as HTMLElement).classList.contains('slide-content') || (e.target as HTMLElement).tagName === 'SECTION') {
          doc.querySelectorAll('.selected-for-styling').forEach(item => {
            item.classList.remove('selected-for-styling');
          });
          slideEl.classList.add('selected-for-styling');

          const slideHtmlEl = slideEl as HTMLElement;
          setSelectedEl(slideHtmlEl);
          setElType('Slide Background');
          setSelectedColor('');
          setSelectedBgColor(slideHtmlEl.style.backgroundColor || window.getComputedStyle(slideHtmlEl).backgroundColor);
          setSelectedFontSize('');
        }
      });

      return { id: index, title };
    });
    setSlides(slideMetaList);

    // Make images clickable for replacement
    const images = doc.querySelectorAll('img');
    images.forEach((img, idx) => {
      // Ensure it has a unique ID to find it during file selection callback
      if (!img.id) img.setAttribute('id', `editable-img-${idx}`);
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        activeImageRef.current = { id: img.id, src: img.src };
        fileInputRef.current?.click();
      });
    });

    // Trigger initial color extraction
    setSlideColorsHash(prev => prev + 1);
  };

  // 4. Handle image file replacement and load as base64 DataURL
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeImageRef.current || !iframeRef.current?.contentDocument) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result as string;
      const targetImg = iframeRef.current?.contentDocument?.getElementById(activeImageRef.current!.id) as HTMLImageElement;
      if (targetImg) {
        targetImg.src = base64Data;
        setSaveStatus('idle'); // changes unsaved
      }
    };
    reader.readAsDataURL(file);
    // Reset file input value to allow selecting same file again
    e.target.value = '';
  };

  // 5. Scroll active slide into view inside the iframe
  const scrollToSlide = (index: number) => {
    setActiveSlide(index);
    setChangeAllState(null); // Clear bulk swap state
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;

    const targetSlide = iframe.contentDocument.getElementById(`slide-node-${index}`);
    if (targetSlide) {
      targetSlide.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 6. Save modified HTML back to storage
  const handleSave = async () => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;

    setSaveStatus('saving');
    // Clear selection state before saving
    setSelectedEl(null);

    try {
      // Clean up dynamic editing styles/attributes before saving
      const cloneDoc = iframe.contentDocument.cloneNode(true) as Document;
      cloneDoc.querySelectorAll('.selected-for-styling').forEach(el => el.classList.remove('selected-for-styling'));
      const editables = cloneDoc.querySelectorAll('[contenteditable="true"]');
      editables.forEach(el => el.removeAttribute('contenteditable'));

      const finalHtml = '<!DOCTYPE html>\n' + cloneDoc.documentElement.outerHTML;

      const token = await getToken();
      await api.post(`/pdf-jobs/${id}/save`, token!, { html: finalHtml });

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('Failed to save presentation changes:', err);
      setSaveStatus('error');
    }
  };

  // 7. Styling mutators
  const changeColor = (newColor: string) => {
    if (!selectedEl) return;

    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;

    const slideEl = iframe.contentDocument.getElementById(`slide-node-${activeSlide}`);
    if (slideEl) {
      const oldNorm = normalizeColor(selectedColor);
      const newNorm = normalizeColor(newColor);

      if (oldNorm && oldNorm !== 'transparent' && oldNorm !== newNorm) {
        let matchCount = 0;
        const children = slideEl.querySelectorAll('*');
        children.forEach((child) => {
          if (child === selectedEl) return;
          const htmlChild = child as HTMLElement;
          if (!htmlChild.style) return;
          const childNorm = normalizeColor(htmlChild.style.color || window.getComputedStyle(htmlChild).color);
          if (childNorm === oldNorm) {
            matchCount++;
          }
        });

        if (matchCount > 0) {
          setChangeAllState({
            oldColor: selectedColor,
            newColor: newColor,
            type: 'color'
          });
        } else {
          setChangeAllState(null);
        }
      } else {
        setChangeAllState(null);
      }
    }

    selectedEl.style.color = newColor;
    setSelectedColor(newColor);
    setSaveStatus('idle');
    setSlideColorsHash(prev => prev + 1);
  };

  const changeBgColor = (newBgColor: string) => {
    if (!selectedEl) return;

    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;

    const slideEl = iframe.contentDocument.getElementById(`slide-node-${activeSlide}`);
    if (slideEl) {
      const oldNorm = normalizeColor(selectedBgColor);
      const newNorm = normalizeColor(newBgColor);

      if (oldNorm && oldNorm !== 'transparent' && oldNorm !== newNorm) {
        let matchCount = 0;

        if (slideEl !== selectedEl) {
          const slideBgNorm = normalizeColor(slideEl.style.backgroundColor || window.getComputedStyle(slideEl).backgroundColor);
          if (slideBgNorm === oldNorm) {
            matchCount++;
          }
        }

        const children = slideEl.querySelectorAll('*');
        children.forEach((child) => {
          if (child === selectedEl) return;
          const htmlChild = child as HTMLElement;
          if (!htmlChild.style) return;
          const childNorm = normalizeColor(htmlChild.style.backgroundColor || window.getComputedStyle(htmlChild).backgroundColor);
          if (childNorm === oldNorm) {
            matchCount++;
          }
        });

        if (matchCount > 0) {
          setChangeAllState({
            oldColor: selectedBgColor,
            newColor: newBgColor,
            type: 'bgColor'
          });
        } else {
          setChangeAllState(null);
        }
      } else {
        setChangeAllState(null);
      }
    }

    selectedEl.style.backgroundColor = newBgColor;
    setSelectedBgColor(newBgColor);
    setSaveStatus('idle');
    setSlideColorsHash(prev => prev + 1);
  };

  const applyChangeAll = () => {
    if (!changeAllState) return;
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;

    const slideEl = iframe.contentDocument.getElementById(`slide-node-${activeSlide}`);
    if (!slideEl) return;

    const { oldColor, newColor, type } = changeAllState;
    const oldNorm = normalizeColor(oldColor);

    if (type === 'color') {
      const children = slideEl.querySelectorAll('*');
      children.forEach((child) => {
        const htmlChild = child as HTMLElement;
        if (!htmlChild.style) return;
        const childNorm = normalizeColor(htmlChild.style.color || window.getComputedStyle(htmlChild).color);
        if (childNorm === oldNorm) {
          htmlChild.style.color = newColor;
        }
      });
      if (selectedEl) {
        selectedEl.style.color = newColor;
        setSelectedColor(newColor);
      }
    } else if (type === 'bgColor') {
      const slideBgNorm = normalizeColor(slideEl.style.backgroundColor || window.getComputedStyle(slideEl).backgroundColor);
      if (slideBgNorm === oldNorm) {
        slideEl.style.backgroundColor = newColor;
      }

      const children = slideEl.querySelectorAll('*');
      children.forEach((child) => {
        const htmlChild = child as HTMLElement;
        if (!htmlChild.style) return;
        const childNorm = normalizeColor(htmlChild.style.backgroundColor || window.getComputedStyle(htmlChild).backgroundColor);
        if (childNorm === oldNorm) {
          htmlChild.style.backgroundColor = newColor;
        }
      });
      if (selectedEl) {
        selectedEl.style.backgroundColor = newColor;
        setSelectedBgColor(newColor);
      }
    }

    setSaveStatus('idle');
    setChangeAllState(null);
    setSlideColorsHash(prev => prev + 1);
  };

  const handleSlideColorSwap = (oldColor: string, newColor: string) => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;

    const slideEl = iframe.contentDocument.getElementById(`slide-node-${activeSlide}`);
    if (!slideEl) return;

    const oldNorm = normalizeColor(oldColor);
    const newNorm = normalizeColor(newColor);
    if (oldNorm === newNorm) return;

    const children = slideEl.querySelectorAll('*');
    children.forEach((child) => {
      const htmlChild = child as HTMLElement;
      if (!htmlChild.style) return;
      
      const textNorm = normalizeColor(htmlChild.style.color || window.getComputedStyle(htmlChild).color);
      if (textNorm === oldNorm) {
        htmlChild.style.color = newColor;
      }

      const bgNorm = normalizeColor(htmlChild.style.backgroundColor || window.getComputedStyle(htmlChild).backgroundColor);
      if (bgNorm === oldNorm) {
        htmlChild.style.backgroundColor = newColor;
      }
    });

    const slideBgNorm = normalizeColor(slideEl.style.backgroundColor || window.getComputedStyle(slideEl).backgroundColor);
    if (slideBgNorm === oldNorm) {
      slideEl.style.backgroundColor = newColor;
    }

    if (selectedEl) {
      const currentTextCol = selectedEl.style.color || window.getComputedStyle(selectedEl).color;
      const currentBgCol = selectedEl.style.backgroundColor || window.getComputedStyle(selectedEl).backgroundColor;
      setSelectedColor(currentTextCol);
      setSelectedBgColor(currentBgCol);
    }

    setSaveStatus('idle');
    setChangeAllState(null);
    setSlideColorsHash(prev => prev + 1);
  };

  const changeFontSize = (increase: boolean) => {
    if (!selectedEl || elType === 'Slide Background') return;
    const currentSizeStr = selectedEl.style.fontSize || window.getComputedStyle(selectedEl).fontSize;
    const currentSize = parseFloat(currentSizeStr) || 16;
    const newSize = increase ? currentSize + 2 : Math.max(8, currentSize - 2);
    selectedEl.style.fontSize = `${newSize}px`;
    setSelectedFontSize(`${newSize}px`);
    setSaveStatus('idle');
  };

  const closeToolbar = () => {
    if (iframeRef.current?.contentDocument) {
      iframeRef.current.contentDocument.querySelectorAll('.selected-for-styling').forEach(el => el.classList.remove('selected-for-styling'));
    }
    setSelectedEl(null);
    setChangeAllState(null);
  };

  if (!selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-12">
        <div className="w-48 sm:w-64 mb-8">
          <PitchLogoAnimation startAnimation={true} loop={true} />
        </div>
        <p className="font-bold text-gray-900 tracking-tight leading-none text-xl mb-4 animate-pulse">Loading presentation…</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors cursor-pointer mt-2"
        >
          Cancel
        </button>
      </div>
    );
  }

  const isProcessing = selectedProject.status === 'PROCESSING' || selectedProject.status === 'PENDING';
  const isFailed = selectedProject.status === 'FAILED';

  // Render the progress updates when processing
  if (isProcessing) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto w-full">
        <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 text-center space-y-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Generating your presentation slide deck…</h2>
            <p className="text-sm text-gray-500 mt-1">This typically takes 2–4 minutes. Hang tight!</p>
          </div>
          <PdfProgressWidget project={selectedProject} />
        </div>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto w-full">
        <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 text-center space-y-6">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">PDF Generation Failed</h2>
            <p className="text-sm text-gray-500 mt-1">{selectedProject.error || 'Something went wrong during generation.'}</p>
          </div>
          <PdfProgressWidget project={selectedProject} />
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-150 select-none">
      {/* ── Portaled Editor Actions ────────────────────────────────────────── */}
      {portalTarget && createPortal(
        <>
          {selectedProject.pdfUrl && (
            <a
              href={`${selectedProject.pdfUrl}?t=${new Date(selectedProject.updatedAt).getTime()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download PDF
            </a>
          )}

          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 border-none cursor-pointer flex items-center gap-1.5 shadow-sm ${
              saveStatus === 'saving'
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : saveStatus === 'saved'
                ? 'bg-green-600 text-white hover:bg-green-700'
                : saveStatus === 'error'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            {saveStatus === 'saving' && (
              <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-gray-600 rounded-full animate-spin shrink-0" />
            )}
            {saveStatus === 'saving' ? 'Saving Changes...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Failed to Save' : 'Save Changes'}
          </button>
        </>,
        portalTarget
      )}

      {/* ── Slide Element Styling Toolbar ─────────────────────────────────────── */}
      {selectedEl && (
        <div className="bg-white border-b border-gray-200 px-6 py-3.5 flex flex-col gap-3.5 z-10 shadow-sm shrink-0 transition-all duration-300">
          {/* Main Controls Row */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg">
                {elType}
              </span>
              
              {/* Font Size controls (only for text elements) */}
              {elType !== 'Slide Background' && (
                <div className="flex items-center gap-1.5 border-l border-gray-200 pl-4">
                  <span className="text-xs text-gray-400 font-medium mr-1">Size</span>
                  <button
                    onClick={() => changeFontSize(false)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-250 bg-white hover:bg-gray-50 text-gray-600 transition-colors text-xs font-bold cursor-pointer"
                  >
                    -
                  </button>
                  <span className="text-xs font-mono font-bold text-gray-700 min-w-[40px] text-center">
                    {selectedFontSize || 'N/A'}
                  </span>
                  <button
                    onClick={() => changeFontSize(true)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-250 bg-white hover:bg-gray-50 text-gray-600 transition-colors text-xs font-bold cursor-pointer"
                  >
                    +
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-6">
              {/* Text Color Picker (only for text elements) */}
              {elType !== 'Slide Background' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-medium">Text</span>
                  <div className="flex items-center gap-1">
                    {TEXT_PRESETS.map((col) => {
                      const isSelected = normalizeColor(selectedColor) === normalizeColor(col);
                      return (
                        <button
                          key={col}
                          onClick={() => changeColor(col)}
                          style={{ backgroundColor: col }}
                          className={`w-5 h-5 rounded-full border border-gray-300 cursor-pointer shadow-sm transition-transform hover:scale-110 ${
                            isSelected ? 'ring-2 ring-indigo-500 scale-110' : ''
                          }`}
                        />
                      );
                    })}

                    {(() => {
                      const textPresetsNormalized = TEXT_PRESETS.map(normalizeColor);
                      const extractedTextColors = slideColors.filter(c => c !== 'transparent' && !textPresetsNormalized.includes(normalizeColor(c)));
                      if (extractedTextColors.length === 0) return null;
                      return (
                        <>
                          <div className="w-[1px] h-4 bg-gray-200 mx-1" />
                          {extractedTextColors.map((col) => {
                            const isSelected = normalizeColor(selectedColor) === normalizeColor(col);
                            return (
                              <button
                                key={col}
                                onClick={() => changeColor(col)}
                                style={{ backgroundColor: col }}
                                className={`w-5 h-5 rounded-full border border-gray-300 cursor-pointer shadow-sm transition-transform hover:scale-110 ${
                                  isSelected ? 'ring-2 ring-indigo-500 scale-110' : ''
                                }`}
                                title="Color used in slide"
                              />
                            );
                          })}
                        </>
                      );
                    })()}

                    {/* Custom color picker */}
                    {(() => {
                      const normSelectedColor = normalizeColor(selectedColor);
                      const textPresetsNormalized = TEXT_PRESETS.map(normalizeColor);
                      const extractedTextColors = slideColors.filter(c => c !== 'transparent' && !textPresetsNormalized.includes(normalizeColor(c)));
                      const isCustomColor = selectedColor && !textPresetsNormalized.includes(normSelectedColor) && !extractedTextColors.map(normalizeColor).includes(normSelectedColor);
                      return (
                        <div 
                          className={`relative w-5 h-5 rounded-full overflow-hidden border border-gray-300 shadow-sm hover:scale-110 transition-transform cursor-pointer flex items-center justify-center ${
                            isCustomColor ? 'ring-2 ring-indigo-500 scale-110' : ''
                          }`}
                          style={{ background: 'conic-gradient(from 0deg, red, yellow, green, cyan, blue, magenta, red)' }}
                          title="Custom Color Picker"
                        >
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-[10px] text-white font-black drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">+</span>
                          </div>
                          <input
                            type="color"
                            value={normSelectedColor.startsWith('#') && normSelectedColor.length === 7 ? normSelectedColor : '#000000'}
                            onChange={(e) => changeColor(e.target.value)}
                            className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                          />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Background Color Picker */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-medium">Background</span>
                <div className="flex items-center gap-1">
                  {BG_PRESETS.map((col) => {
                    const isSelected = normalizeColor(selectedBgColor) === normalizeColor(col);
                    return (
                      <button
                        key={col}
                        onClick={() => changeBgColor(col)}
                        style={{ backgroundColor: col === 'transparent' ? 'transparent' : col }}
                        className={`w-5 h-5 rounded-full border border-gray-300 cursor-pointer shadow-sm transition-transform hover:scale-110 flex items-center justify-center ${
                          isSelected ? 'ring-2 ring-indigo-500 scale-110' : ''
                        }`}
                      >
                        {col === 'transparent' && <span className="text-[10px] text-gray-400">∅</span>}
                      </button>
                    );
                  })}

                  {(() => {
                    const bgPresetsNormalized = BG_PRESETS.map(normalizeColor);
                    const extractedBgColors = slideColors.filter(c => c !== 'transparent' && !bgPresetsNormalized.includes(normalizeColor(c)));
                    if (extractedBgColors.length === 0) return null;
                    return (
                      <>
                        <div className="w-[1px] h-4 bg-gray-200 mx-1" />
                        {extractedBgColors.map((col) => {
                          const isSelected = normalizeColor(selectedBgColor) === normalizeColor(col);
                          return (
                            <button
                              key={col}
                              onClick={() => changeBgColor(col)}
                              style={{ backgroundColor: col }}
                              className={`w-5 h-5 rounded-full border border-gray-300 cursor-pointer shadow-sm transition-transform hover:scale-110 ${
                                isSelected ? 'ring-2 ring-indigo-500 scale-110' : ''
                              }`}
                              title="Color used in slide"
                            />
                          );
                        })}
                      </>
                    );
                  })()}

                  {/* Custom bg color picker */}
                  {(() => {
                    const normSelectedBgColor = normalizeColor(selectedBgColor);
                    const bgPresetsNormalized = BG_PRESETS.map(normalizeColor);
                    const extractedBgColors = slideColors.filter(c => c !== 'transparent' && !bgPresetsNormalized.includes(normalizeColor(c)));
                    const isCustomBgColor = selectedBgColor && !BG_PRESETS.map(normalizeColor).includes(normSelectedBgColor) && !extractedBgColors.map(normalizeColor).includes(normSelectedBgColor);
                    return (
                      <div 
                        className={`relative w-5 h-5 rounded-full overflow-hidden border border-gray-300 shadow-sm hover:scale-110 transition-transform cursor-pointer flex items-center justify-center ${
                          isCustomBgColor ? 'ring-2 ring-indigo-500 scale-110' : ''
                        }`}
                        style={{ background: 'conic-gradient(from 0deg, red, yellow, green, cyan, blue, magenta, red)' }}
                        title="Custom Background Color"
                      >
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-[10px] text-white font-black drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">+</span>
                        </div>
                        <input
                          type="color"
                          value={normSelectedBgColor.startsWith('#') && normSelectedBgColor.length === 7 ? normSelectedBgColor : '#ffffff'}
                          onChange={(e) => changeBgColor(e.target.value)}
                          className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                        />
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Close / Deselect */}
              <button
                onClick={closeToolbar}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-100 rounded-lg cursor-pointer animate-none"
                title="Close Toolbar"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Canva-style Change All Banner */}
          {changeAllState && (
            <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5 text-xs text-indigo-700 shadow-inner">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                <span>
                  Change all <strong>{changeAllState.type === 'color' ? 'text' : 'background'}</strong> colors on this slide from{' '}
                  <span className="inline-block w-4 h-4 rounded-full align-middle border border-indigo-200 shadow-sm" style={{ backgroundColor: changeAllState.oldColor }} />{' '}
                  to{' '}
                  <span className="inline-block w-4 h-4 rounded-full align-middle border border-indigo-200 shadow-sm" style={{ backgroundColor: changeAllState.newColor }} />?
                </span>
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={applyChangeAll}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors shadow-sm text-xs border-none"
                >
                  Change All
                </button>
                <button
                  onClick={() => setChangeAllState(null)}
                  className="bg-white border border-gray-250 text-gray-500 hover:bg-gray-50 font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-xs"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Slide-wide Theme Palette Editor */}
          {elType === 'Slide Background' && slideColorStats.length > 0 && (
            <div className="border-t border-gray-100 pt-3.5 flex flex-col gap-2">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Theme colors used in this slide</span>
              <div className="flex flex-wrap gap-2.5">
                {slideColorStats.map(({ color, textCount, bgCount }) => (
                  <div key={color} className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg pl-2 pr-3 py-1.5 transition-colors shadow-sm text-xs select-none">
                    <div 
                      className="relative w-5 h-5 rounded-full border border-gray-300 shadow-sm hover:scale-110 transition-transform cursor-pointer"
                      style={{ backgroundColor: color }}
                    >
                      <input
                        type="color"
                        value={color.startsWith('#') && color.length === 7 ? color : '#ffffff'}
                        onChange={(e) => handleSlideColorSwap(color, e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                    <span className="font-mono text-[11px] text-gray-600 font-bold uppercase">{color}</span>
                    <span className="text-[10px] text-gray-400 font-medium">
                      ({textCount > 0 && `${textCount} text`}{textCount > 0 && bgCount > 0 && ', '}{bgCount > 0 && `${bgCount} bg`}{textCount === 0 && bgCount === 0 && '0 items'})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Editor Workspace ──────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        
        {/* Left Slide Thumbnail Navigation Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto z-10 hidden md:block shrink-0">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Slides ({slides.length})</h3>
          </div>
          <div className="p-2.5 space-y-1">
            {slides.map((slide) => (
              <button
                key={slide.id}
                onClick={() => scrollToSlide(slide.id)}
                className={`w-full text-left p-3 rounded-xl transition-all duration-200 flex items-start gap-3 cursor-pointer ${
                  activeSlide === slide.id
                    ? 'bg-indigo-50 border border-indigo-100 text-indigo-900 font-semibold'
                    : 'bg-transparent border border-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className={`text-xs font-mono shrink-0 px-1.5 py-0.5 rounded ${
                  activeSlide === slide.id ? 'bg-indigo-100/50 text-indigo-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {String(slide.id + 1).padStart(2, '0')}
                </span>
                <span className="text-xs truncate">{slide.title}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Main Editable Preview Window */}
        <main ref={containerRef} className="flex-1 overflow-auto flex items-center justify-center p-6 bg-gray-50/50 relative">
          {loadingHtml ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="w-8 h-8 border-3 border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-xs font-semibold text-gray-500">Loading presentation slides…</p>
            </div>
          ) : htmlContent ? (
            <div
              style={{
                width: 1280 * scale,
                height: 720 * scale,
                minWidth: 1280 * scale,
                minHeight: 720 * scale,
                transformOrigin: 'center center',
                transition: 'all 0.1s ease-out',
              }}
              className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white"
            >
              <iframe
                ref={iframeRef}
                srcDoc={htmlContent}
                onLoad={handleIframeLoad}
                style={{
                  width: 1280,
                  height: 720,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  border: 'none',
                  overflow: 'hidden',
                }}
                title="Presentation Preview"
                sandbox="allow-same-origin allow-scripts"
              />
            </div>
          ) : (
            <div className="text-center p-8 border border-dashed border-gray-200 rounded-2xl bg-white max-w-sm">
              <p className="text-sm font-semibold text-gray-600">Failed to render presentation</p>
              <p className="text-xs text-gray-400 mt-1">We couldn't retrieve the slide builder templates for this project.</p>
            </div>
          )}
        </main>
      </div>

      {/* Hidden file input for image uploading */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
    </div>
  );
};
