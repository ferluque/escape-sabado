import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import {
  ARCHIVE_DOCS,
  ASTROLABE_INNER,
  ASTROLABE_OUTER,
  BANK_ACCOUNTS,
  BOOK_CIPHER_ARTICLES,
  BOOK_CIPHER_COORDS,
  BUOY_ROWS,
  CARDANO_SPEC,
  CONTRALUZ_SPEC,
  EPILOGUE_NARRATIVE,
  FOLD_SPEC,
  GAME_SUBTITLE,
  GAME_TITLE,
  INTRO_NARRATIVE,
  META_ORDER_SHAPES,
  MORSE_TABLE,
  NAUTICAL_CHART_SPEC,
  PLATE_SEALS,
  PLAYERS_LABEL,
  PUZZLES,
  RADIO_SPEC,
  TOTAL_MINUTES,
  astrolabeDecode,
  encodeB64,
  evaluateRelayRules,
  normalizeAnswer,
  sha256Hex,
  solveBookCipher,
} from './game_spec.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

async function findBrowserPath() {
  for (const p of CHROME_CANDIDATES) {
    try {
      await fs.access(p);
      return p;
    } catch {
      // try next
    }
  }
  throw new Error('No se encontró Chrome o Edge instalado en las rutas estándar de Windows.');
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// ============================================================================
// GENERADORES DE GRÁFICOS VECTORIALES SVG (PRECISIÓN MILIMÉTRICA)
// ============================================================================

function renderPlateSealSvg(seal) {
  let shapeEl = '';
  if (seal.shape === '◎') {
    shapeEl = `
      <circle cx="24" cy="24" r="14" fill="none" stroke="#c81e2b" stroke-width="2.2"/>
      <circle cx="24" cy="24" r="7.5" fill="none" stroke="#c81e2b" stroke-width="2"/>
      <circle cx="24" cy="24" r="2" fill="#c81e2b"/>`;
  } else if (seal.shape === '◇') {
    shapeEl = `
      <polygon points="24,8 40,24 24,40 8,24" fill="none" stroke="#111317" stroke-width="2.2" stroke-dasharray="3.5 1.8"/>
      <polygon points="24,14 34,24 24,34 14,24" fill="none" stroke="#111317" stroke-width="1.3"/>`;
  } else if (seal.shape === '△') {
    shapeEl = `
      <polygon points="24,8 40,38 8,38" fill="none" stroke="#9a5b00" stroke-width="2.2" stroke-dasharray="2.5 1.6"/>
      <circle cx="24" cy="28" r="2.2" fill="#9a5b00"/>`;
  } else if (seal.shape === '□') {
    shapeEl = `
      <rect x="9" y="9" width="30" height="30" fill="none" stroke="#5a131a" stroke-width="2.2"/>
      <rect x="14" y="14" width="20" height="20" fill="none" stroke="#5a131a" stroke-width="1.2"/>`;
  }

  return `
  <div class="plate-seal" data-seal-id="${seal.id}" data-seal-code="${seal.code}" data-seal-shape="${seal.shape}">
    <svg width="68mm" height="19.5mm" viewBox="0 0 188 52" aria-label="Sello de Plancha ${seal.id}">
      <rect x="1.5" y="1.5" width="185" height="49" rx="2" fill="#fffdf9" stroke="#111317" stroke-width="1.1" stroke-dasharray="3 1.5"/>
      ${shapeEl}
      <text x="48" y="18" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="8" font-weight="bold" fill="#111317">PLANCHA ${seal.id} · ${seal.meridian}</text>
      <text x="48" y="30.5" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="9.5" font-weight="bold" fill="#c81e2b">COD. ${seal.code}</text>
      <text x="48" y="42.5" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="6.6" fill="#5a626a">Marca: ${seal.shape} (${seal.shapeName})</text>
    </svg>
  </div>`;
}

function renderRegMark(m) {
  const icon =
    m.shape === '▲'
      ? `<polygon points="${m.x},${m.y - 4.2} ${m.x + 4},${m.y + 3.2} ${m.x - 4},${m.y + 3.2}" fill="none" stroke="#0f172a" stroke-width="1.1"/>`
      : m.shape === '◆'
        ? `<polygon points="${m.x},${m.y - 4.2} ${m.x + 4.2},${m.y} ${m.x},${m.y + 4.2} ${m.x - 4.2},${m.y}" fill="none" stroke="#0f172a" stroke-width="1.1"/>`
        : m.shape === '■'
          ? `<rect x="${m.x - 3.6}" y="${m.y - 3.6}" width="7.2" height="7.2" fill="none" stroke="#0f172a" stroke-width="1.1"/>`
          : `<circle cx="${m.x}" cy="${m.y}" r="3.8" fill="none" stroke="#0f172a" stroke-width="1.1"/>`;

  return `
    <g class="reg-mark" data-reg-id="${m.id}" data-x="${m.x}" data-y="${m.y}">
      ${icon}
      <line x1="${m.x - 5.5}" y1="${m.y}" x2="${m.x + 5.5}" y2="${m.y}" stroke="#0f172a" stroke-width="0.45"/>
      <line x1="${m.x}" y1="${m.y - 5.5}" x2="${m.x}" y2="${m.y + 5.5}" stroke="#0f172a" stroke-width="0.45"/>
      <text x="${m.x < 80 ? m.x + 6.5 : m.x - 6.5}" y="${m.y + 1.2}" text-anchor="${m.x < 80 ? 'start' : 'end'}" font-family="'Courier New', monospace" font-size="4.2" font-weight="bold" fill="#0f172a">${m.id}</text>
    </g>`;
}

function renderCardanoBaseSvg() {
  const { widthMm, heightMm, originX, originY, cellSize, cols, rows, grid, regMarks } = CARDANO_SPEC;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = originX + c * cellSize;
      const y = originY + r * cellSize;
      const ch = grid[r][c];
      const bg = (r + c) % 2 === 0 ? '#ffffff' : '#f3f6f9';
      cells.push(`
        <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${bg}" stroke="#64748b" stroke-width="0.35"/>
        <text x="${x + cellSize / 2}" y="${y + cellSize / 2}" data-cell-r="${r}" data-cell-c="${c}" data-char="${ch}" text-anchor="middle" dominant-baseline="central" font-family="'Courier New', monospace" font-size="6.4" font-weight="bold" fill="#0f172a">${ch}</text>
      `);
    }
  }

  return `
  <svg id="cardano-base-svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="${widthMm - 2}" height="${heightMm - 2}" fill="#ffffff" stroke="#1e293b" stroke-width="0.7"/>
    <text x="${widthMm / 2}" y="9" text-anchor="middle" font-family="'Courier New', monospace" font-size="4.2" font-weight="bold" fill="#334155">MATRIZ TELEGRÁFICA PRG-1989 (12×9)</text>
    ${regMarks.map(renderRegMark).join('')}
    <rect x="${originX}" y="${originY}" width="${cols * cellSize}" height="${rows * cellSize}" fill="none" stroke="#0f172a" stroke-width="0.9"/>
    ${cells.join('')}
  </svg>`;
}

function renderCardanoMaskSvg() {
  const { widthMm, heightMm, originX, originY, cellSize, cols, rows, holeSize, windows, regMarks } = CARDANO_SPEC;
  const pad = (cellSize - holeSize) / 2;
  const cutouts = windows
    .map((w, idx) => {
      const x = originX + w.col * cellSize + pad;
      const y = originY + w.row * cellSize + pad;
      return `
      <g data-window-idx="${idx}" data-row="${w.row}" data-col="${w.col}">
        <rect data-cutout="true" data-row="${w.row}" data-col="${w.col}" x="${x}" y="${y}" width="${holeSize}" height="${holeSize}" fill="url(#cutHatch)" stroke="#b91c1c" stroke-width="0.85" stroke-dasharray="1.8 1"/>
        <text x="${x + holeSize / 2}" y="${y + holeSize / 2 + 1.2}" text-anchor="middle" font-family="sans-serif" font-size="4.4" fill="#991b1b">✂</text>
      </g>`;
    })
    .join('');

  return `
  <svg id="cardano-mask-svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="maskDots" width="4" height="4" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.55" fill="#94a3b8"/>
      </pattern>
      <pattern id="cutHatch" width="3" height="3" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="3" stroke="#dc2626" stroke-width="0.55"/>
      </pattern>
    </defs>
    <rect x="1" y="1" width="${widthMm - 2}" height="${heightMm - 2}" fill="#f8fafc" stroke="#1e293b" stroke-width="0.85"/>
    <rect x="${originX}" y="${originY}" width="${cols * cellSize}" height="${rows * cellSize}" fill="url(#maskDots)" stroke="#334155" stroke-width="0.8"/>
    <text x="${widthMm / 2}" y="9" text-anchor="middle" font-family="'Courier New', monospace" font-size="4.2" font-weight="bold" fill="#991b1b">PLANTILLA DE CENSURA · RECORTAR 8 CUADROS ✂</text>
    ${regMarks.map(renderRegMark).join('')}
    ${cutouts}
    <text x="${widthMm / 2}" y="${heightMm - 5.5}" text-anchor="middle" font-family="'Courier New', monospace" font-size="3.9" fill="#334155">Alinear R1–R4 sobre Hoja 1C · Formato: EXP-__-___</text>
  </svg>`;
}

function renderFoldInSvg() {
  const { widthMm, heightMm, foldAX, foldBX, glyphs } = FOLD_SPEC;

  const isobaths = [
    'M 8 24 C 35 18, 68 38, 92 22 C 118 8, 145 26, 168 18',
    'M 8 54 C 42 46, 65 68, 96 50 C 122 36, 148 58, 168 48',
    'M 8 86 C 34 78, 69 96, 94 82 C 124 68, 144 92, 168 82',
    'M 8 118 C 36 108, 70 130, 90 112 C 118 96, 142 122, 168 114',
    'M 8 150 C 34 142, 72 162, 95 144 C 120 128, 146 154, 168 144',
    'M 64 12 C 74 52, 66 112, 76 178',
    'M 106 12 C 96 58, 108 116, 98 178',
  ]
    .map((d) => `<path d="${d}" fill="none" stroke="#94a3b8" stroke-width="0.45" stroke-dasharray="2.2 1.6"/>`)
    .join('');

  const centerDistractors = [
    { x: 76, y: 26, t: '186m' },
    { x: 96, y: 38, t: '192m' },
    { x: 74, y: 62, t: '204m' },
    { x: 98, y: 78, t: '215m' },
    { x: 78, y: 98, t: '228m' },
    { x: 96, y: 124, t: '241m' },
    { x: 75, y: 142, t: '264m' },
    { x: 95, y: 164, t: '280m' },
  ]
    .map((d) => `<text x="${d.x}" y="${d.y}" font-family="'Courier New', monospace" font-size="3.8" fill="#64748b">${d.t}</text>`)
    .join('');

  const glyphPaths = [];
  for (const g of glyphs) {
    const polyPathsLeft = g.left.map((poly) => {
      const pts = poly.map(([u, v]) => `${(foldAX + u).toFixed(2)},${(g.yOffset + v).toFixed(2)}`).join(' ');
      return `<polyline data-fold="left" data-char="${g.char}" points="${pts}" fill="none" stroke="#111317" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    });
    const polyPathsRight = g.right.map((poly) => {
      const pts = poly.map(([u, v]) => `${(foldBX + u).toFixed(2)},${(g.yOffset + v).toFixed(2)}`).join(' ');
      return `<polyline data-fold="right" data-char="${g.char}" points="${pts}" fill="none" stroke="#111317" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    });
    glyphPaths.push(...polyPathsLeft, ...polyPathsRight);
  }

  const outerCamo = `
    <path d="M 12 25 L 36 25 M 12 55 L 38 55 M 12 85 L 34 85 M 12 115 L 36 115 M 12 145 L 35 145" stroke="#d1d5db" stroke-width="0.6"/>
    <path d="M 140 25 L 164 25 M 140 55 L 164 55 M 140 85 L 164 85 M 140 115 L 164 115 M 140 145 L 164 145" stroke="#d1d5db" stroke-width="0.6"/>
    <text x="10" y="15" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="3.5" fill="#5a626a">RÍO MOLDAVA</text>
    <text x="166" y="15" text-anchor="end" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="3.5" fill="#5a626a">COTA 186m</text>
    <text x="10" y="178.5" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="3.3" fill="#5a626a">PLANO TÁCTICO PRAGA</text>
    <text x="166" y="178.5" text-anchor="end" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="3.3" fill="#5a626a">ESC. 1:10.000</text>
  `;

  return `
  <svg id="fold-in-svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="${widthMm - 2}" height="${heightMm - 2}" fill="#ffffff" stroke="#111317" stroke-width="0.8"/>
    <rect x="6" y="10" width="${widthMm - 12}" height="${heightMm - 20}" fill="#faf9f6" stroke="#8a9296" stroke-width="0.5"/>
    ${isobaths}
    ${outerCamo}
    ${centerDistractors}
    ${glyphPaths.join('\n    ')}
    <line data-fold-line="A" x1="${foldAX}" y1="4" x2="${foldAX}" y2="${heightMm - 4}" stroke="#c81e2b" stroke-width="0.85" stroke-dasharray="3.5 2"/>
    <polygon points="${foldAX},8 ${foldAX - 3},3 ${foldAX + 3},3" fill="#c81e2b"/>
    <polygon points="${foldAX},${heightMm - 8} ${foldAX - 3},${heightMm - 3} ${foldAX + 3},${heightMm - 3}" fill="#c81e2b"/>
    <text x="${foldAX - 3}" y="8.5" text-anchor="end" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="4.2" font-weight="bold" fill="#991b1b">PLIEGUE A ▲</text>
    <text x="${foldAX - 3}" y="${heightMm - 4}" text-anchor="end" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="4.2" font-weight="bold" fill="#991b1b">PLIEGUE A ▼</text>
    <line data-fold-line="B" x1="${foldBX}" y1="4" x2="${foldBX}" y2="${heightMm - 4}" stroke="#c81e2b" stroke-width="0.85" stroke-dasharray="3.5 2"/>
    <polygon points="${foldBX},8 ${foldBX - 3},3 ${foldBX + 3},3" fill="#c81e2b"/>
    <polygon points="${foldBX},${heightMm - 8} ${foldBX - 3},${heightMm - 3} ${foldBX + 3},${heightMm - 3}" fill="#c81e2b"/>
    <text x="${foldBX + 3}" y="8.5" text-anchor="start" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="4.2" font-weight="bold" fill="#991b1b">▲ PLIEGUE B</text>
    <text x="${foldBX + 3}" y="${heightMm - 4}" text-anchor="start" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="4.2" font-weight="bold" fill="#991b1b">▼ PLIEGUE B</text>
  </svg>`;
}

