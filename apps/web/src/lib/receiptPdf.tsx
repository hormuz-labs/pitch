import { createRoot } from 'react-dom/client';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { OfficialReceiptDoc, type OfficialReceiptData } from '../components/OfficialReceiptDoc';

/**
 * Renders the official receipt offscreen, snapshots it, and downloads it as an
 * A4 PDF. Self-contained so any view (post-checkout receipt, billing history)
 * can trigger a download without mounting the doc itself.
 */
export async function downloadReceiptPdf(data: OfficialReceiptData): Promise<void> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none;opacity:0;';
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    const node = await new Promise<HTMLDivElement>((resolve) => {
      root.render(<OfficialReceiptDoc ref={(el) => { if (el) resolve(el); }} {...data} />);
    });

    // Give the browser a couple of frames to lay out and load fonts.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    // skipFonts avoids html-to-image trying to read cross-origin stylesheets
    // (e.g. Google Fonts), which throws a SecurityError on cssRules access.
    // The receipt's font stack falls back to Helvetica/Arial, which is fine.
    const dataUrl = await toPng(node, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#ffffff',
      skipFonts: true,
    });
    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; });

    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const drawW = pageW;
    const drawH = Math.min((img.height / img.width) * drawW, pageH);
    pdf.addImage(dataUrl, 'PNG', 0, 0, drawW, drawH);
    pdf.save(`trypitch-receipt-${data.receiptId || Date.now()}.pdf`);
  } finally {
    root.unmount();
    host.remove();
  }
}
