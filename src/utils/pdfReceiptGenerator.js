/**
 * Shared zero-dependency PDF 1.4 receipt generator for Elight Electrical Shop.
 * Used by both Supplier Payment Receipts and Customer Service Fee Receipts.
 */

function sanitizePdfText(str) {
  return String(str ?? '')
    .replace(/[—–]/g, '-')
    .replace(/[•·]/g, '|')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePdfString(str) {
  return sanitizePdfText(str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapPdfLines(text, maxChars = 76) {
  const clean = sanitizePdfText(text);
  if (!clean) return ['-'];
  const words = clean.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 6);
}

function formatReceiptMoney(amount) {
  return 'KES ' + Number(amount || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Render an A4 official payment receipt PDF buffer.
 * @param {object} spec
 * @param {string} spec.documentTitle e.g. 'OFFICIAL SUPPLIER PAYMENT RECEIPT'
 * @param {string[]} spec.metaLeft 3 lines for top-left card
 * @param {string[]} spec.metaRight 3 lines for top-right card
 * @param {boolean} spec.statusPositive highlights status line green if true, amber otherwise
 * @param {string} spec.sectionTitle e.g. 'PAYEE & SETTLEMENT DETAILS'
 * @param {Array<[string, string, string, string]>} spec.detailRows up to 4 four-tuple rows
 * @param {string} spec.amountLabel e.g. 'TOTAL AMOUNT PAID'
 * @param {string} spec.amountSubtext
 * @param {number} spec.amountValue
 * @param {string} spec.notesTitle
 * @param {string} spec.notesBody
 * @param {string} spec.footerLine
 */
function buildOfficialReceiptPdf(spec) {
  const ops = [];
  const addText = (x, y, size, text, bold = false, rgb = [0.06, 0.09, 0.16]) => {
    const font = bold ? '/F2' : '/F1';
    ops.push(`${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} rg`);
    ops.push(`BT ${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfString(text)}) Tj ET`);
  };
  const addRect = (x, y, w, h, fillRgb, strokeRgb = null) => {
    if (fillRgb) {
      ops.push(`${fillRgb[0].toFixed(3)} ${fillRgb[1].toFixed(3)} ${fillRgb[2].toFixed(3)} rg`);
    }
    if (strokeRgb) {
      ops.push(`${strokeRgb[0].toFixed(3)} ${strokeRgb[1].toFixed(3)} ${strokeRgb[2].toFixed(3)} RG`);
      ops.push('0.8 w');
    }
    ops.push(`${x} ${y} ${w} ${h} re ${fillRgb && strokeRgb ? 'B' : (fillRgb ? 'f' : 'S')}`);
  };
  const addLine = (x1, y1, x2, y2, rgb = [0.82, 0.86, 0.90], width = 0.8) => {
    ops.push(`${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  };

  // Navy header + gold stripe
  addRect(45, 720, 505, 78, [0.063, 0.169, 0.275]);
  addRect(45, 715, 505, 5, [1.0, 0.757, 0.027]);
  addText(62, 772, 17, 'ELIGHT ELECTRICAL SHOP', true, [1, 1, 1]);
  addText(62, 754, 9, 'Meru Town, Meru County, Kenya  |  Tel: +254 700 123 456  |  Email: elightelectrical@ke.com', false, [0.89, 0.93, 0.96]);
  addText(62, 734, 11, spec.documentTitle || 'OFFICIAL PAYMENT RECEIPT', true, [1.0, 0.835, 0.29]);

  // Metadata Summary Card
  addRect(45, 625, 505, 76, [0.973, 0.98, 0.988], [0.80, 0.84, 0.89]);
  const metaY = [682, 664, 646];
  (spec.metaLeft || []).slice(0, 3).forEach((line, i) => {
    addText(62, metaY[i], i === 0 ? 10 : 9.5, line, i === 0);
  });
  (spec.metaRight || []).slice(0, 3).forEach((line, i) => {
    const color = i === 0
      ? (spec.statusPositive ? [0.031, 0.455, 0.263] : [0.706, 0.325, 0.035])
      : [0.06, 0.09, 0.16];
    addText(310, metaY[i], i === 0 ? 10 : 9.5, line, i === 0, color);
  });

  // Details Card
  addRect(45, 488, 505, 122, [1, 1, 1], [0.80, 0.84, 0.89]);
  addText(62, 591, 10.5, spec.sectionTitle || 'TRANSACTION DETAILS', true, [0.063, 0.169, 0.275]);
  addLine(62, 583, 533, 583);

  let rowY = 564;
  for (const [l1, v1, l2, v2] of (spec.detailRows || []).slice(0, 4)) {
    addText(62, rowY, 9, l1, true, [0.35, 0.42, 0.50]);
    addText(152, rowY, 9, sanitizePdfText(v1).slice(0, 26), false);
    addText(310, rowY, 9, l2, true, [0.35, 0.42, 0.50]);
    addText(402, rowY, 9, sanitizePdfText(v2).slice(0, 24), false);
    rowY -= 20;
  }

  // Highlighted Total Paid Box
  addRect(45, 418, 505, 54, [0.925, 0.992, 0.961], [0.031, 0.455, 0.263]);
  addText(62, 449, 10, spec.amountLabel || 'TOTAL AMOUNT PAID', true, [0.031, 0.455, 0.263]);
  addText(62, 431, 8.5, spec.amountSubtext || 'Verified payment settlement record', false, [0.22, 0.32, 0.28]);
  addText(365, 440, 15, formatReceiptMoney(spec.amountValue), true, [0.031, 0.455, 0.263]);

  // Notes Section
  addRect(45, 290, 505, 112, [0.985, 0.99, 0.996], [0.80, 0.84, 0.89]);
  addText(62, 383, 10, spec.notesTitle || 'NOTES & SUMMARY', true, [0.063, 0.169, 0.275]);
  addLine(62, 375, 533, 375);
  const noteLines = wrapPdfLines(spec.notesBody || '-', 78);
  let noteY = 357;
  for (const nl of noteLines) {
    addText(62, noteY, 9, nl, false, [0.20, 0.25, 0.33]);
    noteY -= 15;
  }

  // Footer
  addLine(45, 110, 550, 110, [0.80, 0.84, 0.89], 0.8);
  addText(45, 92, 8.5, `Generated via Elight Electrical Shop Portal on ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`, false, [0.40, 0.45, 0.54]);
  addText(45, 78, 8.5, spec.footerLine || 'This is an official electronic payment receipt issued for verified settlement records.', false, [0.40, 0.45, 0.54]);

  const streamContent = ops.join('\n');
  const streamLen = Buffer.byteLength(streamContent, 'utf8');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `6 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream\nendobj\n`
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

module.exports = {
  buildOfficialReceiptPdf,
  formatReceiptMoney
};