function renderAstrolabeOuterSvg() {
  const sectors = 26;
  const stepDeg = 360 / sectors;
  const rOuter = 82;
  const rNum = 73;
  const rSeat = 62;
  const items = [];

  for (let k = 0; k < sectors; k++) {
    const startAngle = (-90 + (k - 0.5) * stepDeg) * (Math.PI / 180);
    const endAngle = (-90 + (k + 0.5) * stepDeg) * (Math.PI / 180);
    const midDeg = k * stepDeg;
    const x1 = (rOuter * Math.cos(startAngle)).toFixed(2);
    const y1 = (rOuter * Math.sin(startAngle)).toFixed(2);
    const x2 = (rSeat * Math.cos(startAngle)).toFixed(2);
    const y2 = (rSeat * Math.sin(startAngle)).toFixed(2);
    const numStr = String(k + 1).padStart(2, '0');
    const letter = ASTROLABE_OUTER[k];
    const fillSector =
      k % 2 === 0
        ? `<path d="M ${(rSeat * Math.cos(startAngle)).toFixed(2)} ${(rSeat * Math.sin(startAngle)).toFixed(2)} L ${x1} ${y1} A ${rOuter} ${rOuter} 0 0 1 ${(rOuter * Math.cos(endAngle)).toFixed(2)} ${(rOuter * Math.sin(endAngle)).toFixed(2)} L ${(rSeat * Math.cos(endAngle)).toFixed(2)} ${(rSeat * Math.sin(endAngle)).toFixed(2)} Z" fill="#eef2f6"/>`
        : '';

    items.push(`
      ${fillSector}
      <line x1="${x2}" y1="${y2}" x2="${x1}" y2="${y1}" stroke="#334155" stroke-width="0.45"/>
      <g transform="rotate(${midDeg.toFixed(3)})">
        <text x="0" y="-${(rOuter + rNum) / 2}" text-anchor="middle" dominant-baseline="central" font-family="'Courier New', monospace" font-size="3.8" font-weight="bold" fill="#475569">${numStr}</text>
        <text x="0" y="-${(rNum + rSeat) / 2}" text-anchor="middle" dominant-baseline="central" font-family="'Courier New', monospace" font-size="6.4" font-weight="bold" fill="#0f172a" data-outer-idx="${k}" data-outer-char="${letter}">${letter}</text>
      </g>
    `);
  }

  return `
  <svg id="astrolabe-outer-svg" width="170mm" height="170mm" viewBox="-85 -85 170 170" xmlns="http://www.w3.org/2000/svg">
    <circle cx="0" cy="0" r="${rOuter}" fill="#ffffff" stroke="#0f172a" stroke-width="1"/>
    ${items.join('')}
    <circle cx="0" cy="0" r="${rNum}" fill="none" stroke="#64748b" stroke-width="0.5"/>
    <circle cx="0" cy="0" r="${rSeat}" fill="#fcfaf2" stroke="#0f172a" stroke-width="0.95"/>
    <circle cx="0" cy="0" r="14" fill="none" stroke="#94a3b8" stroke-width="0.5" stroke-dasharray="2 1.5"/>
    <line x1="-6" y1="0" x2="6" y2="0" stroke="#991b1b" stroke-width="0.8"/>
    <line x1="0" y1="-6" x2="0" y2="6" stroke="#991b1b" stroke-width="0.8"/>
    <circle cx="0" cy="0" r="1.4" fill="#991b1b"/>
    <text x="0" y="22" text-anchor="middle" font-family="'Courier New', monospace" font-size="4.4" font-weight="bold" fill="#334155">ANILLO EXTERIOR · ORLOJ (BASE)</text>
    <text x="0" y="28" text-anchor="middle" font-family="Georgia, serif" font-size="3.8" fill="#475569">NO RECORTAR ESTA HOJA</text>
    <text x="0" y="34" text-anchor="middle" font-family="'Courier New', monospace" font-size="3.4" fill="#64748b">Asiento Ø 124 mm · Eje central (+)</text>
  </svg>`;
}

function renderAstrolabeInnerSvg() {
  const sectors = 26;
  const stepDeg = 360 / sectors;
  const rCut = 62;
  const rText = 51.5;
  const rIn = 40;
  const items = [];

  for (let i = 0; i < sectors; i++) {
    const startAngle = (-90 + (i - 0.5) * stepDeg) * (Math.PI / 180);
    const endAngle = (-90 + (i + 0.5) * stepDeg) * (Math.PI / 180);
    const midDeg = i * stepDeg;
    const x1 = (rCut * Math.cos(startAngle)).toFixed(2);
    const y1 = (rCut * Math.sin(startAngle)).toFixed(2);
    const x2 = (rIn * Math.cos(startAngle)).toFixed(2);
    const y2 = (rIn * Math.sin(startAngle)).toFixed(2);
    const letter = ASTROLABE_INNER[i];

    let sectorBg = '';
    if (i === 0) {
      sectorBg = `<path d="M ${(rIn * Math.cos(startAngle)).toFixed(2)} ${(rIn * Math.sin(startAngle)).toFixed(2)} L ${x1} ${y1} A ${rCut} ${rCut} 0 0 1 ${(rCut * Math.cos(endAngle)).toFixed(2)} ${(rCut * Math.sin(endAngle)).toFixed(2)} L ${(rIn * Math.cos(endAngle)).toFixed(2)} ${(rIn * Math.sin(endAngle)).toFixed(2)} Z" fill="url(#indexHatch)"/>`;
    } else if (i % 2 === 1) {
      sectorBg = `<path d="M ${(rIn * Math.cos(startAngle)).toFixed(2)} ${(rIn * Math.sin(startAngle)).toFixed(2)} L ${x1} ${y1} A ${rCut} ${rCut} 0 0 1 ${(rCut * Math.cos(endAngle)).toFixed(2)} ${(rCut * Math.sin(endAngle)).toFixed(2)} L ${(rIn * Math.cos(endAngle)).toFixed(2)} ${(rIn * Math.sin(endAngle)).toFixed(2)} Z" fill="#f1f5f9"/>`;
    }

    const indexPointer =
      i === 0
        ? `<polygon points="0,-${rCut - 0.6} -2.6,-${rCut - 5.2} 2.6,-${rCut - 5.2}" fill="#b91c1c" stroke="#0f172a" stroke-width="0.35"/>`
        : '';

    items.push(`
      ${sectorBg}
      <line x1="${x2}" y1="${y2}" x2="${x1}" y2="${y1}" stroke="#334155" stroke-width="0.45"/>
      <g transform="rotate(${midDeg.toFixed(3)})">
        ${indexPointer}
        <text x="0" y="-${rText - 1.2}" text-anchor="middle" dominant-baseline="central" font-family="'Courier New', monospace" font-size="6.4" font-weight="bold" fill="${i === 0 ? '#991b1b' : '#0f172a'}" data-inner-idx="${i}" data-inner-char="${letter}">${letter}</text>
      </g>
    `);
  }

  return `
  <svg id="astrolabe-inner-svg" width="136mm" height="136mm" viewBox="-68 -68 136 136" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="indexHatch" width="2.4" height="2.4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="2.4" stroke="#f59e0b" stroke-width="0.8"/>
      </pattern>
    </defs>
    <circle cx="0" cy="0" r="${rCut}" fill="#ffffff" stroke="#b91c1c" stroke-width="1" stroke-dasharray="3.2 1.8" data-cut-circle="true" data-radius="${rCut}"/>
    ${items.join('')}
    <circle cx="0" cy="0" r="${rIn}" fill="#fffdf8" stroke="#0f172a" stroke-width="0.8"/>
    <circle cx="0" cy="0" r="10" fill="none" stroke="#94a3b8" stroke-width="0.5"/>
    <line x1="-5" y1="0" x2="5" y2="0" stroke="#991b1b" stroke-width="0.8"/>
    <line x1="0" y1="-5" x2="0" y2="5" stroke="#991b1b" stroke-width="0.8"/>
    <circle cx="0" cy="0" r="1.4" fill="#991b1b"/>
    <text x="0" y="-22" text-anchor="middle" font-family="'Courier New', monospace" font-size="4" font-weight="bold" fill="#991b1b">▲ ÍNDICE EN SECTOR P</text>
    <text x="0" y="19" text-anchor="middle" font-family="'Courier New', monospace" font-size="4.2" font-weight="bold" fill="#0f172a">DISCO INTERIOR ORLOJ</text>
    <text x="0" y="25" text-anchor="middle" font-family="Georgia, serif" font-size="3.6" fill="#475569">Recortar por el borde discontinuo ✂</text>
    <text x="-47" y="-44" font-family="sans-serif" font-size="5" fill="#991b1b">✂</text>
    <text x="43" y="47" font-family="sans-serif" font-size="5" fill="#991b1b">✂</text>
  </svg>`;
}

function getSevenSegCoords(x, y, w = 16, h = 30) {
  const m = y + h / 2;
  const b = y + h;
  const r = x + w;
  return {
    a: [x + 1.5, y, r - 1.5, y],
    b: [r, y + 1.5, r, m - 1.5],
    c: [r, m + 1.5, r, b - 1.5],
    d: [x + 1.5, b, r - 1.5, b],
    e: [x, m + 1.5, x, b - 1.5],
    f: [x, y + 1.5, x, m - 1.5],
    g: [x + 1.5, m, r - 1.5, m],
  };
}

function renderContraluzSvg(layerKey) {
  const { widthMm, heightMm, regMarks, rows } = CONTRALUZ_SPEC;
  const strokeColor = '#0c1926';
  const segmentsHtml = [];

  for (const row of rows) {
    const labelBox = getSevenSegCoords(22, row.y, 13, 26);
    const labelSegs = layerKey === 'A' ? row.labelSplit.layerA : row.labelSplit.layerB;
    for (const seg of labelSegs) {
      const [x1, y1, x2, y2] = labelBox[seg];
      segmentsHtml.push(
        `<line data-row="${row.id}" data-is-label="true" data-seg="${seg}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeColor}" stroke-width="3.2" stroke-linecap="round"/>`
      );
    }
    const dotY = layerKey === 'A' ? row.y + 8 : row.y + 18;
    segmentsHtml.push(`<circle cx="42" cy="${dotY}" r="1.8" fill="${strokeColor}"/>`);

    row.digits.forEach((dig, dIdx) => {
      const box = getSevenSegCoords(dig.x, row.y, 16, 30);
      const segs = layerKey === 'A' ? dig.layerA : dig.layerB;
      for (const seg of segs) {
        const [x1, y1, x2, y2] = box[seg];
        segmentsHtml.push(
          `<line data-row="${row.id}" data-digit-idx="${dIdx}" data-target="${dig.target}" data-seg="${seg}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeColor}" stroke-width="3.6" stroke-linecap="round"/>`
        );
      }
    });
  }

  return `
  <svg id="contraluz-${layerKey.toLowerCase()}-svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="${widthMm - 2}" height="${heightMm - 2}" fill="#ffffff" stroke="#334155" stroke-width="0.7"/>
    <rect x="4" y="4" width="${widthMm - 8}" height="${heightMm - 8}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.4" stroke-dasharray="2 2"/>
    ${regMarks.map(renderRegMark).join('')}
    <line x1="76" y1="80" x2="84" y2="80" stroke="#94a3b8" stroke-width="0.6"/>
    <line x1="80" y1="76" x2="80" y2="84" stroke="#94a3b8" stroke-width="0.6"/>
    ${segmentsHtml.join('\n    ')}
    <text x="${widthMm / 2}" y="${heightMm - 8}" text-anchor="middle" font-family="'Courier New', monospace" font-size="3.9" fill="#64748b">LÁMINA ${layerKey} · ALINEAR C1–C4 AL TRASLUZ</text>
  </svg>`;
}

// ============================================================================
// CONSTRUCCIÓN DE LAS 28 PÁGINAS A4 DEL PDF
// ============================================================================

