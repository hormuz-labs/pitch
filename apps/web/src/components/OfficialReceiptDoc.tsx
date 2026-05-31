import { forwardRef } from 'react';
import logoBSrc from '../assets/logoB.svg';

/* ─────────────────────────────────────────────
   OFFICIAL RECEIPT — clean A4 document rendered to PDF (logo, PAID, line items).
   Shared by the post-checkout receipt and the billing-history download.
───────────────────────────────────────────── */

export interface OfficialReceiptData {
  receiptId?: string;
  payerName: string;
  email?: string;
  amount?: string;
  method?: string;
  date: string;
  label?: string;
  credits: number;
}


export const OfficialReceiptDoc = forwardRef<HTMLDivElement, OfficialReceiptData>(
  ({ receiptId, payerName, email, amount, method, date, label, credits }, ref) => {
    const sans = "'DM Sans','Helvetica Neue',Arial,sans-serif";
    const mono = "'DM Mono',ui-monospace,monospace";
    const ink = '#111827';
    const muted = '#6b7280';
    const line = '#e5e7eb';
    const total = amount || '—';
    const desc = label || `${credits} Credits`;

    const labelStyle: React.CSSProperties = { fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:muted, marginBottom:6 };
    const cell: React.CSSProperties = { fontSize:13, color:ink, padding:'12px 0' };

    return (
      <div ref={ref} style={{
        width:720, background:'#fff', padding:'48px 52px',
        fontFamily:sans, color:ink, boxSizing:'border-box',
      }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:36 }}>
          <div>
            <img src={logoBSrc} alt="PITCH" width="140" height="46" style={{ display:'block', height:46, width:'auto' }}/>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:24, fontWeight:800, letterSpacing:'-0.01em' }}>Receipt</div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:8,
              background:'#ecfdf5', color:'#059669', fontWeight:700, fontSize:11,
              letterSpacing:'0.08em', padding:'4px 10px', borderRadius:999 }}>
              <span style={{ width:6, height:6, borderRadius:999, background:'#059669' }}/> PAID
            </div>
          </div>
        </div>

        {/* Meta + parties */}
        <div style={{ display:'flex', justifyContent:'space-between', gap:32, marginBottom:32 }}>
          <div style={{ flex:1 }}>
            <div style={labelStyle}>From</div>
            <div style={{ fontSize:13, fontWeight:700 }}>TryPitch</div>
            <div style={{ fontSize:13, color:muted, marginTop:2 }}>trypitch.co</div>
            <div style={{ fontSize:13, color:muted }}>support@trypitch.co</div>
          </div>
          <div style={{ flex:1 }}>
            <div style={labelStyle}>Billed to</div>
            <div style={{ fontSize:13, fontWeight:700 }}>{payerName}</div>
            {email && <div style={{ fontSize:13, color:muted, marginTop:2 }}>{email}</div>}
          </div>
          <div style={{ flex:1 }}>
            <div style={labelStyle}>Details</div>
            <div style={{ fontSize:12, color:muted }}>Date paid</div>
            <div style={{ fontSize:13, marginBottom:6 }}>{date}</div>
            {method && (<>
              <div style={{ fontSize:12, color:muted }}>Payment method</div>
              <div style={{ fontSize:13, marginBottom:6 }}>{method}</div>
            </>)}
            {receiptId && (<>
              <div style={{ fontSize:12, color:muted }}>Receipt no.</div>
              <div style={{ fontSize:11, fontFamily:mono, wordBreak:'break-all' }}>{receiptId}</div>
            </>)}
          </div>
        </div>

        {/* Amount headline */}
        <div style={{ fontSize:26, fontWeight:800, letterSpacing:'-0.02em', marginBottom:24 }}>
          {total} <span style={{ fontSize:14, fontWeight:600, color:muted }}>paid on {date}</span>
        </div>

        {/* Line items */}
        <div style={{ borderTop:`1px solid ${line}` }}>
          <div style={{ display:'flex', borderBottom:`1px solid ${line}`, padding:'10px 0' }}>
            <div style={{ flex:3, ...labelStyle, margin:0 }}>Description</div>
            <div style={{ flex:1, textAlign:'center', ...labelStyle, margin:0 }}>Qty</div>
            <div style={{ flex:1, textAlign:'right', ...labelStyle, margin:0 }}>Unit price</div>
            <div style={{ flex:1, textAlign:'right', ...labelStyle, margin:0 }}>Amount</div>
          </div>
          <div style={{ display:'flex', borderBottom:`1px solid ${line}` }}>
            <div style={{ flex:3, ...cell, fontWeight:600 }}>{desc}</div>
            <div style={{ flex:1, ...cell, textAlign:'center' }}>1</div>
            <div style={{ flex:1, ...cell, textAlign:'right' }}>{total}</div>
            <div style={{ flex:1, ...cell, textAlign:'right' }}>{total}</div>
          </div>
        </div>

        {/* Totals */}
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:14 }}>
          <div style={{ width:260 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:muted, padding:'4px 0' }}>
              <span>Subtotal</span><span style={{ color:ink }}>{total}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:muted, padding:'4px 0' }}>
              <span>Total</span><span style={{ color:ink }}>{total}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:800,
              padding:'10px 0', borderTop:`2px solid ${ink}`, marginTop:6 }}>
              <span>Amount paid</span><span>{total}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop:40, paddingTop:18, borderTop:`1px solid ${line}`, fontSize:11.5, color:muted, lineHeight:1.6 }}>
          {credits} credits were added to your TryPitch account. Thank you for your purchase!
          <br/>Questions? Contact us at support@trypitch.co — trypitch.co
        </div>
      </div>
    );
  },
);
OfficialReceiptDoc.displayName = 'OfficialReceiptDoc';
