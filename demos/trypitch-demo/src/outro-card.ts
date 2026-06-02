import fs from 'fs';
import path from 'path';

export interface OutroCardOptions {
  companyName: string;
  url: string;
  thanksText: string;
  width: number;
  height: number;
  bg: string;
  textColor: string;
  logoDataUrl?: string;
}

export function buildOutroCardHtml(options: OutroCardOptions): string {
  const templatePath = path.resolve(__dirname, '../templates/outro-card.html');
  let html = fs.readFileSync(templatePath, 'utf8');
  const { companyName, url, thanksText, width, height, bg, textColor, logoDataUrl } = options;
  const logoHtml = logoDataUrl
    ? `<div class="logo-wrap"><img src="${logoDataUrl}" alt="logo"/></div>`
    : '';
  html = html.replace('{{WIDTH}}', String(width));
  html = html.replace('{{HEIGHT}}', String(height));
  html = html.replace('{{BG}}', bg);
  html = html.replace('{{TEXT_COLOR}}', textColor);
  html = html.replace('{{COMPANY_NAME}}', companyName);
  html = html.replace('{{URL}}', url);
  html = html.replace('{{THANKS_TEXT}}', thanksText);
  html = html.replace('{{LOGO_HTML}}', logoHtml);
  return html;
}