function coverPageHtml(envNum, pageStart, pageEnd, totalSheets, assets) {
  const globalPage = pageStart;
  return `
  <section class="sheet cover-sheet" data-page="${globalPage}" data-envelope="${envNum}">
    <div class="cover-frame">
      <div class="corner tl"></div><div class="corner tr"></div>
      <div class="corner bl"></div><div class="corner br"></div>
      <div class="cover-top-tag">AGENCIA X · CANAL SEGURO · NIVEL 5 · ESTACIÓN PRG-89</div>
      <img class="cover-logo" src="${assets.logoDataUri}" alt="Agencia X" />
      <div class="cover-stamp-box">EXPEDIENTE CLASIFICADO</div>
      <div class="cover-title-row">
        <img class="cover-title-icon" src="${assets.iconDataUri}" alt="" />
        <h1 class="cover-title">SOBRE ${envNum}</h1>
        <img class="cover-title-icon" src="${assets.iconDataUri}" alt="" />
      </div>
      <div class="cover-recipient">PARA AGENTES F Y L (FER Y LUCÍA)</div>
      <div class="cover-rule"></div>
      <p class="cover-warning">NO ABRIR HASTA QUE EL SISTEMA LO INDIQUE</p>
      <p class="cover-meta">Contiene ${totalSheets} páginas impresas (Págs. ${pageStart} a ${pageEnd} del dosier)</p>
      <div class="cover-footer">
        <span>Montaje a ciegas · No leer ni recortar antes de iniciar la misión</span>
        <div class="cover-sign">-- AGENCIA X CENTRAL --</div>
      </div>
    </div>
  </section>`;
}

function renderSheetHeader(folioCode, envNum, pageNum, docTitle, logoDataUri) {
  return `
  <header class="doc-header">
    <div class="doc-header-left">
      <img class="header-mini-logo" src="${logoDataUri}" alt="Agencia X" />
      <span class="badge-folio">${folioCode}</span>
      <span class="doc-header-org">CANAL SEGURO · ESTACIÓN PRG-89 · PRAGA</span>
    </div>
    <div class="doc-header-right">Sobre ${envNum} · Pág. ${pageNum}/28</div>
  </header>
  <h2 class="doc-title">${escapeHtml(docTitle)}</h2>`;
}

function buildAllPagesHtml(assets) {
  const sheetHeader = (folioCode, envNum, pageNum, docTitle) =>
    renderSheetHeader(folioCode, envNum, pageNum, docTitle, assets.logoDataUri);
  const pages = [];

  // --------------------------------------------------------------------------
  // SOBRE 1 (Págs. 1–6)
  // --------------------------------------------------------------------------
  pages.push(coverPageHtml(1, 1, 6, 6, assets)); // Pág. 1

  // Pág. 2 — Hoja 1A
  pages.push(`
  <section class="sheet" data-page="2" data-envelope="1">
    ${sheetHeader('HOJA 1A', 1, 2, 'Orden de Misión Pre-Despliegue y Enlaces Ópticos')}
    <div class="membrete-box">
      <div>
        <strong>AGENCIA X · ESTACIÓN REGIONAL CENTROEUROPEA (PRAGA)</strong><br/>
        <span>Archivo Histórico de Contrainteligencia · División Marea Roja</span>
      </div>
      <div class="station-stamp">
        <div class="stamp-mini-title">SIGLA ESTACIÓN</div>
        <div class="stamp-mini-code">PRG</div>
      </div>
    </div>

    <div class="letter-box">
      <div class="letter-meta">Agencia X Central · Canal Prioritario · Para Agentes F y L</div>
      <p><strong>Agentes Fer y Lucía:</strong></p>
      <p>Vuestra actuación en Tarifa (<em>Operación Espejismo</em>) nos permitió rastrear el nodo de <strong>Marea Roja</strong> hasta Praga. Antes de vuestro despliegue el próximo 5 de enero, ha aparecido un archivo físico de la antigua Estación PRG-89 (noviembre de 1989): alguien intentó reactivar desde dentro la red oculta bajo el río Moldava.</p>
      <p>El enlace histórico Marek Novák dejó el caso fragmentado en cuatro sobres sellados. Tened sobre la mesa la consola web conectada, tijeras, bolígrafos y la linterna del móvil. Repartíos las hojas cuando la investigación se divida en dos hilos y no abráis el siguiente sobre hasta que el sistema os lo ordene.</p>
      <p class="letter-sign">— Dirección Central, Agencia X (Nota al margen: paraguas obligatorio)</p>
    </div>

    <div class="panel-box">
      <div class="panel-title">Protocolo de Credencial de Operador (Canal Seguro)</div>
      <p class="small-note">Para autenticar la sesión de la noche del <strong>17 de noviembre de 1989</strong>, el sistema exige la clave compuesta por tres bloques separados por guiones: <strong><code>SIGLA-SERIE-TURNO</code></strong></p>
      <ul class="clean-list">
        <li><strong>SIGLA:</strong> Código oficial de 3 letras de esta estación (ver sello superior).</li>
        <li><strong>SERIE:</strong> Número de 3 dígitos del <em>único enlace óptico activo en Torre de Petřín</em> la noche del 17/11/1989.</li>
        <li><strong>TURNO:</strong> Código del cuadrante de guardia que cubría la <em>hora exacta de la anomalía óptica</em> (Hoja 1B).</li>
      </ul>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Equipo óptico</th>
          <th>Serie</th>
          <th>Emplazamiento asignado</th>
          <th>Estado a 17/11/1989</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Repetidor Láser Tipo II</td>
          <td><code>204</code></td>
          <td>Almacén de Reserva (Malá Strana)</td>
          <td>Desmontado y embalado en caja</td>
        </tr>
        <tr class="row-highlight">
          <td>Repetidor Óptico Tipo I</td>
          <td><code>318</code></td>
          <td>Torre de Petřín · Cúpula Norte</td>
          <td>■ ACTIVO en enlace nocturno</td>
        </tr>
        <tr>
          <td>Óptica Catadióptrica</td>
          <td><code>112</code></td>
          <td>Puesto Auxiliar de Vyšehrad</td>
          <td>Desactivada desde mayo de 1987</td>
        </tr>
        <tr>
          <td>Repetidor Óptico Tipo III</td>
          <td><code>409</code></td>
          <td>Castillo de Praga (Repuesto)</td>
          <td>Pendiente de montaje mecánico</td>
        </tr>
      </tbody>
    </table>
  </section>`);

  // Pág. 3 — Hoja 1B
  pages.push(`
  <section class="sheet" data-page="3" data-envelope="1">
    ${sheetHeader('HOJA 1B', 1, 3, 'Cuadrante de Guardias · 17–18 de Noviembre de 1989')}
    <p class="lead-note">Registro interno de turnos de vigilancia técnica en la Estación PRG-89 durante la noche de la interceptación.</p>

    <table class="data-table">
      <thead>
        <tr>
          <th>Turno</th>
          <th>Franja horaria</th>
          <th>Agente responsable</th>
          <th>Observaciones de servicio</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>T12</code></td>
          <td>06:00 – 14:00</td>
          <td>Jan Dvořák</td>
          <td>Revisión matinal de generadores en el Castillo y purga de filtros. Sin novedades.</td>
        </tr>
        <tr>
          <td><code>T31</code></td>
          <td>14:00 – 22:00</td>
          <td>Marek Novák</td>
          <td>Calibración de enlaces a las 17:45. Cede relevo y llave B-2 antes de bajar al Reloj Astronómico.</td>
        </tr>
        <tr class="row-highlight">
          <td><code>T49</code></td>
          <td>22:00 – 06:00</td>
          <td>Pavel Horák</td>
          <td>Guardia nocturna en Torre de Petřín. <em>Incidencia registrada en enlace óptico a las 02:15 h.</em></td>
        </tr>
        <tr>
          <td><code>T07</code></td>
          <td>08:00 – 20:00</td>
          <td>Equipo de Campo Ext.</td>
          <td>Mantenimiento diurno en exteriores. Recinto evacuado al anochecer.</td>
        </tr>
      </tbody>
    </table>

    <div class="hand-note-box">
      <div class="hand-note-title">Anotación manuscrita en cubierta del parte de incidencias (tinta azul):</div>
      <p class="handwritten">"La alarma sonora saltó a las <strong>02:15 de la madrugada</strong> en la cúpula de Petřín, pero alguien silenció el zumbador en consola. El registro automático quedó archivado bajo una clave de ocho caracteres oculta en el bloque telegráfico (Hojas 1C y 1D)."</p>
    </div>

    <div class="panel-box">
      <div class="panel-title">Acceso al Terminal Seguro de Agencia X</div>
      <p class="small-note">En cuanto introduzcáis la credencial de operador en el sistema web, quedará habilitado el <strong>Terminal de Archivo</strong> en pantalla. Allí podréis consultar cualquier código de expediente oficial que descubráis sobre el papel.</p>
    </div>
  </section>`);

  // Pág. 4 — Hoja 1C
  pages.push(`
  <section class="sheet" data-page="4" data-envelope="1">
    ${sheetHeader('HOJA 1C', 1, 4, 'Cable Telegráfico Censurado (Matriz Base)')}
    <p class="small-note">Copia íntegra del bloque telegráfico transmitido por Marek Novák el 18/11/1989. Por sí sola contiene decenas de caracteres de relleno. No recortéis esta hoja.</p>
    <div class="svg-center-box">
      ${renderCardanoBaseSvg()}
    </div>
    <p class="small-note"><strong>Instrucción:</strong> Superponed sobre este cuadrante la <em>Plantilla de Censura</em> de la Hoja 1D una vez recortadas sus ocho ventanas interiores.</p>
  </section>`);

  // Pág. 5 — Hoja 1D
  pages.push(`
  <section class="sheet" data-page="5" data-envelope="1">
    ${sheetHeader('HOJA 1D', 1, 5, 'Plantilla de Censura · Rejilla de Cardano (RECORTAR VENTANAS)')}
    <p class="small-note">Con unas tijeras (o doblando ligeramente cada casilla para iniciar el corte), recortad únicamente los <strong>8 cuadrados interiores</strong> marcados con línea discontinua roja y el icono ✂. Después alinead las marcas de las cuatro esquinas (<strong>▲ ◆ ■ ●</strong>) sobre la Hoja 1C.</p>
    <div class="svg-center-box">
      ${renderCardanoMaskSvg()}
    </div>
    <p class="small-note">Leed los caracteres revelados de izquierda a derecha y de arriba a abajo para formar la referencia <code>EXP-__-___</code> e introducidla tanto en el reto 1.2 como en el <strong>Terminal de Archivo</strong>.</p>
  </section>`);

  // Pág. 6 — Hoja 1E (Sello de Plancha I)
  pages.push(`
  <section class="sheet" data-page="6" data-envelope="1">
    ${sheetHeader('HOJA 1E', 1, 6, 'Calibración Nominal del Repetidor Óptico · Torre de Petřín')}
    <p class="lead-note">Ficha técnica de enlace de la Torre de Petřín para cruzar con el registro de telemetría recuperado del Terminal.</p>

    <div class="panel-box">
      <div class="panel-title">Parámetros Oficiales del Haz Óptico</div>
      <table class="data-table compact">
        <tbody>
          <tr>
            <th>Corredor vigilado</th>
            <td>Sector Centro · Puente de Carlos / Ciudad Vieja (Praga)</td>
          </tr>
          <tr>
            <th>Azimut nominal oficial (Protocolo 1984)</th>
            <td><strong>284°</strong> (referencia fija desde plataforma de torre)</td>
          </tr>
          <tr>
            <th>Tolerancia operativa por oscilación</th>
            <td>±10° máximo admisible por viento térmico</td>
          </tr>
          <tr>
            <th>Umbral de anomalía crítica (Sabotaje)</th>
            <td>Desviación estrictamente <strong>superior a 10°</strong> respecto a 284°</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel-box">
      <div class="panel-title">Cálculo de la clave del Reto 1.3</div>
      <p class="small-note">Consultad la referencia extraída de la rejilla de Cardano en el <strong>Terminal de Archivo</strong>. Localizad el instante de anomalía crítica y calculad la diferencia absoluta en grados respecto al azimut nominal oficial (<code>284°</code>).</p>
      <p class="small-note">Formato de respuesta requerido: <strong><code>GRADOS-HHMM</code></strong> (ejemplo: si una desviación fuera de 08° a las 01:30, escribiríais <code>08-0130</code>).</p>
    </div>

    <div class="hand-note-box">
      <div class="hand-note-title">Nota de conservación de Marek Novák:</div>
      <p class="handwritten">"Guardad este sello inferior. Cada uno de los cuatro sobres conserva una plancha distinta; al final de la operación las necesitaréis todas juntas."</p>
    </div>

    <div class="sheet-bottom-seal">
      ${renderPlateSealSvg(PLATE_SEALS[0])}
    </div>
  </section>`);

  // --------------------------------------------------------------------------
  // SOBRE 2 (Págs. 7–14)
  // --------------------------------------------------------------------------
  pages.push(coverPageHtml(2, 7, 14, 8, assets)); // Pág. 7

  // Pág. 8 — Hoja 2A (Sello de Plancha II + Instrucciones Hilo A)
  pages.push(`
  <section class="sheet" data-page="8" data-envelope="2">
    ${sheetHeader('HOJA 2A', 2, 8, 'HILO A · Plano Táctico del Moldava e Instrucciones de Pliegue')}
    <div class="coop-banner">TRABAJO COOPERATIVO PARALELO: Mientras uno de los dos resuelve este Hilo A (Hojas 2A–2B), el otro puede avanzar el Hilo B con la Hoja 2C y el Receptor de Radiobaliza.</div>

    <div class="panel-box">
      <div class="panel-title">Instrucciones de Plegado Oculto (Hoja 2B)</div>
      <p class="small-note">El plano de la Hoja 2B esconde el sector exacto del río Moldava donde la célula de Marea Roja escondió su enlace de salida. Para revelarlo sin dañar la lámina:</p>
      <ol class="clean-list">
        <li>Localizad las dos líneas verticales discontinuas marcadas como <strong>PLIEGUE A (▲A)</strong> y <strong>PLIEGUE B (▲B)</strong>.</li>
        <li>Realizad un pliegue hacia atrás por la línea <strong>PLIEGUE A</strong> y otro por la línea <strong>PLIEGUE B</strong> (doblando en acordeón para ocultar por detrás toda la franja central con las cotas topográficas en metros).</li>
        <li>Unid exactamente borde con borde la línea <strong>PLIEGUE A</strong> y la línea <strong>PLIEGUE B</strong>. Los fragmentos dispersos encajarán formando un código vertical de 6 caracteres.</li>
      </ol>
      <p class="small-note">Introducid el código revelado en el <strong>Hilo A (2.A)</strong> con formato <code>PALABRA-NUMERO</code> (ej. <code>ZONA-00</code>).</p>
    </div>

    <div class="hand-note-box">
      <div class="hand-note-title">Extracto de la nota de cubierta de Marek Novák:</div>
      <p class="handwritten">"No cruzaron por los puentes principales vigilados por la policía. Quien desvió el repetidor cubrió la retirada bajo un punto concreto de la ribera."</p>
    </div>

    <div class="sheet-bottom-seal">
      ${renderPlateSealSvg(PLATE_SEALS[1])}
    </div>
  </section>`);

  // Pág. 9 — Hoja 2B (Fold-in SVG grande -> ARCO-42)
  pages.push(`
  <section class="sheet" data-page="9" data-envelope="2">
    ${sheetHeader('HOJA 2B', 2, 9, 'HILO A · Levantamiento Táctico Ribera del Moldava (PLEGAR A ↔ B)')}
    <p class="small-note">Doblad esta hoja ocultando la zona central entre <strong>PLIEGUE A</strong> y <strong>PLIEGUE B</strong> hasta tocar ambas líneas.</p>
    <div class="svg-center-box">
      ${renderFoldInSvg()}
    </div>
  </section>`);

  // Pág. 10 — Hoja 2C (Tabla Balizas + Tabla Morse)
  const buoyRowsHtml = BUOY_ROWS.map(
    (b) => `
    <tr>
      <td><strong>${b.code}</strong></td>
      <td>${b.sector}</td>
      <td><code>${b.freq}</code></td>
      <td>${b.mod}</td>
      <td>${b.status}</td>
      <td><code>${b.ref}</code></td>
    </tr>`
  ).join('');

  const morseEntries = Object.entries(MORSE_TABLE);
  const morseHalf = Math.ceil(morseEntries.length / 2);
  const renderMorseCol = (arr) =>
    arr
      .map(
        ([ch, code]) =>
          `<div class="morse-cell"><span class="morse-ch">${ch}</span><span class="morse-dots">${code
            .replaceAll('.', '·')
            .replaceAll('-', '—')}</span></div>`
      )
      .join('');

  pages.push(`
  <section class="sheet" data-page="10" data-envelope="2">
    ${sheetHeader('HOJA 2C', 2, 10, 'HILO B · Registro de Radiobalizas y Código Morse Internacional')}
    <div class="coop-banner">HILO B (PARALELO): Identifica la frecuencia exacta para sintonizar la señal en el Receptor Web Audio.</div>

    <div class="panel-box compact-box">
      <div class="panel-title">Criterios de Filtrado (Nota técnica de Agencia X)</div>
      <p class="small-note">La transmisión clandestina procede únicamente de una baliza que cumpla las <strong>cuatro condiciones simultáneas</strong>: (1) Sector <strong>Praga (Petřín)</strong>, (2) Banda de <strong>400 kHz</strong>, (3) Modulación <strong>CW Morse</strong> y (4) Estado <strong>Activa instalada después de 1988</strong>.</p>
    </div>

    <table class="data-table compact">
      <thead>
        <tr>
          <th>Baliza</th>
          <th>Sector</th>
          <th>Frecuencia</th>
          <th>Modulación</th>
          <th>Estado</th>
          <th>Ref.</th>
        </tr>
      </thead>
      <tbody>
        ${buoyRowsHtml}
      </tbody>
    </table>

    <div class="panel-box compact-box">
      <div class="panel-title">Tabla Oficial de Código Morse Internacional (Punto · / Raya —)</div>
      <div class="morse-grid">
        <div class="morse-col">${renderMorseCol(morseEntries.slice(0, morseHalf))}</div>
        <div class="morse-col">${renderMorseCol(morseEntries.slice(morseHalf))}</div>
      </div>
    </div>
  </section>`);

  // Pág. 11 — Hoja 2D (Manual Disco del Orloj)
  pages.push(`
  <section class="sheet" data-page="11" data-envelope="2">
    ${sheetHeader('HOJA 2D', 2, 11, 'CONVERGENCIA A+B · Manual del Disco Astronómico del Orloj')}
    <p class="lead-note">Cuando hayáis completado tanto el <strong>Hilo A (2.A)</strong> como el <strong>Hilo B (2.B)</strong>, reunid sus resultados para operar este instrumento.</p>

    <div class="panel-box">
      <div class="panel-title">Montaje y Uso del Disco del Orloj</div>
      <ol class="clean-list">
        <li>Tomad la <strong>Hoja 2F</strong> y recortad cuidadosamente con tijeras el <strong>Disco Interior</strong> por su borde circular discontinuo rojo (✂). <strong>No recortéis la Hoja 2E</strong>.</li>
        <li>Apoyad el Disco Interior recortado sobre el círculo central de la <strong>Hoja 2E (Anillo Exterior)</strong> haciendo coincidir ambos centros marcados con una cruz roja (<code>+</code>). Podéis sujetar el centro con la punta de un bolígrafo mientras lo giráis.</li>
        <li>Girad el Disco Interior hasta que la flecha prominente <strong><code>▲ ÍNDICE</code></strong> (situada en el sector rayado de la letra <code>P</code>) apunte exactamente a la letra o número de sector indicado en el despacho digital <strong><code>DESPACHO-042</code></strong>.</li>
        <li>Para <strong>DESCIFRAR</strong> un criptograma: localizad cada letra del mensaje cifrado en el <strong>Disco Interior</strong> y leed la letra correspondiente alineada justo enfrente en el <strong>Anillo Exterior</strong>.</li>
      </ol>
    </div>

    <div class="hand-note-box">
      <div class="hand-note-title">Nota sobre la conservación del instrumento:</div>
      <p class="handwritten">"No guardéis aún el Disco del Orloj al concluir el Sobre 2. Su escala numérica 01–26 del Anillo Exterior volverá a ser imprescindible cuando reunáis los cuatro sellos de plancha al final de la misión."</p>
    </div>
  </section>`);

  // Pág. 12 — Hoja 2E (Orloj Anillo Exterior Base)
  pages.push(`
  <section class="sheet" data-page="12" data-envelope="2">
    ${sheetHeader('HOJA 2E', 2, 12, 'Disco del Orloj · Anillo Exterior Base (NO RECORTAR)')}
    <p class="small-note">Colocad aquí encima el Disco Interior recortado de la Hoja 2F haciendo coincidir la cruz central (<code>+</code>).</p>
    <div class="svg-center-box">
      ${renderAstrolabeOuterSvg()}
    </div>
  </section>`);

  // Pág. 13 — Hoja 2F (Orloj Disco Interior Recortable)
  pages.push(`
  <section class="sheet" data-page="13" data-envelope="2">
    ${sheetHeader('HOJA 2F', 2, 13, 'Disco del Orloj · Disco Interior Cifrador (RECORTAR ✂)')}
    <p class="small-note">Recortad el círculo completo por la línea discontinua roja exterior (Ø 124 mm). El sector rayado con <strong>▲ ÍNDICE</strong> marca el punto de alineación.</p>
    <div class="svg-center-box">
      ${renderAstrolabeInnerSvg()}
    </div>
  </section>`);

  // Pág. 14 — Hoja 2G (Hoja de trabajo Convergencia -> 7 letras DEMINKA)
  pages.push(`
  <section class="sheet" data-page="14" data-envelope="2">
    ${sheetHeader('HOJA 2G', 2, 14, 'Cuaderno de Convergencia A+B · Registro de Descifrado')}
    <p class="lead-note">Usad esta hoja para anotar y cruzar la información que ha reunido cada agente durante el Acto II.</p>

    <div class="panel-box">
      <div class="panel-title">Casillas de Trabajo</div>
      <div class="work-grid">
        <div class="work-row"><span>1. Sector del Plano Plegado (Hilo A):</span><div class="blank-line"></div></div>
        <div class="work-row"><span>2. Palabra recibida en Radiobaliza Morse (Hilo B):</span><div class="blank-line"></div></div>
        <div class="work-row"><span>3. Letra de alineación para ▲ ÍNDICE (según DESPACHO-042):</span><div class="blank-line"></div></div>
        <div class="work-row"><span>4. Criptograma recuperado en DESPACHO-042:</span><div class="blank-line"></div></div>
      </div>
    </div>

    <div class="panel-box">
      <div class="panel-title">Tabla de Traducción Letra a Letra (Disco Interior → Anillo Exterior)</div>
      <table class="data-table">
        <thead>
          <tr><th>Posición</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th></tr>
        </thead>
        <tbody>
          <tr><th>Letra Interior (Cifrada)</th><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
          <tr><th>Letra Exterior (Clara)</th><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        </tbody>
      </table>
    </div>
  </section>`);

  // --------------------------------------------------------------------------
  // SOBRE 3 (Págs. 15–22)
  // --------------------------------------------------------------------------
  pages.push(coverPageHtml(3, 15, 22, 8, assets)); // Pág. 15

  // Pág. 16 — Hoja 3A
  pages.push(`
  <section class="sheet" data-page="16" data-envelope="3">
    ${sheetHeader('HOJA 3A', 3, 16, 'HILO A · Boletín Interno, Recibo #19 y Control de Accesos')}
    <div class="coop-banner">SEGUNDA BIFURCACIÓN COOPERATIVA: Hilo A (Hojas 3A–3C, contrainteligencia y manual) e Hilo B (Hojas 3D–3G, óptica al contraluz y mapa táctico de Praga).</div>

    <div class="newspaper-box">
      <div class="news-head">BOLETÍN RESERVADO PRAGA · NOVIEMBRE DE 1989</div>
      <h3>La dirección regional atribuyó el apagón óptico de Petřín a un fallo eléctrico fortuito</h3>
      <p>El responsable de turno de despacho, <strong>Dr. Viktor Kovář</strong>, sostuvo en su informe desde Brno que una sobrecarga cortó el enlace óptico poco después de las dos de la madrugada. Sin embargo, los archivos internos apuntan a que el enlace fue girado manualmente desde la cúpula mientras Marek Novák ocultaba las pruebas originales.</p>
    </div>

    <div class="receipt-box">
      <div class="receipt-title">RESGUARDO DE CUSTODIA DE LLAVES · RECIBO #19</div>
      <p><strong>Fecha y hora:</strong> 17/11/1989 · 18:05 h</p>
      <p><strong>Entrega:</strong> Marek Novák (Agente sénior) hace entrega temporal de la llave de servicio <strong><code>LLAVE B-2</code></strong> (acceso interior a Sala Óptica · Torre de Petřín).</p>
      <p><strong>Receptor autorizado para guardia nocturna:</strong> <strong>Pavel Horák</strong> (Técnico de guardia de noche).</p>
      <p class="small-note"><em>Firmado por ambos al pie del resguardo antes del relevo vespertino.</em></p>
    </div>

    <div class="panel-box">
      <div class="panel-title">Referencia digital asociada</div>
      <p class="small-note">Consultad en el <strong>Terminal de Archivo</strong> la referencia de auditoría electrónica de cerraduras: <strong><code>EXP-LLAVES-89</code></strong> para verificar qué llave exacta abrió y cerró la Sala Óptica durante el sabotaje.</p>
    </div>
  </section>`);

  // Pág. 17 — Hoja 3B
  pages.push(`
  <section class="sheet" data-page="17" data-envelope="3">
    ${sheetHeader('HOJA 3B', 3, 17, 'HILO A · Registro de Centralita y Coartadas Verificadas')}
    <p class="lead-note">Cruzad los movimientos documentados de los cinco miembros de la Estación PRG-89 entre las 01:45 y las 03:00 de la madrugada del 17 al 18 de noviembre de 1989.</p>

    <table class="data-table compact">
      <thead>
        <tr>
          <th>Agente / Personal</th>
          <th>Llave asignada</th>
          <th>Coartada / Registro físico (02:00–02:45)</th>
          <th>Centralita telefónica</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Dr. Viktor Kovář</strong><br/><span>(Jefe Estación)</span></td>
          <td><code>B-1</code><br/>(Despacho)</td>
          <td>Confirmada presencia en enlace provincial de Brno (200 km; tren nocturno documentado).</td>
          <td>Llamada entrante verificada desde Brno a las <code>02:12</code>.</td>
        </tr>
        <tr>
          <td><strong>Marek Novák</strong><br/><span>(Enlace Sénior)</span></td>
          <td><code>B-2</code><br/><em>(Cedida 18:05)</em></td>
          <td>Acompañado por dos vigilantes de ronda junto al Reloj Astronómico entre <code>02:05</code> y <code>02:30</code>.</td>
          <td>Sin llamadas en cabina.</td>
        </tr>
        <tr>
          <td><strong>Klára Veselá</strong><br/><span>(Archivera)</span></td>
          <td><code>A-4</code><br/>(Microfilms)</td>
          <td>Bono de tranvía hacia Vinohrady sellado a las <code>21:40</code>; testigo en piso familiar.</td>
          <td>Sin actividad nocturna.</td>
        </tr>
        <tr>
          <td><strong>Jan Dvořák</strong><br/><span>(Maquinista)</span></td>
          <td><code>C-1</code><br/>(Sótano Castillo)</td>
          <td>Parte de avería firmado con aprendiz en sala de generadores del Castillo de <code>02:05</code> a <code>02:40</code>.</td>
          <td>Llamada interna sótano <code>02:22</code>.</td>
        </tr>
        <tr>
          <td><strong>Pavel Horák</strong><br/><span>(Téc. Nocturno)</span></td>
          <td><code>B-2</code><br/><em>(Recibo #19)</em></td>
          <td><strong>Sin testigo ni registro verificado</strong> entre las <code>02:00</code> y las <code>02:45</code> en su puesto.</td>
          <td>Llamada saliente a las <code>02:50</code> desde cabina hacia buzón de Marea Roja (<code>420-44-109</code>).</td>
        </tr>
      </tbody>
    </table>

    <div class="panel-box">
      <div class="panel-title">Objetivo del Reto 3.A</div>
      <p class="small-note">Una vez verificado <code>EXP-LLAVES-89</code> en el Terminal y contrastadas las coartadas, introducid en el <strong>Reto 3.A</strong> el <strong>nombre y apellido</strong> del topo que manipuló la torre.</p>
    </div>
  </section>`);

  // Pág. 18 — Hoja 3C (Cifrado de Libro)
  const articlesHtml = BOOK_CIPHER_ARTICLES.map((art) => {
    const words = art.text.trim().split(/\s+/);
    const tagged = words
      .map((w, idx) => {
        const pos = idx + 1;
        if (pos === 5 || pos === 10) {
          return `${escapeHtml(w)}<sup class="word-mark">[${pos}]</sup>`;
        }
        return escapeHtml(w);
      })
      .join(' ');
    return `<div class="article-row"><span class="art-num">Art. ${art.num}.</span> <span class="art-body">${tagged}</span></div>`;
  }).join('');

  pages.push(`
  <section class="sheet" data-page="18" data-envelope="3">
    ${sheetHeader('HOJA 3C', 3, 18, 'HILO A · Extracto del Manual de Operaciones Agencia X (Ed. 1979)')}
    <p class="lead-note">Texto normativo utilizado como base de cifrado de libro. Cuando desbloqueéis el registro <strong><code>BITACORA-MN</code></strong> en el Terminal tras resolver 3.A, aplicad aquí sus pares <code>(Artículo · Palabra)</code>.</p>

    <div class="reglamento-box">
      <div class="reglamento-head">MANUAL DE OPERACIONES PRAGA · CAPÍTULO IV (CUSTODIA DE MATRICES)</div>
      ${articlesHtml}
    </div>

    <div class="panel-box">
      <div class="panel-title">Instrucciones de conteo</div>
      <p class="small-note">Contad cada palabra de izquierda a derecha dentro de cada artículo (los superíndices discretos <code>[5]</code> y <code>[10]</code> agilizan el conteo). Tomad únicamente la <strong>primera letra</strong> de cada palabra señalada (ignorando tildes) para obtener la ubicación de 8 letras donde Novák ocultó las matrices originales (Reto 3.B).</p>
    </div>
  </section>`);

  // Pág. 19 — Hoja 3D (Contraluz Lámina A)
  pages.push(`
  <section class="sheet contraluz-sheet" data-page="19" data-envelope="3">
    <div class="contraluz-header">
      ${sheetHeader('HOJA 3D', 3, 19, 'HILO B · Lámina Óptica A (Contraluz)')}
      <p class="small-note">Colocad esta página boca arriba sobre la linterna del móvil y poned encima la <strong>Hoja 3E</strong> (también boca arriba), alineando las cuatro esquinas <strong>C1(▲) C2(◆) C3(■) C4(●)</strong>.</p>
    </div>
    <div class="svg-center-box optical-zone">
      ${renderContraluzSvg('A')}
    </div>
  </section>`);

  // Pág. 20 — Hoja 3E (Contraluz Lámina B)
  pages.push(`
  <section class="sheet contraluz-sheet" data-page="20" data-envelope="3">
    <div class="contraluz-header">
      ${sheetHeader('HOJA 3E', 3, 20, 'HILO B · Lámina Óptica B (Superponer sobre 3D)')}
      <p class="small-note">Superponed esta lámina exactamente sobre la Hoja 3D frente a una fuente de luz brillante para recomponer los dos rumbos de tres dígitos.</p>
    </div>
    <div class="svg-center-box optical-zone">
      ${renderContraluzSvg('B')}
    </div>
  </section>`);

  // Pág. 21 — Hoja 3F (Instrucciones Mapa Táctico + Sello de Plancha III)
  pages.push(`
  <section class="sheet" data-page="21" data-envelope="3">
    ${sheetHeader('HOJA 3F', 3, 21, 'HILO B · Procedimiento de Triangulación en Mapa Táctico de Praga')}
    <div class="panel-box">
      <div class="panel-title">Interpretación de los rumbos revelados al trasluz</div>
      <ul class="clean-list">
        <li>La cifra superior marcada con <strong><code>F:</code></strong> indica el rumbo magnético en grados desde el <strong>Foco de Petřín</strong>.</li>
        <li>La cifra inferior marcada con <strong><code>B:</code></strong> indica el rumbo magnético en grados desde la <strong>Baliza Orloj (Reloj Astronómico)</strong>.</li>
        <li>Abrid la pestaña <strong>Mapa Táctico</strong> en la consola web, ajustad ambos diales a los grados obtenidos al trasluz y observad el punto exacto donde se cruzan ambos haces.</li>
        <li>Haced clic en el cuadrante exacto de intersección (<code>A1–F6</code>) y confirmad el código con el formato <strong><code>RUMBO_F-RUMBO_B-CUADRANTE</code></strong> (ejemplo: <code>180-270-B3</code>).</li>
      </ul>
    </div>

    <div class="hand-note-box">
      <div class="hand-note-title">Nota manuscrita de Marek Novák:</div>
      <p class="handwritten">"Si el agua del Moldava sube, buscad justo donde se cruzan la luz de Petřín y la señal del Reloj Astronómico. Allí, bajo la isla, siguen selladas las matrices."</p>
    </div>

    <div class="sheet-bottom-seal">
      ${renderPlateSealSvg(PLATE_SEALS[2])}
    </div>
  </section>`);

  // Pág. 22 — Hoja 3G (Plano referencial Praga)
  pages.push(`
  <section class="sheet" data-page="22" data-envelope="3">
    ${sheetHeader('HOJA 3G', 3, 22, 'HILO B · Cuadrícula de Reconocimiento en Praga')}
    <p class="lead-note">Referencia de sectores urbanos de Praga sobre la que opera el Mapa Táctico Interactivo del Acto III.</p>

    <div class="panel-box">
      <div class="panel-title">Leyenda de Cuadrantes de Praga (A1 – F6)</div>
      <table class="data-table compact">
        <thead>
          <tr><th>Franja</th><th>Columna A–B</th><th>Columna C–D</th><th>Columna E–F</th></tr>
        </thead>
        <tbody>
          <tr><th>Filas 1–2</th><td>Hradčany / Castillo de Praga</td><td><strong>Foco de Petřín (D1/E1)</strong></td><td>Barrio Judío (Josefov)</td></tr>
          <tr><th>Filas 3–4</th><td>Malá Strana Oeste</td><td>Puente de Carlos · Isla Kampa (Cisternas)</td><td>Ciudad Vieja</td></tr>
          <tr><th>Filas 5–6</th><td>Ribera Smíchov</td><td>Recodo Sur del Moldava</td><td><strong>Baliza Orloj (Sector F5)</strong></td></tr>
        </tbody>
      </table>
    </div>

    <div class="panel-box">
      <div class="panel-title">Casillas de convergencia del Acto III</div>
      <div class="work-grid">
        <div class="work-row"><span>Topo infiltrado en Estación PRG-89 (Hilo A · 3.A):</span><div class="blank-line"></div></div>
        <div class="work-row"><span>Escondite en Manual de 1979 (Hilo A · 3.B):</span><div class="blank-line"></div></div>
        <div class="work-row"><span>Triangulación sobre el Moldava (Hilo B · 3.C):</span><div class="blank-line"></div></div>
      </div>
    </div>
  </section>`);

  // --------------------------------------------------------------------------
  // SOBRE 4 (Págs. 23–28)
  // --------------------------------------------------------------------------
  pages.push(coverPageHtml(4, 23, 28, 6, assets)); // Pág. 23

  // Pág. 24 — Hoja 4A (Télex + Cuentas Marea Roja)
  const bankRowsHtml = BANK_ACCOUNTS.map(
    (a) => `
    <tr>
      <td><code>${a.id}</code></td>
      <td>${a.tramo1}</td>
      <td>${a.tramo2}</td>
      <td><strong>${a.firma}</strong></td>
      <td>${a.nota}</td>
    </tr>`
  ).join('');

  pages.push(`
  <section class="sheet" data-page="24" data-envelope="4">
    ${sheetHeader('HOJA 4A', 4, 24, 'Télex Intervenidos y Cuentas de Marea Roja')}
    <p class="lead-note">Material recuperado de la caja estanca bajo el Moldava. Cruzad estos movimientos con el expediente digital <strong><code>EXP-MAREA-89</code></strong> en el Terminal.</p>

    <div class="telex-grid">
      <div class="telex-box">
        <div class="telex-head">TÉLEX #1 · 13/11/1989 · 11:20 Z</div>
        <pre>DE: ENLACE FINANCIERO MAREA ROJA
A: BANCA EXTERIOR / VIENA
ASUNTO: FONDO PRG-89

AUTORIZO COMISION PACTADA DEL 15 POR CIENTO
DEL FONDO TOTAL MOVILIZADO.
EJECUTAR EN DOS TRAMOS IDENTICOS:
TRAMO A PREVIO AL 17 NOV / TRAMO B TRAS CORTE.
IMPRESCINDIBLE FIRMA ENLACE FINANCIERO.</pre>
      </div>
      <div class="telex-box">
        <div class="telex-head">TÉLEX #2 · 20/11/1989 · 08:45 Z</div>
        <pre>DE: CELULA PRAGA
A: ENLACE FINANCIERO MAREA ROJA
ASUNTO: LIQUIDACION TRAMO B

ARCHIVO SELLADO. RASTRO DESVIADO.
SEGUNDO ABONO CONFIRMADO HOY CON IDENTICO
IMPORTE Y FIRMA QUE EL TRAMO PREVIO.</pre>
      </div>
    </div>

    <table class="data-table compact">
      <thead>
        <tr>
          <th>Código Cuenta</th>
          <th>Movimiento 1</th>
          <th>Movimiento 2</th>
          <th>Firma</th>
          <th>Observación</th>
        </tr>
      </thead>
      <tbody>
        ${bankRowsHtml}
      </tbody>
    </table>

    <p class="small-note">Introducid el código de la única cuenta que cumple íntegramente las condiciones de los télex y de <code>EXP-MAREA-89</code> en el <strong>Reto 4.1</strong>.</p>
  </section>`);

  // Pág. 25 — Hoja 4B (Consola de Relés - Reglas)
  pages.push(`
  <section class="sheet" data-page="25" data-envelope="4">
    ${sheetHeader('HOJA 4B', 4, 25, 'Esquema de Enclavamiento Eléctrico · Bóveda Cero')}
    <p class="lead-note">Para desbloquear la Bóveda Cero de Agencia X debéis programar los seis relés numerados del <strong>1 al 6</strong> (<code>R1, R2, R3, R4, R5, R6</code>) y la fase de línea en la Consola de Relés interactiva.</p>

    <div class="panel-box">
      <div class="panel-title">Reglas de Seguridad de la Placa Lógica (Leyenda B/N: ■ ACTIVO / □ INACTIVO)</div>
      <ol class="clean-list">
        <li><strong>Carga máxima:</strong> Deben permanecer exactamente <strong>3 relés en estado ■ ACTIVO</strong> y 3 en estado □ INACTIVO.</li>
        <li><strong>Bloqueo diferencial (R1 / R2):</strong> Los relés <code>R1</code> y <code>R2</code> deben tener <strong>estados opuestos</strong> (si uno está ■ activo, el otro está □ inactivo).</li>
        <li><strong>Acoplamiento en serie (R3 / R4):</strong> Los relés <code>R3</code> y <code>R4</code> comparten bobina y deben tener siempre <strong>el mismo estado</strong> (ambos ■ activos o ambos □ inactivos).</li>
        <li><strong>Equilibrio de tensión:</strong> La <strong>suma aritmética de los índices numéricos</strong> (1 a 6) de los relés ■ activos debe igualar exactamente el voltaje nominal de la línea útil indicada en la <strong>Hoja 4C</strong>.</li>
      </ol>
    </div>

    <div class="relay-diagram-box">
      <svg width="166mm" height="44mm" viewBox="0 0 166 44" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="164" height="42" rx="2" fill="#f8fafc" stroke="#334155" stroke-width="0.7"/>
        <text x="83" y="8.5" text-anchor="middle" font-family="'Courier New', monospace" font-size="4.2" font-weight="bold" fill="#0f172a">BUS DE ENCLAVAMIENTO R1 – R6</text>
        ${[1, 2, 3, 4, 5, 6]
          .map((n) => {
            const x = 14 + (n - 1) * 25;
            return `
            <rect x="${x}" y="13" width="16" height="20" rx="1.5" fill="#ffffff" stroke="#0f172a" stroke-width="0.7"/>
            <text x="${x + 8}" y="21" text-anchor="middle" font-family="'Courier New', monospace" font-size="5" font-weight="bold" fill="#0f172a">R${n}</text>
            <text x="${x + 8}" y="29" text-anchor="middle" font-family="'Courier New', monospace" font-size="3.6" fill="#475569">idx ${n}</text>`;
          })
          .join('')}
        <path d="M 22 33 L 22 38 L 47 38 L 47 33" fill="none" stroke="#c81e2b" stroke-width="0.8"/>
        <text x="34.5" y="41.5" text-anchor="middle" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="3.3" fill="#c81e2b">R1 ≠ R2</text>
        <path d="M 72 33 L 72 38 L 97 38 L 97 33" fill="none" stroke="#9a5b00" stroke-width="0.8" stroke-dasharray="1.8 1"/>
        <text x="84.5" y="41.5" text-anchor="middle" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="3.3" fill="#9a5b00">R3 = R4</text>
        <text x="134" y="39" text-anchor="middle" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="3.5" fill="#111317">Σ índices activos = V</text>
      </svg>
    </div>
  </section>`);

  // Pág. 26 — Hoja 4C (Tabla de Fase y Tensión Nominal)
  pages.push(`
  <section class="sheet" data-page="26" data-envelope="4">
    ${sheetHeader('HOJA 4C', 4, 26, 'Parte de Tensión Auxiliar y Diagnóstico de Fases')}
    <p class="lead-note">Lectura de polímetro realizada tras activar el tablero de emergencia de Bóveda Cero en Praga.</p>

    <table class="data-table">
      <thead>
        <tr>
          <th>Selector</th>
          <th>Línea física</th>
          <th>Estado del fusible</th>
          <th>Voltaje nominal útil</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>FASE I</code></td>
          <td>Plancha I-A (Torre antigua)</td>
          <td>□ Fusible abierto (sin retorno)</td>
          <td><code>0 V</code></td>
        </tr>
        <tr>
          <td><code>FASE II</code></td>
          <td>Plancha II-A (Enlace ribera)</td>
          <td>□ Cortocircuito por humedad</td>
          <td><code>0 V</code></td>
        </tr>
        <tr>
          <td><code>FASE III</code></td>
          <td>Plancha III-C (Repetidor exterior)</td>
          <td>□ Línea seccionada</td>
          <td><code>0 V</code></td>
        </tr>
        <tr class="row-highlight">
          <td><code>FASE IV</code></td>
          <td>Plancha IV-B (Bóveda Cero)</td>
          <td>■ CONECTADA Y ESTABLE</td>
          <td><code>12 V nominales</code></td>
        </tr>
      </tbody>
    </table>

    <div class="panel-box">
      <div class="panel-title">Validación del Reto 4.2</div>
      <p class="small-note">En la <strong>Consola de Relés</strong> de la aplicación web, activad o desactivad los conmutadores <code>R1–R6</code> para obtener la única combinación que cumple las 4 condiciones de la Hoja 4B con la tensión exacta requerida por la fase útil, seleccionad dicha <strong>FASE</strong> y pulsad <em>Energizar Bóveda Cero</em>.</p>
    </div>
  </section>`);

  // Pág. 27 — Hoja 4D (Meta-puzle Manifiesto + Sello de Plancha IV)
  pages.push(`
  <section class="sheet" data-page="27" data-envelope="4">
    ${sheetHeader('HOJA 4D', 4, 27, 'META-PUZLE FINAL · Directiva de Cierre Praga Cero')}
    <div class="letter-box">
      <div class="letter-meta">Agencia X · Estación PRG-89 · 18 de noviembre de 1989 · 04:10 h</div>
      <p><strong>A los dos agentes de campo que reconstruyan este caso — Fer y Lucía:</strong></p>
      <p>Cuando descubrí la traición en Torre de Petřín comprendí que el único modo de proteger las pruebas para quienes regreséis a Praga décadas después era fragmentar la clave de autorización en cuatro piezas físicas independientes.</p>
      <p>A lo largo de los cuatro sobres que habéis abierto se ocultan <strong>cuatro Sellos de Plancha</strong>, cada uno identificado por una <strong>forma geométrica distinta</strong>, un par de letras y un dígito de control (<code>XX-N</code>). Recuperad los cuatro sellos de las hojas anteriores y seguid al pie de la letra la hoja de cierre <strong>4E</strong> junto con el <strong>Disco del Orloj del Sobre 2</strong>.</p>
      <p class="letter-sign">— Agente Marek Novák, 1989</p>
    </div>

    <div class="panel-box">
      <div class="panel-title">Dónde buscar los cuatro Sellos de Plancha</div>
      <ul class="clean-list">
        <li>Un sello en una hoja del <strong>Sobre 1</strong> (Plancha I).</li>
        <li>Un sello en una hoja del <strong>Sobre 2</strong> (Plancha II).</li>
        <li>Un sello en una hoja del <strong>Sobre 3</strong> (Plancha III).</li>
        <li>El cuarto sello aquí abajo, en este <strong>Sobre 4</strong> (Plancha IV).</li>
      </ul>
    </div>

    <div class="sheet-bottom-seal">
      ${renderPlateSealSvg(PLATE_SEALS[3])}
    </div>
  </section>`);

  // Pág. 28 — Hoja 4E (Ficha de Cierre Meta-puzle)
  pages.push(`
  <section class="sheet" data-page="28" data-envelope="4">
    ${sheetHeader('HOJA 4E', 4, 28, 'META-PUZLE FINAL · Ficha de Cierre "Protocolo Praga Cero"')}
    <p class="lead-note">Seguid estos cuatro pasos en orden estricto para liberar vuestra autorización de despliegue a Praga.</p>

    <div class="panel-box">
      <div class="panel-title">Paso 1 · Reordenar los 4 Sellos según su Símbolo Geométrico</div>
      <p class="small-note">Anotad el código <code>XX-N</code> de cada plancha en la columna correspondiente a la forma impresa en su sello:</p>
      <table class="data-table">
        <thead>
          <tr>
            <th>Orden</th>
            <th>1º · Triángulo (△)</th>
            <th>2º · Doble círculo (◎)</th>
            <th>3º · Cuadrado (□)</th>
            <th>4º · Rombo (◇)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Código XX-N</th>
            <td style="height: 11mm"></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel-box">
      <div class="panel-title">Paso 2 · Calibrar el Disco del Orloj del Sobre 2</div>
      <p class="small-note">Sumad los <strong>cuatro dígitos de control</strong> (<code>N₁ + N₂ + N₃ + N₄</code>). El resultado indica el <strong>número de sector (01–26)</strong> del Anillo Exterior del Disco del Orloj con el que debéis alinear exactamente la flecha <strong><code>▲ ÍNDICE</code></strong> del Disco Interior.</p>
      <div class="work-row"><span>Suma total de los 4 dígitos (= Sector de calibración):</span><div class="blank-line"></div></div>
    </div>

    <div class="panel-box">
      <div class="panel-title">Paso 3 · Descifrar los 4 pares de letras en orden (△ → ◎ → □ → ◇)</div>
      <p class="small-note">Con el Disco del Orloj calibrado en ese sector, leed las <strong>8 letras</strong> de los cuatro pares en orden (<code>Disco Interior → Anillo Exterior</code>) para formar una palabra compuesta de ocho letras.</p>
      <table class="data-table">
        <tbody>
          <tr>
            <th>Letras cifradas (8)</th>
            <td style="width: 11%"></td><td style="width: 11%"></td><td style="width: 11%"></td><td style="width: 11%"></td>
            <td style="width: 11%"></td><td style="width: 11%"></td><td style="width: 11%"></td><td style="width: 11%"></td>
          </tr>
          <tr>
            <th>Letras claras (8)</th>
            <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel-box">
      <div class="panel-title">Paso 4 · Autorización Final (Bóveda Cero)</div>
      <p class="small-note">Unid la palabra descifrada con los 4 dígitos en ese mismo orden (<code>△ → ◎ → □ → ◇</code>) siguiendo el formato: <strong><code>PALABRA-DIGITOS</code></strong> (ejemplo: <code>RESPUESTA-1234</code>).</p>
    </div>
  </section>`);

  return pages.join('\n');
}

function buildPrintHtmlDocument(assets) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(GAME_TITLE)} — Kit Imprimible</title>
  <style>
    @font-face {
      font-family: 'JetBrains Mono';
      font-style: normal;
      font-weight: 400;
      src: url('data:font/woff2;base64,${assets.fontRegExtB64}') format('woff2');
      unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1EFF;
    }
    @font-face {
      font-family: 'JetBrains Mono';
      font-style: normal;
      font-weight: 400;
      src: url('data:font/woff2;base64,${assets.fontRegB64}') format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @font-face {
      font-family: 'JetBrains Mono';
      font-style: normal;
      font-weight: 700;
      src: url('data:font/woff2;base64,${assets.fontBoldExtB64}') format('woff2');
      unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1EFF;
    }
    @font-face {
      font-family: 'JetBrains Mono';
      font-style: normal;
      font-weight: 700;
      src: url('data:font/woff2;base64,${assets.fontBoldB64}') format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @page {
      size: A4 portrait;
      margin: 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #111317;
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      font-size: 8.4pt;
      line-height: 1.44;
    }
    .sheet {
      width: 186mm;
      height: 272mm;
      padding: 3mm 4mm;
      position: relative;
      overflow: hidden;
      background: #ffffff;
      page-break-after: always;
      break-after: page;
    }
    .sheet:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .cover-sheet {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 7mm;
    }
    .cover-frame {
      position: relative;
      width: 100%;
      height: 250mm;
      border: 1.8pt solid #111317;
      outline: 0.6pt solid #8a9296;
      outline-offset: -4mm;
      padding: 16mm 16mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      background: #fcfbfa;
    }
    .corner {
      position: absolute;
      width: 7mm;
      height: 7mm;
      border-color: #c81e2b;
      border-style: solid;
    }
    .corner.tl { top: 2.2mm; left: 2.2mm; border-width: 1.6pt 0 0 1.6pt; }
    .corner.tr { top: 2.2mm; right: 2.2mm; border-width: 1.6pt 1.6pt 0 0; }
    .corner.bl { bottom: 2.2mm; left: 2.2mm; border-width: 0 0 1.6pt 1.6pt; }
    .corner.br { bottom: 2.2mm; right: 2.2mm; border-width: 0 1.6pt 1.6pt 0; }
    .cover-top-tag {
      font-size: 8.2pt;
      letter-spacing: 1.6pt;
      color: #9a5b00;
      font-weight: bold;
      margin-bottom: 10mm;
    }
    .cover-logo {
      width: 50mm;
      height: auto;
      margin-bottom: 9mm;
    }
    .cover-stamp-box {
      border: 1.6pt solid #c81e2b;
      color: #c81e2b;
      font-size: 10pt;
      font-weight: bold;
      letter-spacing: 2pt;
      padding: 2.2mm 7mm;
      margin-bottom: 9mm;
      transform: rotate(-2deg);
      background: #fff6f6;
    }
    .cover-title-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4mm;
      margin-bottom: 5mm;
    }
    .cover-title-icon {
      width: 10mm;
      height: 10mm;
      opacity: 0.72;
    }
    .cover-title {
      font-size: 38pt;
      letter-spacing: 2.5pt;
      margin: 0;
      color: #111317;
    }
    .cover-recipient {
      font-size: 13pt;
      font-weight: bold;
      letter-spacing: 1.2pt;
      color: #c81e2b;
      margin-bottom: 8mm;
    }
    .cover-rule {
      width: 96mm;
      border-top: 1pt dashed #8a9296;
      margin-bottom: 8mm;
    }
    .cover-warning {
      font-size: 11.5pt;
      font-weight: bold;
      color: #991b1b;
      border: 1.2pt dashed #c81e2b;
      padding: 3.8mm 7mm;
      margin: 0 0 9mm;
      background: #fff5f5;
      letter-spacing: 0.6pt;
    }
    .cover-meta {
      font-size: 9.8pt;
      color: #111317;
      margin: 0;
    }
    .cover-footer {
      margin-top: 18mm;
      font-size: 7.8pt;
      color: #5a626a;
      line-height: 1.8;
    }
    .cover-sign {
      margin-top: 2mm;
      color: #9a5b00;
      font-weight: bold;
      letter-spacing: 1.2pt;
    }

    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1.4pt solid #111317;
      padding-bottom: 1.8mm;
      margin-bottom: 3.2mm;
      font-size: 7.2pt;
    }
    .doc-header-left {
      display: flex;
      align-items: center;
      gap: 2.5mm;
    }
    .header-mini-logo {
      height: 5.2mm;
      width: auto;
      display: block;
    }
    .badge-folio {
      background: #111317;
      color: #ffffff;
      padding: 0.6mm 2mm;
      font-weight: bold;
      letter-spacing: 0.5pt;
    }
    .doc-header-org {
      color: #5a626a;
      font-weight: bold;
    }
    .doc-header-right {
      color: #5a626a;
    }
    .doc-title {
      font-size: 11.2pt;
      margin: 0 0 3.2mm;
      color: #111317;
      border-left: 3pt solid #c81e2b;
      padding-left: 3mm;
      letter-spacing: 0.2pt;
    }

    .membrete-box {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border: 0.9pt solid #111317;
      background: #faf9f6;
      padding: 2.8mm 3.8mm;
      margin-bottom: 3.6mm;
      font-size: 7.8pt;
    }
    .station-stamp {
      border: 1.4pt solid #c81e2b;
      padding: 1.4mm 3.6mm;
      text-align: center;
      background: #ffffff;
    }
    .stamp-mini-title {
      font-size: 6pt;
      color: #c81e2b;
      font-weight: bold;
    }
    .stamp-mini-code {
      font-size: 13pt;
      font-weight: bold;
      color: #c81e2b;
      letter-spacing: 1pt;
    }
    .letter-box {
      border: 0.8pt solid #5a626a;
      background: #fcfbfa;
      padding: 3.4mm 4.4mm;
      margin-bottom: 3.6mm;
      font-size: 8.1pt;
    }
    .letter-meta {
      font-size: 7.3pt;
      color: #9a5b00;
      font-weight: bold;
      margin-bottom: 2.2mm;
      border-bottom: 0.6pt dashed #8a9296;
      padding-bottom: 1.4mm;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
    }
    .letter-box p {
      margin: 0 0 2.2mm;
    }
    .letter-sign {
      text-align: right;
      font-weight: bold;
      color: #9a5b00;
      margin-bottom: 0 !important;
    }
    .panel-box {
      border: 0.8pt solid #4b5563;
      background: #ffffff;
      padding: 2.8mm 3.8mm;
      margin-bottom: 3.4mm;
    }
    .compact-box {
      padding: 2.2mm 3.2mm;
      margin-bottom: 2.8mm;
    }
    .panel-title {
      font-size: 8pt;
      font-weight: bold;
      color: #c81e2b;
      margin-bottom: 1.8mm;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
    }
    .lead-note {
      margin: 0 0 3mm;
      font-size: 8.2pt;
    }
    .small-note {
      margin: 0 0 2mm;
      font-size: 7.8pt;
      color: #1f2937;
    }
    .clean-list {
      margin: 1mm 0 1mm 5mm;
      padding: 0;
    }
    .clean-list li {
      margin-bottom: 1.4mm;
      font-size: 7.9pt;
    }
    code {
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      font-weight: bold;
      background: #f3f4f6;
      padding: 0.2mm 1.1mm;
      border: 0.3pt solid #9ca3af;
      font-size: 7.9pt;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 3.4mm;
      font-size: 7.5pt;
    }
    .data-table.compact {
      font-size: 7.1pt;
      margin-bottom: 2.8mm;
    }
    .data-table th, .data-table td {
      border: 0.6pt solid #4b5563;
      padding: 1.6mm 2.1mm;
      text-align: left;
      vertical-align: top;
    }
    .data-table thead th {
      background: #eceef1;
      font-size: 7.2pt;
      color: #111317;
    }
    .row-highlight {
      background: #fff9ee;
      font-weight: normal;
    }
    .hand-note-box {
      border: 1pt dashed #9a5b00;
      background: #fffaf0;
      padding: 2.8mm 3.8mm;
      margin-bottom: 3.4mm;
    }
    .hand-note-title {
      font-size: 7.4pt;
      font-weight: bold;
      color: #9a5b00;
      margin-bottom: 1.1mm;
      text-transform: uppercase;
    }
    .handwritten {
      margin: 0;
      font-style: italic;
      color: #1f2937;
      font-size: 8pt;
    }
    .coop-banner {
      border: 1pt solid #c81e2b;
      border-left: 3pt solid #c81e2b;
      background: #fff6f6;
      color: #7a0f1a;
      padding: 2mm 3.2mm;
      margin-bottom: 3.2mm;
      font-size: 7.4pt;
      font-weight: bold;
    }
    .svg-center-box {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 2.5mm 0;
    }
    .sheet-bottom-seal {
      position: absolute;
      right: 4mm;
      bottom: 4mm;
    }
    .morse-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4mm;
    }
    .morse-cell {
      display: flex;
      justify-content: space-between;
      border-bottom: 0.4pt dotted #cbd5e1;
      padding: 0.5mm 1.5mm;
      font-size: 7.5pt;
    }
    .morse-ch {
      font-weight: bold;
      color: #111317;
    }
    .morse-dots {
      letter-spacing: 0.8pt;
      font-weight: bold;
      color: #c81e2b;
    }
    .newspaper-box {
      border: 1.2pt solid #111317;
      background: #faf9f6;
      padding: 2.8mm 4mm;
      margin-bottom: 3.4mm;
    }
    .news-head {
      font-size: 7.3pt;
      font-weight: bold;
      color: #c81e2b;
      border-bottom: 0.8pt dashed #4b5563;
      padding-bottom: 1mm;
      margin-bottom: 1.8mm;
    }
    .newspaper-box h3 {
      margin: 0 0 1.8mm;
      font-size: 9.2pt;
    }
    .newspaper-box p {
      margin: 0;
      font-size: 7.7pt;
    }
    .receipt-box {
      border: 1pt dashed #9a5b00;
      background: #fffaf2;
      padding: 3mm 4mm;
      margin-bottom: 3.4mm;
    }
    .receipt-title {
      font-size: 7.8pt;
      font-weight: bold;
      color: #9a5b00;
      margin-bottom: 1.8mm;
    }
    .receipt-box p {
      margin: 0 0 1.4mm;
      font-size: 7.9pt;
    }
    .reglamento-box {
      border: 1pt solid #111317;
      background: #fcfbfa;
      padding: 3.6mm 4.6mm;
      margin-bottom: 3.6mm;
    }
    .reglamento-head {
      font-size: 7.8pt;
      font-weight: bold;
      text-align: center;
      color: #c81e2b;
      border-bottom: 0.8pt dashed #4b5563;
      padding-bottom: 1.8mm;
      margin-bottom: 2.8mm;
    }
    .article-row {
      margin-bottom: 2.8mm;
      font-size: 8.1pt;
      line-height: 1.48;
    }
    .art-num {
      font-weight: bold;
      color: #c81e2b;
    }
    .word-mark {
      font-size: 6pt;
      color: #9a5b00;
      margin-left: 0.3mm;
      font-weight: bold;
    }
    .contraluz-sheet .contraluz-header {
      height: 36mm;
      overflow: hidden;
    }
    .optical-zone {
      margin: 2mm 0 0;
      background: #ffffff;
    }
    .telex-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3.5mm;
      margin-bottom: 3.4mm;
    }
    .telex-box {
      border: 0.8pt solid #374151;
      background: #fcfbfa;
      padding: 2.4mm 3mm;
    }
    .telex-head {
      font-size: 6.9pt;
      font-weight: bold;
      color: #c81e2b;
      border-bottom: 0.5pt dashed #9ca3af;
      padding-bottom: 1mm;
      margin-bottom: 1.4mm;
    }
    .telex-box pre {
      margin: 0;
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      font-size: 6.4pt;
      line-height: 1.35;
      white-space: pre-wrap;
    }
    .relay-diagram-box {
      display: flex;
      justify-content: center;
      margin-top: 3.5mm;
    }
    .work-grid {
      display: flex;
      flex-direction: column;
      gap: 2.8mm;
    }
    .work-row {
      display: flex;
      align-items: flex-end;
      gap: 3mm;
      font-size: 7.9pt;
    }
    .blank-line {
      flex: 1;
      border-bottom: 0.8pt dashed #4b5563;
      height: 6mm;
    }
  </style>
</head>
<body>
${buildAllPagesHtml(assets)}
</body>
</html>`;
}

// ============================================================================
// GENERACIÓN DE docs/game_data.js (SIN TEXTO PLANO DE RESPUESTAS NI SPOILERS)
// ============================================================================

function buildGameDataJs() {
  const puzzlesData = PUZZLES.map((p) => {
    const norm = normalizeAnswer(p.answer);
    return {
      id: p.id,
      act: p.act,
      branch: p.branch,
      code: p.code,
      title: p.title,
      promptB64: encodeB64(p.prompt),
      placeholder: p.placeholder,
      inputType: p.inputType,
      envelope: p.envelope,
      pagesHint: p.pagesHint,
      answerHash: sha256Hex(norm),
      hints: [
        { level: 1, label: 'Orientación suave', b64: encodeB64(p.hints[0]) },
        { level: 2, label: 'Empujón mecánico', b64: encodeB64(p.hints[1]) },
        { level: 3, label: 'Solución paso a paso', b64: encodeB64(p.hints[2]) },
      ],
      unlockMessageB64: encodeB64(p.unlockMessage),
    };
  });

  const archiveData = ARCHIVE_DOCS.map((doc) => {
    const queryNorm = normalizeAnswer(doc.id);
    return {
      queryHash: sha256Hex(queryNorm),
      unlockAfter: doc.unlockAfter,
      autoDiscover: ['DESPACHO-042', 'BALIZA-89-E', 'BITACORA-MN'].includes(doc.id),
      codeB64: encodeB64(doc.id),
      titleB64: encodeB64(doc.title),
      classificationB64: encodeB64(doc.classification),
      summaryB64: encodeB64(doc.summary),
      bodyB64: doc.body ? encodeB64(doc.body) : null,
      rowsB64: doc.rows ? encodeB64(JSON.stringify(doc.rows)) : null,
    };
  });

  const payload = {
    meta: {
      title: GAME_TITLE,
      subtitle: GAME_SUBTITLE,
      playersLabel: PLAYERS_LABEL,
      totalMinutes: TOTAL_MINUTES,
      intro: INTRO_NARRATIVE,
    },
    puzzles: puzzlesData,
    archiveDocs: archiveData,
    radio: {
      minFreqKHz: RADIO_SPEC.minFreqKHz,
      maxFreqKHz: RADIO_SPEC.maxFreqKHz,
      stepKHz: RADIO_SPEC.stepKHz,
      targetFreqKHz: RADIO_SPEC.targetFreqKHz,
      morseB64: encodeB64(RADIO_SPEC.morse),
    },
    nautical: {
      viewBoxWidth: NAUTICAL_CHART_SPEC.viewBoxWidth,
      viewBoxHeight: NAUTICAL_CHART_SPEC.viewBoxHeight,
      originX: NAUTICAL_CHART_SPEC.originX,
      originY: NAUTICAL_CHART_SPEC.originY,
      cellSize: NAUTICAL_CHART_SPEC.cellSize,
      cols: NAUTICAL_CHART_SPEC.cols,
      rows: NAUTICAL_CHART_SPEC.rows,
      faro: { name: NAUTICAL_CHART_SPEC.faro.name, x: NAUTICAL_CHART_SPEC.faro.x, y: NAUTICAL_CHART_SPEC.faro.y },
      boya: { name: NAUTICAL_CHART_SPEC.boya.name, x: NAUTICAL_CHART_SPEC.boya.x, y: NAUTICAL_CHART_SPEC.boya.y },
    },
    epilogueB64: encodeB64(JSON.stringify(EPILOGUE_NARRATIVE)),
  };

  return `// Generado automáticamente por scripts/build_kit.mjs — NO editar manualmente\nexport const GAME_DATA = ${JSON.stringify(payload, null, 2)};\n`;
}

// ============================================================================
// DOCUMENTACIÓN: GUÍA SIN SPOILERS Y GUÍA DE SOLUCIONES (.gitignore)
// ============================================================================

function buildPrepGuideMd() {
  return `# Guía de Preparación (100% Sin Spoilers) — *${GAME_TITLE}*

Esta guía explica cómo imprimir y preparar los cuatro sobres de **Agencia X** para **Fer y Lucía (Agentes F y L)** sin revelar absolutamente nada del contenido ni de los enigmas.

---

## 1. Instrucciones de impresión

Imprimid el archivo [imprimir/KIT_ESCAPE_ROOM.pdf](./imprimir/KIT_ESCAPE_ROOM.pdf) siguiendo estas cuatro reglas estrictas:

1. **Tamaño de papel:** A4 vertical (*Portrait*).
2. **A una cara:** **NO imprimáis a doble cara**. Algunas hojas deben recortarse o superponerse frente a una luz durante la misión.
3. **Escala real (100% / Tamaño real):** Desactivad cualquier opción tipo *"Ajustar a página"* o *"Reducir para ajustar"*. Las plantillas recortables y superposiciones dependen de una escala exacta \`1:1\`.
4. **Color recomendado (100% compatible con Blanco y Negro):** El dosier está diseñado en color archivístico, pero todos los elementos críticos llevan formas, iconos o tramas distintas, así que es 100% jugable también si se imprime en blanco y negro o escala de grises.

---

## 2. Montaje a ciegas de los 4 sobres

El PDF tiene **28 páginas** en total. Cada sobre comienza con una **hoja de portada limpia** que ocupa la primera página de su bloque y no revela nada del interior. Basta con separar las hojas mirando únicamente esas portadas:

| Sobre físico | Rango exacto de páginas | Cantidad de hojas | Cuándo se abre |
| :--- | :--- | :--- | :--- |
| **SOBRE 1** | **Páginas 1 a 6** | 6 hojas | Al iniciar la misión tras pulsar *Activar protocolo* |
| **SOBRE 2** | **Páginas 7 a 14** | 8 hojas | Solo cuando el Canal Seguro indique abrir el Sobre 2 |
| **SOBRE 3** | **Páginas 15 a 22** | 8 hojas | Solo cuando el Canal Seguro indique abrir el Sobre 3 |
| **SOBRE 4** | **Páginas 23 a 28** | 6 hojas | Solo cuando el Canal Seguro indique abrir el Sobre 4 |

> **Importante:** **NO recortéis ni dobléis nada antes de empezar a jugar.** Todas las piezas se preparan en vivo sobre la mesa cuando la misión lo requiere.

---

## 3. Lista de materiales caseros necesarios

Antes de abrir el Sobre 1, dejad sobre la mesa:

- **Unas tijeras** (útiles para las piezas recortables que irán apareciendo).
- **Dos bolígrafos o lápices** (uno para cada agente) y papel auxiliar opcional para tomar notas.
- **Celo / cinta adhesiva** (opcional, útil si queréis fijar alguna marca o pliegue con comodidad).
- **Un teléfono móvil con linterna** (la función de linterna trasera será necesaria en uno de los tramos del juego).
- **Ordenador, portátil o tablet con sonido activado** (y móvil adicional opcional si preferís consultar ambos desde la web).
`;
}

function buildSolutionsMd() {
  const book = solveBookCipher(BOOK_CIPHER_ARTICLES, BOOK_CIPHER_COORDS);
  const e6Decoded = astrolabeDecode('EFTMUQB', 'T');
  const e12Decoded = astrolabeDecode('JMUNZHYZ', 'F');
  const relayValidStates = [];
  for (let mask = 0; mask < 64; mask++) {
    const bits = [0, 1, 2, 3, 4, 5].map((i) => (mask >> i) & 1);
    const res = evaluateRelayRules(bits);
    if (res.valid) relayValidStates.push(bits.join(''));
  }

  return `# SOLUCIONES_NO_ABRIR.md — *${GAME_TITLE}*

> **ADVERTENCIA:** Este archivo contiene todas las soluciones completas, deducciones paso a paso y desenlace de la misión. Está incluido en \`.gitignore\`.

---

## Resumen de Claves y Hashes

| Código | Enigma | Respuesta exacta | Normalizada | SHA-256 |
| :--- | :--- | :--- | :--- | :--- |
${PUZZLES.map((p) => {
  const norm = normalizeAnswer(p.answer);
  return `| ${p.code} (${p.id}) | ${p.title} | \`${p.answer}\` | \`${norm}\` | \`${sha256Hex(norm)}\` |`;
}).join('\n')}

---

## Desarrollo Detallado por Actos

### ACTO I — Sobre 1 (Págs. 1–6)
1. **1.1 Credencial Estación PRG-89 (\`PRG-318-T49\`):**
   - Hoja 1A: Sigla de estación \`PRG\`. Único enlace óptico activo en Torre de Petřín = Serie \`318\`.
   - Hoja 1B: Turno de madrugada (22:00–06:00) que cubría las 02:15 = \`T49\`.
2. **1.2 El Cable Censurado [Rejilla de Cardano] (\`EXP-89-407\`):**
   - Al recortar los 8 cuadros de Hoja 1D y alinear \`R1..R4\` sobre Hoja 1C aparecen por filas \`E-X-P-8-9-4-0-7\` → \`EXP-89-407\`.
3. **1.3 Desvío en Torre de Petřín (\`14-0215\`):**
   - Consultar \`EXP-89-407\` en el Terminal muestra \`02:15 MANUAL-OVERRIDE 298°\`.
   - Azimut oficial en Hoja 1E = \`284°\`. Desvío: \`298 - 284 = 14°\` (>10° crítico) a las \`02:15\` → \`14-0215\`.
   - **Sello de Plancha I (Hoja 1E, pág. 6):** \`◎ PLANCHA I · PRG-N · COD. UN-5\`.

### ACTO II — Sobre 2 (Págs. 7–14 · Ramas Paralelas #1)
4. **2.A El Plano Plegado del Moldava [Fold-In] (\`ARCO-42\`):**
   - Al doblar Hoja 2B uniendo \`PLIEGUE A\` (\`x=56\`) con \`PLIEGUE B\` (\`x=120\`) se forman los 6 caracteres verticales \`A R C O 4 2\` → \`ARCO-42\`.
   - Desbloquea \`DESPACHO-042\` con criptograma \`EFTMUQB\` y \`BALIZA-89-E\`.
   - **Sello de Plancha II (Hoja 2A, pág. 8):** \`◇ PLANCHA II · PRG-E · COD. YZ-1\`.
5. **2.B La Emisora de Petřín [Morse Web Audio] (\`TRAMPA\`):**
   - Hoja 2C: Única baliza en Praga (Petřín) + banda 400 kHz + CW Morse + activa tras 1988 = \`Baliza E-4 (418.5 kHz)\`.
   - En \`418.5 kHz\` el receptor Web Audio emite \`${RADIO_SPEC.morse}\` → \`TRAMPA\`.
6. **2.C El Disco del Orloj [Disco Cifrador] (\`DEMINKA\`):**
   - Primera letra de \`TRAMPA\` = \`T\` (sector 20, índice 19).
   - Con \`▲ ÍNDICE\` (\`P\` del alfabeto clave \`${ASTROLABE_INNER}\`) alineado con \`T\`, \`EFTMUQB\` (Interior → Exterior) da \`${e6Decoded}\`.

### ACTO III — Sobre 3 (Págs. 15–22 · Ramas Paralelas #2)
7. **3.A El Topo de Estación PRG-89 [Lógica Documental] (\`Pavel Horák\`):**
   - Terminal \`EXP-LLAVES-89\` confirma uso de \`LLAVE B-2\` a las \`02:09\` y \`02:47\`.
   - Recibo #19 (Hoja 3A): Marek Novák entrega \`LLAVE B-2\` a \`Pavel Horák\` a las \`18:05\`.
   - Hoja 3B: Marek Novák tiene coartada junto al Reloj Astronómico; Kovář en Brno; Dvořák en Castillo; Veselá en Vinohrady. Horák sin coartada + llamada al buzón de Marea Roja a las 02:50 → \`Pavel Horák\`.
8. **3.B El Manual de Campo Cifrado [Cifrado de Libro] (\`CISTERNA\`):**
   - \`BITACORA-MN\` indica \`3·5 — 5·8 — 7·12 — 1·13 — 8·10 — 2·8 — 6·8 — 4·11\`.
   - Palabras extraídas de Hoja 3C: ${book.steps.map((s) => `(${s.artNum},${s.wordPos})=${s.word}→${s.letter}`).join(', ')} → \`${book.word}\`.
9. **3.C Triangulación sobre el Moldava [Contraluz + Mapa Táctico] (\`210-285-C4\`):**
   - Superponiendo Hojas 3D y 3E frente a la linterna se lee \`F: 210\` y \`B: 285\`.
   - En el Mapa Táctico Web (\`Foco de Petřín = 210°\`, \`Baliza Orloj = 285°\`), los haces se cruzan exactamente en el centro de \`C4\` → \`210-285-C4\`.
   - **Sello de Plancha III (Hoja 3F, pág. 21):** \`△ PLANCHA III · PRG-S · COD. JM-0\`.

### ACTO IV — Sobre 4 (Págs. 23–28)
10. **4.1 La Cuenta de Marea Roja (\`VIE-7742\`):**
    - \`EXP-MAREA-89\`: Fondo = \`40.000.000 CHF\`, enlace financiero = \`Emil Beneš (E.B.)\`.
    - Télex Hoja 4A: 15% (\`6.000.000 CHF\`) en 2 tramos iguales de \`3.000.000 CHF\` (uno antes del 17/11 y otro después) firmados por \`E.B.\` → \`VIE-7742\`.
11. **4.2 La Consola de Bóveda Cero (\`100011-IV\`):**
    - Hoja 4C: línea útil = \`FASE IV (12 V)\`.
    - Hoja 4B: 3 activos, \`R1 ≠ R2\`, \`R3 = R4\`, suma = \`12\`. Solución única entre 64: \`${relayValidStates.join(', ')}\` (\`R1=ON, R5=ON, R6=ON\`) + \`FASE IV\` → \`100011-IV\`.

### META-PUZLE FINAL
12. **Protocolo Praga Cero (\`LUZVERDE-0501\`):**
    - **Sello de Plancha IV (Hoja 4D, pág. 27):** \`□ PLANCHA IV · PRG-O · COD. ZH-0\`.
    - Orden geométrico Hoja 4E (\`${META_ORDER_SHAPES.join(' → ')}\`): \`JM-0\`, \`UN-5\`, \`ZH-0\`, \`YZ-1\`.
    - Suma de dígitos de control: \`0 + 5 + 0 + 1 = 6\` (Sector \`06\` = \`F\` en Anillo Exterior).
    - Con \`▲ ÍNDICE\` en \`F\`, \`JMUNZHYZ\` (Interior → Exterior) descifra a \`${e12Decoded}\`.
    - Añadiendo los 4 dígitos en ese orden (\`0501\`): **\`LUZVERDE-0501\`**.
`;
}

// ============================================================================
// EJECUCIÓN PRINCIPAL DE COMPILACIÓN Y RENDER PDF
// ============================================================================

export async function runBuild() {
  await fs.mkdir(path.join(ROOT, 'tmp', 'qa'), { recursive: true });
  await fs.mkdir(path.join(ROOT, 'imprimir'), { recursive: true });
  await fs.mkdir(path.join(ROOT, 'docs'), { recursive: true });

  const logoBytes = await fs.readFile(path.join(ROOT, 'docs', 'assets', 'agencia-x-logo.png'));
  const iconBytes = await fs.readFile(path.join(ROOT, 'docs', 'assets', 'agencia-x-icon.png'));
  const fontReg = await fs.readFile(path.join(ROOT, 'docs', 'assets', 'fonts', 'JetBrainsMono-Regular.woff2'));
  const fontRegExt = await fs.readFile(path.join(ROOT, 'docs', 'assets', 'fonts', 'JetBrainsMono-Regular-Ext.woff2'));
  const fontBold = await fs.readFile(path.join(ROOT, 'docs', 'assets', 'fonts', 'JetBrainsMono-Bold.woff2'));
  const fontBoldExt = await fs.readFile(path.join(ROOT, 'docs', 'assets', 'fonts', 'JetBrainsMono-Bold-Ext.woff2'));

  const assets = {
    logoDataUri: `data:image/png;base64,${logoBytes.toString('base64')}`,
    iconDataUri: `data:image/png;base64,${iconBytes.toString('base64')}`,
    fontRegB64: fontReg.toString('base64'),
    fontRegExtB64: fontRegExt.toString('base64'),
    fontBoldB64: fontBold.toString('base64'),
    fontBoldExtB64: fontBoldExt.toString('base64'),
  };

  const printHtml = buildPrintHtmlDocument(assets);
  const printHtmlPath = path.join(ROOT, 'tmp', 'kit_print.html');
  await fs.writeFile(printHtmlPath, printHtml, 'utf8');

  const gameDataJs = buildGameDataJs();
  await fs.writeFile(path.join(ROOT, 'docs', 'game_data.js'), gameDataJs, 'utf8');
  await fs.writeFile(path.join(ROOT, 'docs', '.nojekyll'), '', 'utf8');

  await fs.writeFile(path.join(ROOT, 'GUIA_PREPARACION_SIN_SPOILERS.md'), buildPrepGuideMd(), 'utf8');
  await fs.writeFile(path.join(ROOT, 'SOLUCIONES_NO_ABRIR.md'), buildSolutionsMd(), 'utf8');

  const executablePath = await findBrowserPath();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 900, height: 1280 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const fileUrl = new URL(`file:///${printHtmlPath.replace(/\\/g, '/')}`).href;
    await page.goto(fileUrl, { waitUntil: 'networkidle' });

    const layoutReport = await page.evaluate(() => {
      const sheets = Array.from(document.querySelectorAll('.sheet'));
      return sheets.map((s) => ({
        page: Number(s.getAttribute('data-page')),
        envelope: Number(s.getAttribute('data-envelope')),
        clientHeight: s.clientHeight,
        scrollHeight: s.scrollHeight,
        clientWidth: s.clientWidth,
        scrollWidth: s.scrollWidth,
      }));
    });

    const overflows = layoutReport.filter(
      (r) => r.scrollHeight > r.clientHeight + 2 || r.scrollWidth > r.clientWidth + 2
    );
    if (overflows.length > 0) {
      throw new Error(`Overflow detectado en páginas PDF: ${JSON.stringify(overflows)}`);
    }

    const pdfPath = path.join(ROOT, 'imprimir', 'KIT_ESCAPE_ROOM.pdf');
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
    });

    const qaPages = [1, 2, 4, 5, 6, 8, 9, 12, 13, 18, 19, 20, 24, 25, 27, 28];
    for (const pNum of qaPages) {
      const loc = page.locator(`.sheet[data-page="${pNum}"]`);
      await loc.screenshot({ path: path.join(ROOT, 'tmp', 'qa', `pdf_page_${String(pNum).padStart(2, '0')}.png`) });
    }

    console.log(`Build completado: ${layoutReport.length} páginas A4 generadas sin overflow.`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBuild().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
