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
      <circle cx="24" cy="24" r="14" fill="none" stroke="#8b261d" stroke-width="2.2"/>
      <circle cx="24" cy="24" r="7.5" fill="none" stroke="#8b261d" stroke-width="2"/>
      <circle cx="24" cy="24" r="2" fill="#8b261d"/>`;
  } else if (seal.shape === '◇') {
    shapeEl = `
      <polygon points="24,8 40,24 24,40 8,24" fill="none" stroke="#184e77" stroke-width="2.2" stroke-dasharray="3.5 1.8"/>
      <polygon points="24,14 34,24 24,34 14,24" fill="none" stroke="#184e77" stroke-width="1.3"/>`;
  } else if (seal.shape === '△') {
    shapeEl = `
      <polygon points="24,8 40,38 8,38" fill="none" stroke="#2d6a4f" stroke-width="2.2" stroke-dasharray="2.5 1.6"/>
      <circle cx="24" cy="28" r="2.2" fill="#2d6a4f"/>`;
  } else if (seal.shape === '□') {
    shapeEl = `
      <rect x="9" y="9" width="30" height="30" fill="none" stroke="#5a3921" stroke-width="2.2"/>
      <rect x="14" y="14" width="20" height="20" fill="none" stroke="#5a3921" stroke-width="1.2"/>`;
  }

  return `
  <div class="plate-seal" data-seal-id="${seal.id}" data-seal-code="${seal.code}" data-seal-shape="${seal.shape}">
    <svg width="64mm" height="19mm" viewBox="0 0 176 52" aria-label="Sello de Plancha ${seal.id}">
      <rect x="1.5" y="1.5" width="173" height="49" rx="3" fill="#fcfaf4" stroke="#334155" stroke-width="1.2" stroke-dasharray="3 1.5"/>
      ${shapeEl}
      <text x="48" y="18" font-family="'Courier New', monospace" font-size="8.4" font-weight="bold" fill="#1e293b">PLANCHA ${seal.id} · ${seal.meridian}</text>
      <text x="48" y="30.5" font-family="'Courier New', monospace" font-size="9.6" font-weight="bold" fill="#8b261d">COD. ${seal.code}</text>
      <text x="48" y="42.5" font-family="Georgia, serif" font-size="7" fill="#475569">Marca: ${seal.shape} (${seal.shapeName})</text>
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
    <text x="${widthMm / 2}" y="9" text-anchor="middle" font-family="'Courier New', monospace" font-size="4.2" font-weight="bold" fill="#334155">MATRIZ TELEGRÁFICA CVL-1989 (12×9)</text>
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
    { x: 76, y: 26, t: '18m' },
    { x: 96, y: 38, t: '24m' },
    { x: 74, y: 62, t: '31m' },
    { x: 98, y: 78, t: '46m' },
    { x: 78, y: 98, t: '52m' },
    { x: 96, y: 124, t: '68m' },
    { x: 75, y: 142, t: '89m' },
    { x: 95, y: 164, t: '112m' },
  ]
    .map((d) => `<text x="${d.x}" y="${d.y}" font-family="'Courier New', monospace" font-size="3.8" fill="#64748b">${d.t}</text>`)
    .join('');

  const glyphPaths = [];
  for (const g of glyphs) {
    for (const poly of g.left) {
      const pts = poly.map(([u, v]) => `${(foldAX + u).toFixed(2)},${(g.yOffset + v).toFixed(2)}`).join(' ');
      glyphPaths.push(
        `<polyline data-fold="left" data-char="${g.char}" points="${pts}" fill="none" stroke="#0f2942" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    }
    for (const poly of g.right) {
      const pts = poly.map(([u, v]) => `${(foldBX + u).toFixed(2)},${(g.yOffset + v).toFixed(2)}`).join(' ');
      glyphPaths.push(
        `<polyline data-fold="right" data-char="${g.char}" points="${pts}" fill="none" stroke="#0f2942" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    }
  }

  // Trazos batimétricos decorativos en los bordes exteriores para camuflar visualmente antes del pliegue
  const outerCamo = `
    <path d="M 12 25 L 36 25 M 12 55 L 38 55 M 12 85 L 34 85 M 12 115 L 36 115 M 12 145 L 35 145" stroke="#cbd5e1" stroke-width="0.6"/>
    <path d="M 140 25 L 164 25 M 140 55 L 164 55 M 140 85 L 164 85 M 140 115 L 164 115 M 140 145 L 164 145" stroke="#cbd5e1" stroke-width="0.6"/>
    <text x="10" y="15" font-family="'Courier New', monospace" font-size="3.6" fill="#475569">SECTOR NW-4</text>
    <text x="166" y="15" text-anchor="end" font-family="'Courier New', monospace" font-size="3.6" fill="#475569">VERIL 120m</text>
    <text x="10" y="178.5" font-family="'Courier New', monospace" font-size="3.4" fill="#475569">BATIMETRÍA VALDEIRA</text>
    <text x="166" y="178.5" text-anchor="end" font-family="'Courier New', monospace" font-size="3.4" fill="#475569">ESC. 1:25.000</text>
  `;

  return `
  <svg id="fold-in-svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="${widthMm - 2}" height="${heightMm - 2}" fill="#fcfbf7" stroke="#1e293b" stroke-width="0.8"/>
    <rect x="6" y="10" width="${widthMm - 12}" height="${heightMm - 20}" fill="#f5f8fb" stroke="#64748b" stroke-width="0.5"/>
    ${isobaths}
    ${outerCamo}
    ${centerDistractors}
    ${glyphPaths.join('\n    ')}
    <!-- Línea Pliegue A -->
    <line data-fold-line="A" x1="${foldAX}" y1="4" x2="${foldAX}" y2="${heightMm - 4}" stroke="#1d4ed8" stroke-width="0.8" stroke-dasharray="3.5 2"/>
    <polygon points="${foldAX},8 ${foldAX - 3},3 ${foldAX + 3},3" fill="#1d4ed8"/>
    <polygon points="${foldAX},${heightMm - 8} ${foldAX - 3},${heightMm - 3} ${foldAX + 3},${heightMm - 3}" fill="#1d4ed8"/>
    <text x="${foldAX - 3}" y="8.5" text-anchor="end" font-family="'Courier New', monospace" font-size="4.4" font-weight="bold" fill="#1e3a8a">PLIEGUE A ▲</text>
    <text x="${foldAX - 3}" y="${heightMm - 4}" text-anchor="end" font-family="'Courier New', monospace" font-size="4.4" font-weight="bold" fill="#1e3a8a">PLIEGUE A ▼</text>
    <!-- Línea Pliegue B -->
    <line data-fold-line="B" x1="${foldBX}" y1="4" x2="${foldBX}" y2="${heightMm - 4}" stroke="#1d4ed8" stroke-width="0.8" stroke-dasharray="3.5 2"/>
    <polygon points="${foldBX},8 ${foldBX - 3},3 ${foldBX + 3},3" fill="#1d4ed8"/>
    <polygon points="${foldBX},${heightMm - 8} ${foldBX - 3},${heightMm - 3} ${foldBX + 3},${heightMm - 3}" fill="#1d4ed8"/>
    <text x="${foldBX + 3}" y="8.5" text-anchor="start" font-family="'Courier New', monospace" font-size="4.4" font-weight="bold" fill="#1e3a8a">▲ PLIEGUE B</text>
    <text x="${foldBX + 3}" y="${heightMm - 4}" text-anchor="start" font-family="'Courier New', monospace" font-size="4.4" font-weight="bold" fill="#1e3a8a">▼ PLIEGUE B</text>
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
    <text x="0" y="22" text-anchor="middle" font-family="'Courier New', monospace" font-size="4.4" font-weight="bold" fill="#334155">ANILLO EXTERIOR (BASE)</text>
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
    <text x="0" y="-22" text-anchor="middle" font-family="'Courier New', monospace" font-size="4" font-weight="bold" fill="#991b1b">▲ ÍNDICE EN SECTOR V</text>
    <text x="0" y="19" text-anchor="middle" font-family="'Courier New', monospace" font-size="4.2" font-weight="bold" fill="#0f172a">DISCO INTERIOR VALDEIRA</text>
    <text x="0" y="25" text-anchor="middle" font-family="Georgia, serif" font-size="3.6" fill="#475569">Recortar por el borde discontinuo ✂</text>
    <text x="-47" y="-44" font-family="sans-serif" font-size="5" fill="#991b1b">✂</text>
    <text x="43" y="47" font-family="sans-serif" font-size="5" fill="#991b1b">✂</text>
  </svg>`;
}

// Geometría de 7 segmentos para las Láminas Ópticas A y B (Contraluz E9)
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
    // Letra guía de fila ('F' o 'B') también partida entre A y B en 7 segmentos
    const labelBox = getSevenSegCoords(22, row.y, 13, 26);
    const labelSegs = layerKey === 'A' ? row.labelSplit.layerA : row.labelSplit.layerB;
    for (const seg of labelSegs) {
      const [x1, y1, x2, y2] = labelBox[seg];
      segmentsHtml.push(
        `<line data-row="${row.id}" data-is-label="true" data-seg="${seg}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeColor}" stroke-width="3.2" stroke-linecap="round"/>`
      );
    }
    // Dos puntos ":" en ambos o alternados: ponemos punto sup en A y punto inf en B
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

function coverPageHtml(envNum, pageStart, pageEnd, totalSheets) {
  const globalPage = pageStart;
  return `
  <section class="sheet cover-sheet" data-page="${globalPage}" data-envelope="${envNum}">
    <div class="cover-frame">
      <div class="cover-top-tag">ARCHIVO HIDROGRÁFICO DE CABO VALDEIRA · EXPEDIENTE 1989</div>
      <div class="cover-stamp-box">DOCUMENTO CLAUSURADO</div>
      <h1 class="cover-title">SOBRE ${envNum}</h1>
      <div class="cover-recipient">PARA FER Y LUCÍA</div>
      <div class="cover-rule"></div>
      <p class="cover-warning">NO ABRIR HASTA QUE EL SISTEMA LO INDIQUE</p>
      <p class="cover-meta">Contiene ${totalSheets} páginas impresas (Págs. ${pageStart} a ${pageEnd} del dosier)</p>
      <div class="cover-footer">
        <span>Montaje a ciegas · No leer ni recortar antes de iniciar la sesión</span>
      </div>
    </div>
  </section>`;
}

function sheetHeader(folioCode, envNum, pageNum, docTitle) {
  return `
  <header class="doc-header">
    <div class="doc-header-left">
      <span class="badge-folio">${folioCode}</span>
      <span class="doc-header-org">OBSERVATORIO HIDROGRÁFICO CABO VALDEIRA · A CORUÑA</span>
    </div>
    <div class="doc-header-right">Sobre ${envNum} · Pág. ${pageNum}/28</div>
  </header>
  <h2 class="doc-title">${escapeHtml(docTitle)}</h2>`;
}

function buildAllPagesHtml() {
  const pages = [];

  // --------------------------------------------------------------------------
  // SOBRE 1 (Págs. 1–6)
  // --------------------------------------------------------------------------
  pages.push(coverPageHtml(1, 1, 6, 6)); // Pág. 1

  // Pág. 2 — Hoja 1A
  pages.push(`
  <section class="sheet" data-page="2" data-envelope="1">
    ${sheetHeader('HOJA 1A', 1, 2, 'Carta de encargo y Ficha de Ópticas Fresnel')}
    <div class="membrete-box">
      <div>
        <strong>ESTACIÓN HIDROGRÁFICA Y FARO DE CABO VALDEIRA</strong><br/>
        <span>Ministerio de Obras Públicas y Marina Mercante · Archivo Reservado</span>
      </div>
      <div class="station-stamp">
        <div class="stamp-mini-title">CÓDIGO ESTACIÓN</div>
        <div class="stamp-mini-code">CVL</div>
      </div>
    </div>

    <div class="letter-box">
      <div class="letter-meta">Santiago / Cabo Valdeira · Viernes, 21:45 h · Confidencial en mano</div>
      <p><strong>Fer y Lucía:</strong></p>
      <p>Si este paquete ha llegado a vuestras manos sin remitente es porque la copia magnética auxiliar de Cabo Valdeira acaba de reactivarse tras más de tres décadas en silencio. En noviembre de 1989 la comisión oficial cerró el naufragio del mercante <em>MV Arrecife</em> culpando al temporal y dando por muerto en el mar al subdirector, <strong>Mateo Rivas</strong>.</p>
      <p>Mateo dejó fragmentada la documentación en cuatro sobres sellados para evitar que nadie pudiera manipularla de golpe. Necesitáis un ordenador o tablet conectado a la consola de respaldo, tijeras, bolígrafos y la linterna del móvil. Repartíos el papel cuando la investigación se bifurque y no abráis el siguiente sobre hasta que el terminal os lo autorice.</p>
      <p class="letter-sign">— Elena Sampedro (Archivera técnica, 1989)</p>
    </div>

    <div class="panel-box">
      <div class="panel-title">Protocolo de Credencial de Operador (Terminal de Respaldo)</div>
      <p class="small-note">Para autenticar la sesión nocturna del <strong>13 de noviembre de 1989</strong>, el sistema exige la clave compuesta por tres bloques separados por guiones: <strong><code>SIGLA-SERIE-TURNO</code></strong></p>
      <ul class="clean-list">
        <li><strong>SIGLA:</strong> Código oficial de 3 letras de esta estación (ver sello superior).</li>
        <li><strong>SERIE:</strong> Número de 3 dígitos de la <em>única lente Fresnel activa en Torre Principal</em> la noche del 13/11/1989.</li>
        <li><strong>TURNO:</strong> Código del cuadrante de guardia que cubría la <em>hora exacta de la anomalía óptica</em> (Hoja 1B).</li>
      </ul>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Óptica</th>
          <th>Serie</th>
          <th>Emplazamiento asignado</th>
          <th>Estado a 13/11/1989</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Lente Fresnel Tipo II</td>
          <td><code>204</code></td>
          <td>Almacén de Reserva (Planta baja)</td>
          <td>Desmontada y embalada en caja</td>
        </tr>
        <tr class="row-highlight">
          <td>Lente Fresnel Tipo I</td>
          <td><code>318</code></td>
          <td>Torre Principal · Cúpula Norte</td>
          <td>■ ACTIVA en servicio nocturno</td>
        </tr>
        <tr>
          <td>Óptica Catadióptrica</td>
          <td><code>112</code></td>
          <td>Baliza Auxiliar del Muelle Viejo</td>
          <td>Desactivada desde mayo de 1987</td>
        </tr>
        <tr>
          <td>Lente Fresnel Tipo III</td>
          <td><code>409</code></td>
          <td>Torre Sur (Repuesto sin instalar)</td>
          <td>Pendiente de montaje mecánico</td>
        </tr>
      </tbody>
    </table>
  </section>`);

  // Pág. 3 — Hoja 1B
  pages.push(`
  <section class="sheet" data-page="3" data-envelope="1">
    ${sheetHeader('HOJA 1B', 1, 3, 'Cuadrante de Guardias · 13–14 de Noviembre de 1989')}
    <p class="lead-note">Registro interno de turnos de vigilancia y mantenimiento durante la alerta naranja en Cabo Valdeira.</p>

    <table class="data-table">
      <thead>
        <tr>
          <th>Turno</th>
          <th>Franja horaria</th>
          <th>Responsable principal</th>
          <th>Observaciones de servicio</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>T12</code></td>
          <td>06:00 – 14:00</td>
          <td>Ramón Seoane</td>
          <td>Revisión matinal del grupo electrógeno y purga de filtros. Sin novedades.</td>
        </tr>
        <tr>
          <td><code>T31</code></td>
          <td>14:00 – 22:00</td>
          <td>Mateo Rivas</td>
          <td>Encendido inicial de torre a las 17:45. Cede relevo y llave B-2 antes de descender al muelle.</td>
        </tr>
        <tr class="row-highlight">
          <td><code>T49</code></td>
          <td>22:00 – 06:00</td>
          <td>Tomás Quiroga</td>
          <td>Guardia nocturna en Torre Principal. <em>Incidencia registrada en fotómetro a las 02:15 h.</em></td>
        </tr>
        <tr>
          <td><code>T07</code></td>
          <td>08:00 – 20:00</td>
          <td>Subcontrata Muelle</td>
          <td>Trabajos de escollera diurnos. Recinto evacuado antes del anochecer.</td>
        </tr>
      </tbody>
    </table>

    <div class="hand-note-box">
      <div class="hand-note-title">Anotación manuscrita en cubierta del parte de incidencias (tinta azul):</div>
      <p class="handwritten">"La alarma sonora saltó a las <strong>02:15 de la madrugada</strong> en la cúpula de Torre Principal, pero alguien desconectó el zumbador en consola. El registro automático quedó archivado bajo una clave de ocho caracteres que alguien tachó en el libro telegráfico (Hojas 1C y 1D)."</p>
    </div>

    <div class="panel-box">
      <div class="panel-title">Guía rápida de interfaz para Fer y Lucía</div>
      <p class="small-note">Una vez introduzcáis la credencial de operador en el sistema digital, quedará habilitado el <strong>Terminal de Archivo Digital</strong> en pantalla. Allí podréis consultar cualquier referencia de expediente oficial que descubráis en las hojas físicas.</p>
    </div>
  </section>`);

  // Pág. 4 — Hoja 1C
  pages.push(`
  <section class="sheet" data-page="4" data-envelope="1">
    ${sheetHeader('HOJA 1C', 1, 4, 'Telegrama de Servicio Censurado (Matriz Base)')}
    <p class="small-note">Copia íntegra del bloque telegráfico enviado por Mateo Rivas el 14/11/1989. Por sí sola contiene decenas de caracteres de relleno para despistar a la censura interna. No recortéis esta hoja.</p>
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
    <p class="small-note">Leed los caracteres revelados de izquierda a derecha y de arriba a abajo para formar la referencia <code>EXP-__-___</code> e introducidla tanto en el reto 1.2 como en el <strong>Terminal de Archivo Digital</strong>.</p>
  </section>`);

  // Pág. 6 — Hoja 1E (incluye Sello de Plancha I)
  pages.push(`
  <section class="sheet" data-page="6" data-envelope="1">
    ${sheetHeader('HOJA 1E', 1, 6, 'Especificación Técnica de Baliza Norte · Decreto Náutico')}
    <p class="lead-note">Documento de calibración óptica de la Torre Principal para el cruce con el expediente digital recuperado del fotómetro.</p>

    <div class="panel-box">
      <div class="panel-title">Parámetros Oficiales del Haz Luminoso</div>
      <table class="data-table compact">
        <tbody>
          <tr>
            <th>Sector vigilado</th>
            <td>Canal Exterior de Cabo Valdeira (Paso Norte)</td>
          </tr>
          <tr>
            <th>Azimut nominal oficial (Decreto 1984)</th>
            <td><strong>284°</strong> (referencia fija desde eje de cúpula)</td>
          </tr>
          <tr>
            <th>Tolerancia operativa por temporal</th>
            <td>±10° máximo admisible por oscilación de viento</td>
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
      <p class="small-note">Consultad la referencia extraída de la rejilla de Cardano en el <strong>Terminal de Archivo Digital</strong>. Localizad el instante de anomalía crítica y calculad la diferencia absoluta en grados respecto al azimut nominal oficial (<code>284°</code>).</p>
      <p class="small-note">Formato de respuesta requerido: <strong><code>GRADOS-HHMM</code></strong> (ejemplo: si una desviación fuera de 08° a las 01:30, escribiríais <code>08-0130</code>).</p>
    </div>

    <div class="hand-note-box">
      <div class="hand-note-title">Nota de conservación de Mateo Rivas:</div>
      <p class="handwritten">"Guardad este sello inferior. Cada uno de los cuatro sobres conserva una plancha distinta; al final del caso las necesitaréis todas juntas."</p>
    </div>

    <div class="sheet-bottom-seal">
      ${renderPlateSealSvg(PLATE_SEALS[0])}
    </div>
  </section>`);

  // --------------------------------------------------------------------------
  // SOBRE 2 (Págs. 7–14)
  // --------------------------------------------------------------------------
  pages.push(coverPageHtml(2, 7, 14, 8)); // Pág. 7

  // Pág. 8 — Hoja 2A (incluye Sello de Plancha II + Instrucciones Hilo A)
  pages.push(`
  <section class="sheet" data-page="8" data-envelope="2">
    ${sheetHeader('HOJA 2A', 2, 8, 'HILO A · Carta Batimétrica e Instrucciones de Pliegue')}
    <div class="coop-banner">TRABAJO COOPERATIVO PARALELO: Mientras uno de los dos resuelve este Hilo A (Hojas 2A–2B), el otro puede avanzar el Hilo B con la Hoja 2C y el Receptor de Radiobaliza.</div>

    <div class="panel-box">
      <div class="panel-title">Instrucciones de Plegado Oculto (Hoja 2B)</div>
      <p class="small-note">El plano batimétrico de la Hoja 2B esconde el punto exacto donde yace el casco del <em>MV Arrecife</em>. Para revelarlo sin dañar la lámina:</p>
      <ol class="clean-list">
        <li>Localizad las dos líneas verticales discontinuas marcadas como <strong>PLIEGUE A (▲A)</strong> y <strong>PLIEGUE B (▲B)</strong>.</li>
        <li>Realizad un pliegue hacia atrás por la línea <strong>PLIEGUE A</strong> y otro por la línea <strong>PLIEGUE B</strong> (doblando en acordeón para ocultar por detrás toda la franja central con las cifras de profundidad en metros).</li>
        <li>Unid exactamente borde con borde la línea <strong>PLIEGUE A</strong> y la línea <strong>PLIEGUE B</strong>. Los fragmentos dispersos encajarán formando un código vertical de 6 caracteres.</li>
      </ol>
      <p class="small-note">Introducid el código revelado en el <strong>Hilo A (2.A)</strong> con formato <code>PALABRA-NUMERO</code> (ej. <code>SECTOR-00</code>).</p>
    </div>

    <div class="hand-note-box">
      <div class="hand-note-title">Extracto de la nota de cubierta de Mateo Rivas:</div>
      <p class="handwritten">"El pecio no embarrancó en los arrecifes someros como escribió la prensa. Quien giró la lente norte buscaba un punto concreto donde el fondo cae a pique y nadie baja a rescatar la carga."</p>
    </div>

    <div class="sheet-bottom-seal">
      ${renderPlateSealSvg(PLATE_SEALS[1])}
    </div>
  </section>`);

  // Pág. 9 — Hoja 2B (Fold-in SVG grande)
  pages.push(`
  <section class="sheet" data-page="9" data-envelope="2">
    ${sheetHeader('HOJA 2B', 2, 9, 'HILO A · Levantamiento Batimétrico Sector Cabo Valdeira (PLEGAR A ↔ B)')}
    <p class="small-note">Doblad esta hoja ocultando la zona central entre <strong>PLIEGUE A</strong> y <strong>PLIEGUE B</strong> hasta tocar ambas líneas.</p>
    <div class="svg-center-box">
      ${renderFoldInSvg()}
    </div>
  </section>`);

  // Pág. 10 — Hoja 2C (Tabla Boyas + Tabla Morse para Hilo B)
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
      <div class="panel-title">Criterios de Filtrado (Nota técnica del Archivo de Señales)</div>
      <p class="small-note">La transmisión de emergencia oculta procede únicamente de una baliza que cumpla las <strong>cuatro condiciones simultáneas</strong>: (1) Sector <strong>Cabo Valdeira</strong>, (2) Banda de <strong>400 kHz</strong>, (3) Modulación <strong>CW Morse</strong> y (4) Estado <strong>Activa instalada después de 1988</strong>.</p>
    </div>

    <table class="data-table compact">
      <thead>
        <tr>
          <th>Baliza</th>
          <th>Sector marítimo</th>
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

  // Pág. 11 — Hoja 2D (Manual Astrolabio)
  pages.push(`
  <section class="sheet" data-page="11" data-envelope="2">
    ${sheetHeader('HOJA 2D', 2, 11, 'CONVERGENCIA A+B · Manual del Astrolabio Cifrador de Valdeira')}
    <p class="lead-note">Cuando hayáis completado tanto el <strong>Hilo A (2.A)</strong> como el <strong>Hilo B (2.B)</strong>, reunid sus resultados para operar este instrumento.</p>

    <div class="panel-box">
      <div class="panel-title">Montaje y Uso del Astrolabio</div>
      <ol class="clean-list">
        <li>Tomad la <strong>Hoja 2F</strong> y recortad cuidadosamente con tijeras el <strong>Disco Interior</strong> por su borde circular discontinuo rojo (✂). <strong>No recortéis la Hoja 2E</strong>.</li>
        <li>Apoyad el Disco Interior recortado sobre el círculo central de la <strong>Hoja 2E (Anillo Exterior)</strong> haciendo coincidir ambos centros marcados con una cruz roja (<code>+</code>). Podéis sujetar el centro con la punta de un bolígrafo mientras lo giráis.</li>
        <li>Girad el Disco Interior hasta que la flecha prominente <strong><code>▲ ÍNDICE</code></strong> (situada en el sector rayado de la letra <code>V</code>) apunte exactamente a la letra o número de sector indicado en el despacho digital <strong><code>DESPACHO-042</code></strong>.</li>
        <li>Para <strong>DESCIFRAR</strong> un criptograma: localizad cada letra del mensaje cifrado en el <strong>Disco Interior</strong> y leed la letra correspondiente alineada justo enfrente en el <strong>Anillo Exterior</strong>.</li>
      </ol>
    </div>

    <div class="hand-note-box">
      <div class="hand-note-title">Nota sobre la conservación del instrumento:</div>
      <p class="handwritten">"No tiréis el Astrolabio al concluir el Sobre 2. Su escala numérica 01–26 del Anillo Exterior volverá a ser imprescindible cuando reunáis los cuatro sellos de plancha al cierre del caso."</p>
    </div>
  </section>`);

  // Pág. 12 — Hoja 2E (Astrolabio Anillo Exterior Base)
  pages.push(`
  <section class="sheet" data-page="12" data-envelope="2">
    ${sheetHeader('HOJA 2E', 2, 12, 'Astrolabio de Valdeira · Anillo Exterior Base (NO RECORTAR)')}
    <p class="small-note">Colocad aquí encima el Disco Interior recortado de la Hoja 2F haciendo coincidir la cruz central (<code>+</code>).</p>
    <div class="svg-center-box">
      ${renderAstrolabeOuterSvg()}
    </div>
  </section>`);

  // Pág. 13 — Hoja 2F (Astrolabio Disco Interior Recortable)
  pages.push(`
  <section class="sheet" data-page="13" data-envelope="2">
    ${sheetHeader('HOJA 2F', 2, 13, 'Astrolabio de Valdeira · Disco Interior Cifrador (RECORTAR ✂)')}
    <p class="small-note">Recortad el círculo completo por la línea discontinua roja exterior (Ø 124 mm). El sector rayado con <strong>▲ ÍNDICE</strong> marca el punto de alineación.</p>
    <div class="svg-center-box">
      ${renderAstrolabeInnerSvg()}
    </div>
  </section>`);

  // Pág. 14 — Hoja 2G (Hoja de trabajo Convergencia)
  pages.push(`
  <section class="sheet" data-page="14" data-envelope="2">
    ${sheetHeader('HOJA 2G', 2, 14, 'Cuaderno de Convergencia A+B · Registro de Descifrado')}
    <p class="lead-note">Usad esta hoja para anotar y cruzar la información que ha reunido cada investigador durante el Acto II.</p>

    <div class="panel-box">
      <div class="panel-title">Casillas de Trabajo</div>
      <div class="work-grid">
        <div class="work-row"><span>1. Coordenada de la Carta Plegada (Hilo A):</span><div class="blank-line"></div></div>
        <div class="work-row"><span>2. Palabra recibida en Radiobaliza Morse (Hilo B):</span><div class="blank-line"></div></div>
        <div class="work-row"><span>3. Letra de alineación para ▲ ÍNDICE (según DESPACHO-042):</span><div class="blank-line"></div></div>
        <div class="work-row"><span>4. Criptograma recuperado en DESPACHO-042:</span><div class="blank-line"></div></div>
      </div>
    </div>

    <div class="panel-box">
      <div class="panel-title">Tabla de Traducción Letra a Letra (Disco Interior → Anillo Exterior)</div>
      <table class="data-table">
        <thead>
          <tr><th>Posición</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th></tr>
        </thead>
        <tbody>
          <tr><th>Letra Interior (Cifrada)</th><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
          <tr><th>Letra Exterior (Clara)</th><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        </tbody>
      </table>
    </div>
  </section>`);

  // --------------------------------------------------------------------------
  // SOBRE 3 (Págs. 15–22)
  // --------------------------------------------------------------------------
  pages.push(coverPageHtml(3, 15, 22, 8)); // Pág. 15

  // Pág. 16 — Hoja 3A
  pages.push(`
  <section class="sheet" data-page="16" data-envelope="3">
    ${sheetHeader('HOJA 3A', 3, 16, 'HILO A · Recorte de Prensa, Recibo #19 y Control de Accesos')}
    <div class="coop-banner">SEGUNDA BIFURCACIÓN COOPERATIVA: Hilo A (Hojas 3A–3C, investigación y reglamento) e Hilo B (Hojas 3D–3G, óptica al contraluz y carta náutica).</div>

    <div class="newspaper-box">
      <div class="news-head">LA VOZ DE LA COSTA · MIÉRCOLES, 15 DE NOVIEMBRE DE 1989</div>
      <h3>La Comandancia atribuye el naufragio del <em>MV Arrecife</em> a un fallo mecánico en Cabo Valdeira</h3>
      <p>El director del observatorio, <strong>Dr. Arturo Méndez-Vidal</strong>, declaró ayer desde la sede provincial de A Coruña que el temporal arrancó parte del cableado exterior poco después de las dos de la madrugada. Sin embargo, fuentes portuarias cuestionan por qué ninguna patrulla halló rastro de Mateo Rivas tras cerrarse la torre.</p>
    </div>

    <div class="receipt-box">
      <div class="receipt-title">RESGUARDO DE CUSTODIA DE LLAVES · RECIBO #19</div>
      <p><strong>Fecha y hora:</strong> 13/11/1989 · 18:05 h</p>
      <p><strong>Entrega:</strong> Mateo Rivas (Subdirector) hace entrega temporal de la llave de servicio <strong><code>LLAVE B-2</code></strong> (acceso interior a Cúpula del Servo · Torre Principal).</p>
      <p><strong>Receptor autorizado para guardia nocturna:</strong> <strong>Tomás Quiroga</strong> (Ingeniero técnico de turno).</p>
      <p class="small-note"><em>Firmado por ambos al pie del resguardo antes del relevo vespertino.</em></p>
    </div>

    <div class="panel-box">
      <div class="panel-title">Referencia digital asociada</div>
      <p class="small-note">Consultad en el <strong>Terminal de Archivo Digital</strong> la referencia de auditoría electrónica de cerraduras: <strong><code>EXP-LLAVES-89</code></strong> para verificar qué llave exacta abrió y cerró la Cúpula del Servo durante el sabotaje.</p>
    </div>
  </section>`);

  // Pág. 17 — Hoja 3B
  pages.push(`
  <section class="sheet" data-page="17" data-envelope="3">
    ${sheetHeader('HOJA 3B', 3, 17, 'HILO A · Registro de Centralita Telefónica y Coartadas Verificadas')}
    <p class="lead-note">Cruza los movimientos documentados de los cinco miembros de la plantilla entre las 01:45 y las 03:00 de la noche del 13 al 14 de noviembre de 1989.</p>

    <table class="data-table compact">
      <thead>
        <tr>
          <th>Integrante</th>
          <th>Llave asignada</th>
          <th>Coartada / Registro físico (02:00–02:45)</th>
          <th>Centralita telefónica</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Dr. Arturo Méndez-Vidal</strong><br/><span>(Director)</span></td>
          <td><code>B-1</code><br/>(Archivo/Cúpula)</td>
          <td>Confirmada presencia en Capitanía Marítima de A Coruña (75 km; carretera costera cortada).</td>
          <td>Llamada entrante verificada desde A Coruña a las <code>02:12</code>.</td>
        </tr>
        <tr>
          <td><strong>Mateo Rivas</strong><br/><span>(Subdirector)</span></td>
          <td><code>B-2</code><br/><em>(Cedida 18:05)</em></td>
          <td>Acompañado por dos patrulleros de Guardia Costera en el Muelle Sur entre <code>02:05</code> y <code>02:30</code>.</td>
          <td>Sin llamadas en cabina.</td>
        </tr>
        <tr>
          <td><strong>Elena Sampedro</strong><br/><span>(Archivera)</span></td>
          <td><code>A-4</code><br/>(Archivo)</td>
          <td>Ticket oficial de taxi hacia Cee sellado a las <code>21:40</code>; testigo en domicilio familiar.</td>
          <td>Sin actividad nocturna.</td>
        </tr>
        <tr>
          <td><strong>Ramón Seoane</strong><br/><span>(Maquinista)</span></td>
          <td><code>C-1</code><br/>(Sótano Motores)</td>
          <td>Parte de avería firmado con aprendiz en sala de calderas/diésel de <code>02:05</code> a <code>02:40</code>.</td>
          <td>Llamada interna sótano <code>02:22</code>.</td>
        </tr>
        <tr>
          <td><strong>Tomás Quiroga</strong><br/><span>(Ing. Nocturno)</span></td>
          <td><code>B-2</code><br/><em>(Recibo #19)</em></td>
          <td><strong>Sin testigo ni registro verificado</strong> entre las <code>02:00</code> y las <code>02:45</code> en su puesto.</td>
          <td>Llamada saliente a las <code>02:50</code> desde torre a Naviera Atlántica Ibérica (<code>981-44-109</code>).</td>
        </tr>
      </tbody>
    </table>

    <div class="panel-box">
      <div class="panel-title">Objetivo del Reto 3.A</div>
      <p class="small-note">Una vez verificado <code>EXP-LLAVES-89</code> en el Terminal y contrastadas las coartadas, introducid en el <strong>Reto 3.A</strong> el <strong>nombre y apellido</strong> del autor material del sabotaje en la cúpula.</p>
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
    ${sheetHeader('HOJA 3C', 3, 18, 'HILO A · Extracto del Reglamento Técnico de Estaciones (Ed. 1979)')}
    <p class="lead-note">Normativa oficial utilizada como texto base de cifrado. Cuando desbloqueéis el registro <strong><code>BITACORA-MR</code></strong> en el Terminal tras resolver 3.A, aplicad aquí sus pares <code>(Artículo · Palabra)</code>.</p>

    <div class="reglamento-box">
      <div class="reglamento-head">ORDEN CIRCULAR HIDROGRÁFICA · CAPÍTULO IV (CUSTODIA DE MATERIAL)</div>
      ${articlesHtml}
    </div>

    <div class="panel-box">
      <div class="panel-title">Instrucciones de conteo</div>
      <p class="small-note">Contad cada palabra de izquierda a derecha dentro de cada artículo (los superíndices discretos <code>[5]</code> y <code>[10]</code> sirven de apoyo para agilizar la cuenta). Tomad únicamente la <strong>primera letra</strong> de cada palabra seleccionada (ignorando tildes) para obtener la ubicación de 8 letras donde Mateo ocultó las planchas originales (Reto 3.B).</p>
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

  // Pág. 21 — Hoja 3F (Instrucciones Carta Náutica + Sello de Plancha III)
  pages.push(`
  <section class="sheet" data-page="21" data-envelope="3">
    ${sheetHeader('HOJA 3F', 3, 21, 'HILO B · Procedimiento de Triangulación en Carta Náutica')}
    <div class="panel-box">
      <div class="panel-title">Interpretación de los rumbos revelados al trasluz</div>
      <ul class="clean-list">
        <li>La cifra superior marcada con <strong><code>F:</code></strong> indica la demora magnética en grados desde el <strong>Faro Norte</strong>.</li>
        <li>La cifra inferior marcada con <strong><code>B:</code></strong> indica la demora magnética en grados desde la <strong>Boya Este</strong>.</li>
        <li>Abrid la pestaña <strong>Carta Náutica Interactiva</strong> en la consola web, ajustad ambos diales a los grados obtenidos al trasluz y observad el punto exacto donde se cruzan ambos haces.</li>
        <li>Haced clic en el cuadrante exacto de intersección (<code>A1–F6</code>) y confirmad el código con el formato <strong><code>RUMBO_F-RUMBO_B-CUADRANTE</code></strong> (ejemplo: <code>180-270-B3</code>).</li>
      </ul>
    </div>

    <div class="hand-note-box">
      <div class="hand-note-title">Nota manuscrita de Mateo Rivas:</div>
      <p class="handwritten">"Si la marea sube en la cámara antigua, buscad justo donde se cruzan la luz del Faro Norte y la demora de la Boya Este. Allí siguen selladas las matrices de latón."</p>
    </div>

    <div class="sheet-bottom-seal">
      ${renderPlateSealSvg(PLATE_SEALS[2])}
    </div>
  </section>`);

  // Pág. 22 — Hoja 3G (Plano referencial cámara de mareas)
  pages.push(`
  <section class="sheet" data-page="22" data-envelope="3">
    ${sheetHeader('HOJA 3G', 3, 22, 'HILO B · Cuaderno Auxiliar de Mareas y Cuadrícula de Costa')}
    <p class="lead-note">Croquis de referencia del sector costero donde opera la Carta Náutica Interactiva del Acto III.</p>

    <div class="panel-box">
      <div class="panel-title">Leyenda de Cuadrantes Costeros (A1 – F6)</div>
      <table class="data-table compact">
        <thead>
          <tr><th>Franja</th><th>Columna A–B</th><th>Columna C–D</th><th>Columna E–F</th></tr>
        </thead>
        <tbody>
          <tr><th>Filas 1–2</th><td>Acantilado Oeste / Punta Brava</td><td><strong>Faro Norte (Sector D1/E1)</strong></td><td>Ensenada del Abra</td></tr>
          <tr><th>Filas 3–4</th><td>Bajos de Laxe</td><td>Zona de Cisternas Subterráneas</td><td>Fondeadero Exterior</td></tr>
          <tr><th>Filas 5–6</th><td>Canal del Arrecife</td><td>Veril de Fosa Sur</td><td><strong>Boya Este (Sector F5)</strong></td></tr>
        </tbody>
      </table>
    </div>

    <div class="panel-box">
      <div class="panel-title">Casillas de convergencia del Acto III</div>
      <div class="work-grid">
        <div class="work-row"><span>Autor material del sabotaje (Hilo A · 3.A):</span><div class="blank-line"></div></div>
        <div class="work-row"><span>Lugar oculto en Reglamento (Hilo A · 3.B):</span><div class="blank-line"></div></div>
        <div class="work-row"><span>Triangulación de demoras (Hilo B · 3.C):</span><div class="blank-line"></div></div>
      </div>
    </div>
  </section>`);

  // --------------------------------------------------------------------------
  // SOBRE 4 (Págs. 23–28)
  // --------------------------------------------------------------------------
  pages.push(coverPageHtml(4, 23, 28, 6)); // Pág. 23

  // Pág. 24 — Hoja 4A (Télex + Cuentas Bancarias)
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
    ${sheetHeader('HOJA 4A', 4, 24, 'Télex Intervenidos y Extracto de Cuentas Offshore')}
    <p class="lead-note">Material incautado en la caja de seguridad de la cisterna. Cruzad estos movimientos con el expediente digital <strong><code>EXP-CONSORCIO-89</code></strong> en el Terminal.</p>

    <div class="telex-grid">
      <div class="telex-box">
        <div class="telex-head">TÉLEX #1 · 09/11/1989 · 11:20 Z</div>
        <pre>DE: PRESIDENCIA CONSORCIO VALDEIRA
A: BANCA EXTERIOR / GIBRALTAR
ASUNTO: POLIZA MV ARRECIFE

AUTORIZO COMISION PACTADA DEL 15 POR CIENTO
SOBRE INDEMNIZACION TOTAL ASEGURADA.
EJECUTAR EN DOS TRAMOS IDENTICOS:
TRAMO A PREVIO AL 13 NOV / TRAMO B TRAS SINIESTRO.
IMPRESCINDIBLE FIRMA PRESIDENCIA.</pre>
      </div>
      <div class="telex-box">
        <div class="telex-head">TÉLEX #2 · 16/11/1989 · 08:45 Z</div>
        <pre>DE: CONSIGNATARIA ATLANTICA
A: PRESIDENCIA CONSORCIO VALDEIRA
ASUNTO: LIQUIDACION TRAMO B

BUQUE EN FOSA. CARGA IRRECUPERABLE.
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

    <p class="small-note">Introducid el código de la única cuenta que cumple íntegramente las condiciones de los télex y de <code>EXP-CONSORCIO-89</code> en el <strong>Reto 4.1</strong>.</p>
  </section>`);

  // Pág. 25 — Hoja 4B (Consola de Relés - Reglas)
  pages.push(`
  <section class="sheet" data-page="25" data-envelope="4">
    ${sheetHeader('HOJA 4B', 4, 25, 'Esquema de Enclavamiento Eléctrico · Bóveda Cero')}
    <p class="lead-note">Para abrir el respaldo maestro de Bóveda Cero debéis programar los seis relés numerados del <strong>1 al 6</strong> (<code>R1, R2, R3, R4, R5, R6</code>) y la fase de línea en la Consola de Relés interactiva.</p>

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
        <path d="M 22 33 L 22 38 L 47 38 L 47 33" fill="none" stroke="#b91c1c" stroke-width="0.7"/>
        <text x="34.5" y="41.5" text-anchor="middle" font-family="'Courier New', monospace" font-size="3.3" fill="#991b1b">R1 ≠ R2</text>
        <path d="M 72 33 L 72 38 L 97 38 L 97 33" fill="none" stroke="#1d4ed8" stroke-width="0.7"/>
        <text x="84.5" y="41.5" text-anchor="middle" font-family="'Courier New', monospace" font-size="3.3" fill="#1e3a8a">R3 = R4</text>
        <text x="134" y="39" text-anchor="middle" font-family="'Courier New', monospace" font-size="3.5" fill="#0f172a">Σ índices activos = V</text>
      </svg>
    </div>
  </section>`);

  // Pág. 26 — Hoja 4C (Tabla de Fase y Tensión Nominal)
  pages.push(`
  <section class="sheet" data-page="26" data-envelope="4">
    ${sheetHeader('HOJA 4C', 4, 26, 'Parte de Tensión Auxiliar y Diagnóstico de Fases')}
    <p class="lead-note">Lectura de polímetro realizada tras la instalación del tablero de emergencia de Bóveda Cero.</p>

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
          <td>Plancha I-A (Faro antiguo)</td>
          <td>□ Fusible abierto (sin retorno)</td>
          <td><code>0 V</code></td>
        </tr>
        <tr>
          <td><code>FASE II</code></td>
          <td>Plancha II-A (Generador muelle)</td>
          <td>□ Cortocircuito por salinidad</td>
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
    ${sheetHeader('HOJA 4D', 4, 27, 'META-PUZLE FINAL · Carta Testamento del Último Meridiano')}
    <div class="letter-box">
      <div class="letter-meta">Cabo Valdeira · 14 de noviembre de 1989 · 04:10 h</div>
      <p><strong>A quien haya llegado hasta el fondo de los cuatro sobres — Fer y Lucía:</strong></p>
      <p>He visto desde la pasarela exterior cómo manipulaban la lente y he comprendido que si mañana sigo en Cabo Valdeira silenciarán también mi testimonio. Esta madrugada pongo rumbo en secreto hacia Vigo con los originales notariales, pero antes dejo bloqueado el archivo maestro bajo una contraseña que nadie pueda abrir usando un único sobre.</p>
      <p>A lo largo de los cuatro sobres que habéis abierto se ocultan <strong>cuatro Sellos de Plancha</strong>, cada uno identificado por una <strong>forma geométrica distinta</strong>, un par de letras y un dígito de control (<code>XX-N</code>). Recuperad los cuatro sellos físicos de las hojas anteriores y seguid al pie de la letra la hoja de cierre <strong>4E</strong> junto con el <strong>Astrolabio del Sobre 2</strong>.</p>
      <p class="letter-sign">— Mateo Rivas</p>
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
    ${sheetHeader('HOJA 4E', 4, 28, 'META-PUZLE FINAL · Ficha de Cierre "El Meridiano Borrado"')}
    <p class="lead-note">Seguid estos cuatro pasos en orden estricto para deducir la contraseña maestra del caso.</p>

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
      <div class="panel-title">Paso 2 · Calibrar el Astrolabio del Sobre 2</div>
      <p class="small-note">Sumad los <strong>cuatro dígitos de control</strong> (<code>N₁ + N₂ + N₃ + N₄</code>). El resultado indica el <strong>número de sector (01–26)</strong> del Anillo Exterior del Astrolabio con el que debéis alinear exactamente la flecha <strong><code>▲ ÍNDICE</code></strong> del Disco Interior.</p>
      <div class="work-row"><span>Suma total de los 4 dígitos (= Sector de calibración):</span><div class="blank-line"></div></div>
    </div>

    <div class="panel-box">
      <div class="panel-title">Paso 3 · Descifrar los 4 pares de letras en orden (△ → ◎ → □ → ◇)</div>
      <p class="small-note">Con el Astrolabio calibrado en ese sector, leed las <strong>8 letras</strong> de los cuatro pares en orden (<code>Disco Interior → Anillo Exterior</code>) para formar una palabra de dos términos unidos (8 letras en total).</p>
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
      <div class="panel-title">Paso 4 · Clave Final (Bóveda Cero)</div>
      <p class="small-note">Unid la palabra descifrada con los 4 dígitos en ese mismo orden (<code>△ → ◎ → □ → ◇</code>) siguiendo el formato: <strong><code>PALABRA-DIGITOS</code></strong> (ejemplo: <code>RESPUESTA-1234</code>).</p>
    </div>
  </section>`);

  return pages.join('\n');
}

function buildPrintHtmlDocument() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(GAME_TITLE)} — Kit Imprimible</title>
  <style>
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
      color: #0f172a;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 9.8pt;
      line-height: 1.42;
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
    /* Portadas limpias de Sobre */
    .cover-sheet {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8mm;
    }
    .cover-frame {
      width: 100%;
      height: 248mm;
      border: 2.2pt solid #1e293b;
      outline: 0.7pt solid #64748b;
      outline-offset: -4mm;
      padding: 20mm 16mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      background: #fdfcf8;
    }
    .cover-top-tag {
      font-family: 'Courier New', monospace;
      font-size: 9.5pt;
      letter-spacing: 1.4pt;
      color: #475569;
      margin-bottom: 18mm;
    }
    .cover-stamp-box {
      border: 1.8pt solid #991b1b;
      color: #991b1b;
      font-family: 'Courier New', monospace;
      font-size: 11pt;
      font-weight: bold;
      letter-spacing: 2pt;
      padding: 2.5mm 7mm;
      margin-bottom: 12mm;
      transform: rotate(-2deg);
    }
    .cover-title {
      font-family: 'Courier New', monospace;
      font-size: 42pt;
      letter-spacing: 3pt;
      margin: 0 0 6mm;
      color: #0f172a;
    }
    .cover-recipient {
      font-size: 18pt;
      font-weight: bold;
      letter-spacing: 1.5pt;
      color: #1e3a8a;
      margin-bottom: 10mm;
    }
    .cover-rule {
      width: 90mm;
      height: 1pt;
      background: #334155;
      margin-bottom: 10mm;
    }
    .cover-warning {
      font-family: 'Courier New', monospace;
      font-size: 13pt;
      font-weight: bold;
      color: #991b1b;
      border: 1.2pt dashed #991b1b;
      padding: 4mm 8mm;
      margin: 0 0 12mm;
      background: #fff5f5;
    }
    .cover-meta {
      font-size: 11.5pt;
      color: #1e293b;
      margin: 0;
    }
    .cover-footer {
      margin-top: 26mm;
      font-family: 'Courier New', monospace;
      font-size: 8.5pt;
      color: #64748b;
    }

    /* Cabeceras de documento */
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1.2pt solid #1e293b;
      padding-bottom: 2mm;
      margin-bottom: 3.5mm;
      font-family: 'Courier New', monospace;
      font-size: 7.8pt;
    }
    .doc-header-left {
      display: flex;
      align-items: center;
      gap: 3mm;
    }
    .badge-folio {
      background: #0f172a;
      color: #ffffff;
      padding: 0.7mm 2.2mm;
      font-weight: bold;
      letter-spacing: 0.5pt;
    }
    .doc-header-org {
      color: #334155;
      font-weight: bold;
    }
    .doc-header-right {
      color: #475569;
    }
    .doc-title {
      font-size: 13.5pt;
      margin: 0 0 3.5mm;
      color: #0f172a;
      border-left: 3pt solid #1e3a8a;
      padding-left: 3mm;
    }

    /* Bloques interiores */
    .membrete-box {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border: 1pt solid #334155;
      background: #f8fafc;
      padding: 3mm 4mm;
      margin-bottom: 4mm;
      font-size: 8.5pt;
    }
    .station-stamp {
      border: 1.5pt solid #991b1b;
      padding: 1.5mm 4mm;
      text-align: center;
      background: #ffffff;
    }
    .stamp-mini-title {
      font-family: 'Courier New', monospace;
      font-size: 6.5pt;
      color: #991b1b;
      font-weight: bold;
    }
    .stamp-mini-code {
      font-family: 'Courier New', monospace;
      font-size: 14pt;
      font-weight: bold;
      color: #991b1b;
      letter-spacing: 1pt;
    }
    .letter-box {
      border: 0.8pt solid #94a3b8;
      background: #fdfcf6;
      padding: 4mm 5mm;
      margin-bottom: 4mm;
    }
    .letter-meta {
      font-family: 'Courier New', monospace;
      font-size: 8pt;
      color: #475569;
      margin-bottom: 2.5mm;
      border-bottom: 0.5pt dotted #cbd5e1;
      padding-bottom: 1.5mm;
    }
    .letter-box p {
      margin: 0 0 2.5mm;
    }
    .letter-sign {
      text-align: right;
      font-style: italic;
      margin-bottom: 0 !important;
    }
    .panel-box {
      border: 0.8pt solid #475569;
      background: #ffffff;
      padding: 3.2mm 4.2mm;
      margin-bottom: 3.8mm;
    }
    .compact-box {
      padding: 2.5mm 3.5mm;
      margin-bottom: 3mm;
    }
    .panel-title {
      font-family: 'Courier New', monospace;
      font-size: 8.8pt;
      font-weight: bold;
      color: #1e3a8a;
      margin-bottom: 2mm;
      text-transform: uppercase;
    }
    .lead-note {
      margin: 0 0 3.5mm;
      font-size: 9.6pt;
    }
    .small-note {
      margin: 0 0 2.2mm;
      font-size: 8.8pt;
      color: #1e293b;
    }
    .clean-list {
      margin: 1mm 0 1mm 5mm;
      padding: 0;
    }
    .clean-list li {
      margin-bottom: 1.5mm;
      font-size: 9pt;
    }
    code {
      font-family: 'Courier New', monospace;
      font-weight: bold;
      background: #f1f5f9;
      padding: 0.2mm 1.2mm;
      border: 0.3pt solid #cbd5e1;
      font-size: 8.8pt;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 3.8mm;
      font-size: 8.6pt;
    }
    .data-table.compact {
      font-size: 8pt;
      margin-bottom: 3mm;
    }
    .data-table th, .data-table td {
      border: 0.6pt solid #475569;
      padding: 1.8mm 2.4mm;
      text-align: left;
      vertical-align: top;
    }
    .data-table thead th {
      background: #e2e8f0;
      font-family: 'Courier New', monospace;
      font-size: 8pt;
      color: #0f172a;
    }
    .row-highlight {
      background: #f4f7fb;
      font-weight: normal;
    }
    .hand-note-box {
      border: 1pt dashed #1e3a8a;
      background: #f8fbff;
      padding: 3.2mm 4.2mm;
      margin-bottom: 3.8mm;
    }
    .hand-note-title {
      font-family: 'Courier New', monospace;
      font-size: 8pt;
      font-weight: bold;
      color: #1e3a8a;
      margin-bottom: 1.2mm;
    }
    .handwritten {
      margin: 0;
      font-style: italic;
      color: #1e293b;
      font-size: 9.2pt;
    }
    .coop-banner {
      border: 1pt solid #0f766e;
      background: #f0fdfa;
      color: #134e4a;
      padding: 2.2mm 3.5mm;
      margin-bottom: 3.5mm;
      font-family: 'Courier New', monospace;
      font-size: 8.2pt;
      font-weight: bold;
    }
    .svg-center-box {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 3mm 0;
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
      padding: 0.6mm 1.5mm;
      font-family: 'Courier New', monospace;
      font-size: 8.2pt;
    }
    .morse-ch {
      font-weight: bold;
      color: #0f172a;
    }
    .morse-dots {
      letter-spacing: 0.8pt;
      font-weight: bold;
      color: #1e3a8a;
    }
    .newspaper-box {
      border: 1.2pt solid #1e293b;
      background: #faf9f5;
      padding: 3.2mm 4.5mm;
      margin-bottom: 3.8mm;
    }
    .news-head {
      font-family: 'Courier New', monospace;
      font-size: 8pt;
      font-weight: bold;
      border-bottom: 0.8pt solid #1e293b;
      padding-bottom: 1mm;
      margin-bottom: 2mm;
    }
    .newspaper-box h3 {
      margin: 0 0 2mm;
      font-size: 11pt;
    }
    .newspaper-box p {
      margin: 0;
      font-size: 8.8pt;
    }
    .receipt-box {
      border: 1pt dashed #7c2d12;
      background: #fffaf5;
      padding: 3.5mm 4.5mm;
      margin-bottom: 3.8mm;
    }
    .receipt-title {
      font-family: 'Courier New', monospace;
      font-size: 8.8pt;
      font-weight: bold;
      color: #7c2d12;
      margin-bottom: 2mm;
    }
    .receipt-box p {
      margin: 0 0 1.6mm;
      font-size: 9pt;
    }
    .reglamento-box {
      border: 1pt solid #1e293b;
      background: #fdfcf9;
      padding: 4mm 5mm;
      margin-bottom: 4mm;
    }
    .reglamento-head {
      font-family: 'Courier New', monospace;
      font-size: 8.5pt;
      font-weight: bold;
      text-align: center;
      border-bottom: 0.8pt solid #334155;
      padding-bottom: 2mm;
      margin-bottom: 3mm;
    }
    .article-row {
      margin-bottom: 3.2mm;
      font-size: 9.4pt;
      line-height: 1.5;
    }
    .art-num {
      font-family: 'Courier New', monospace;
      font-weight: bold;
      color: #1e3a8a;
    }
    .word-mark {
      font-family: 'Courier New', monospace;
      font-size: 6.5pt;
      color: #1d4ed8;
      margin-left: 0.3mm;
      font-weight: bold;
    }
    .contraluz-sheet .contraluz-header {
      height: 35mm;
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
      margin-bottom: 3.8mm;
    }
    .telex-box {
      border: 0.8pt solid #334155;
      background: #fcfaf2;
      padding: 2.5mm 3mm;
    }
    .telex-head {
      font-family: 'Courier New', monospace;
      font-size: 7.4pt;
      font-weight: bold;
      color: #991b1b;
      border-bottom: 0.5pt solid #94a3b8;
      padding-bottom: 1mm;
      margin-bottom: 1.5mm;
    }
    .telex-box pre {
      margin: 0;
      font-family: 'Courier New', monospace;
      font-size: 7pt;
      line-height: 1.35;
      white-space: pre-wrap;
    }
    .relay-diagram-box {
      display: flex;
      justify-content: center;
      margin-top: 4mm;
    }
    .work-grid {
      display: flex;
      flex-direction: column;
      gap: 3mm;
    }
    .work-row {
      display: flex;
      align-items: flex-end;
      gap: 3mm;
      font-size: 8.8pt;
    }
    .blank-line {
      flex: 1;
      border-bottom: 0.8pt dashed #475569;
      height: 6mm;
    }
  </style>
</head>
<body>
${buildAllPagesHtml()}
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
      autoDiscover: ['DESPACHO-042', 'BOYA-89-E', 'BITACORA-MR'].includes(doc.id),
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

Esta guía explica cómo imprimir y preparar los cuatro sobres para **Fer y Lucía** sin revelar absolutamente nada del contenido ni de los enigmas.

---

## 1. Instrucciones de impresión

Imprimid el archivo [imprimir/KIT_ESCAPE_ROOM.pdf](./imprimir/KIT_ESCAPE_ROOM.pdf) siguiendo estas cuatro reglas estrictas:

1. **Tamaño de papel:** A4 vertical (*Portrait*).
2. **A una cara:** **NO imprimáis a doble cara**. Algunas hojas deben recortarse o superponerse frente a una luz durante la partida.
3. **Escala real (100% / Tamaño real):** Desactivad cualquier opción tipo *"Ajustar a página"* o *"Reducir para ajustar"*. Las plantillas recortables y superposiciones dependen de una escala exacta \`1:1\`.
4. **Color recomendado (100% compatible con Blanco y Negro):** El dosier está diseñado en color archivístico, pero todos los elementos críticos llevan formas, iconos o tramas distintas, así que es 100% jugable también si se imprime en blanco y negro o escala de grises.

---

## 2. Montaje a ciegas de los 4 sobres

El PDF tiene **28 páginas** en total. Cada sobre comienza con una **hoja de portada limpia** que ocupa la primera página de su bloque y no revela nada del interior. Basta con separar las hojas mirando únicamente esas portadas:

| Sobre físico | Rango exacto de páginas | Cantidad de hojas | Cuándo se abre |
| :--- | :--- | :--- | :--- |
| **SOBRE 1** | **Páginas 1 a 6** | 6 hojas | Al iniciar la partida tras pulsar *Comenzar investigación* |
| **SOBRE 2** | **Páginas 7 a 14** | 8 hojas | Solo cuando la consola web indique abrir el Sobre 2 |
| **SOBRE 3** | **Páginas 15 a 22** | 8 hojas | Solo cuando la consola web indique abrir el Sobre 3 |
| **SOBRE 4** | **Páginas 23 a 28** | 6 hojas | Solo cuando la consola web indique abrir el Sobre 4 |

> **Importante:** **NO recortéis ni dobléis nada antes de empezar a jugar.** Todas las piezas se preparan en vivo sobre la mesa cuando la historia lo requiere.

---

## 3. Lista de materiales caseros necesarios

Antes de abrir el Sobre 1, dejad sobre la mesa:

- **Unas tijeras** (útiles para las piezas recortables que irán apareciendo).
- **Dos bolígrafos o lápices** (uno para Fer y otro para Lucía) y papel sucio opcional para tomar notas.
- **Celo / cinta adhesiva** (opcional, útil si queréis fijar alguna marca o pliegue con comodidad).
- **Un teléfono móvil con linterna** (la función de linterna trasera será necesaria en uno de los tramos del juego).
- **Ordenador, portátil o tablet con sonido activado** (y móvil adicional opcional si preferís consultar ambos desde la web).
`;
}

function buildSolutionsMd() {
  const book = solveBookCipher(BOOK_CIPHER_ARTICLES, BOOK_CIPHER_COORDS);
  const e6Decoded = astrolabeDecode('YHZNGAUZ', 'T');
  const e12Decoded = astrolabeDecode('CWXEZJZQ', 'W');
  const relayValidStates = [];
  for (let mask = 0; mask < 64; mask++) {
    const bits = [0, 1, 2, 3, 4, 5].map((i) => (mask >> i) & 1);
    const res = evaluateRelayRules(bits);
    if (res.valid) relayValidStates.push(bits.join(''));
  }

  return `# SOLUCIONES_NO_ABRIR.md — *${GAME_TITLE}*

> **ADVERTENCIA:** Este archivo contiene todas las soluciones completas, deducciones paso a paso y desenlace del escape room. Está incluido en \`.gitignore\`.

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
1. **1.1 Credencial de Respaldo (\`CVL-318-T49\`):**
   - Hoja 1A: Sigla de estación \`CVL\`. Única lente activa en Torre Principal = Serie \`318\` (204 en almacén, 112 desactivada, 409 sin instalar).
   - Hoja 1B: Turno de madrugada (22:00–06:00) que cubre la anomalía de las 02:15 = \`T49\`.
2. **1.2 El Acta Censurada [Rejilla de Cardano] (\`EXP-89-407\`):**
   - Al recortar los 8 cuadros de Hoja 1D y alinear \`R1..R4\` sobre Hoja 1C aparecen por filas las celdas \`(0,2)=E\`, \`(1,9)=X\`, \`(2,4)=P\`, \`(4,1)=8\`, \`(5,7)=9\`, \`(6,10)=4\`, \`(7,3)=0\`, \`(8,8)=7\` → \`EXP-89-407\`.
3. **1.3 Desvío en la Cúpula (\`14-0215\`):**
   - Consultar \`EXP-89-407\` en el Terminal muestra \`02:15 MANUAL-OVERRIDE 298°\`.
   - Azimut oficial en Hoja 1E = \`284°\`. Desvío: \`298 - 284 = 14°\` (>10° crítico) a las \`02:15\` → \`14-0215\`.
   - **Sello de Plancha I (Hoja 1E, pág. 6):** \`◎ PLANCHA I · MERIDIANO 04°W · COD. XE-7\`.

### ACTO II — Sobre 2 (Págs. 7–14 · Ramas Paralelas #1)
4. **2.A La Carta Plegada [Fold-In] (\`FOSA-42\`):**
   - Al doblar Hoja 2B uniendo \`PLIEGUE A\` (\`x=56\`) con \`PLIEGUE B\` (\`x=120\`) se forman los 6 caracteres verticales \`F O S A 4 2\` → \`FOSA-42\`.
   - Desbloquea \`DESPACHO-042\` con criptograma \`YHZNGAUZ\` y orden de alinear \`▲ ÍNDICE\` con la primera letra del Hilo B.
   - **Sello de Plancha II (Hoja 2A, pág. 8):** \`◇ PLANCHA II · MERIDIANO 08°W · COD. ZQ-2\`.
5. **2.B La Baliza Fantasma [Morse Web Audio] (\`TRAMPA\`):**
   - Hoja 2C: Única boya en Cabo Valdeira + banda 400 kHz + CW Morse + activa tras 1988 = \`Boya E-4 (418.5 kHz)\`.
   - En \`418.5 kHz\` el receptor Web Audio emite \`${RADIO_SPEC.morse}\` → \`TRAMPA\`.
6. **2.C El Astrolabio de Valdeira [Disco Cifrador] (\`RESIDUOS\`):**
   - Primera letra de \`TRAMPA\` = \`T\` (sector 20, índice 19).
   - Con \`▲ ÍNDICE\` (\`V\` del alfabeto clave \`${ASTROLABE_INNER}\`) alineado con \`T\`, \`YHZNGAUZ\` (Interior → Exterior) da \`${e6Decoded}\`.

### ACTO III — Sobre 3 (Págs. 15–22 · Ramas Paralelas #2)
7. **3.A El Saboteador de la Cúpula [Lógica Documental] (\`Tomás Quiroga\`):**
   - Terminal \`EXP-LLAVES-89\` confirma uso de \`LLAVE B-2\` a las \`02:09\` y \`02:47\`.
   - Recibo #19 (Hoja 3A): Mateo Rivas entrega \`LLAVE B-2\` a \`Tomás Quiroga\` a las \`18:05\`.
   - Hoja 3B: Mateo Rivas tiene coartada con Guardia Costera (02:05–02:30); Méndez-Vidal está en A Coruña (02:12); Seoane en sótano con testigo (02:05–02:40); Sampedro en Cee (21:40). Quiroga sin coartada + llamada a Naviera Atlántica a las 02:50 → \`Tomás Quiroga\`.
8. **3.B El Reglamento Cifrado [Cifrado de Libro] (\`CISTERNA\`):**
   - \`BITACORA-MR\` indica \`3·5 — 5·8 — 7·12 — 1·13 — 8·10 — 2·8 — 6·8 — 4·11\`.
   - Palabras extraídas de Hoja 3C: ${book.steps.map((s) => `(${s.artNum},${s.wordPos})=${s.word}→${s.letter}`).join(', ')} → \`${book.word}\`.
9. **3.C Triangulación al Contraluz [Contraluz + Carta Náutica] (\`210-285-C4\`):**
   - Superponiendo Hojas 3D y 3E frente a la linterna se lee \`F: 210\` y \`B: 285\`.
   - En la Carta Náutica Web (\`Faro Norte = 210°\`, \`Boya Este = 285°\`), los rayos se cruzan exactamente en el centro de \`C4\` → \`210-285-C4\`.
   - **Sello de Plancha III (Hoja 3F, pág. 21):** \`△ PLANCHA III · MERIDIANO 12°W · COD. CW-5\`.

### ACTO IV — Sobre 4 (Págs. 23–28)
10. **4.1 La Cuenta Fantasma (\`GIB-7742\`):**
    - \`EXP-CONSORCIO-89\`: Póliza = \`40.000.000 PTA\`, presidente = \`Enrique Balboa (E.B.)\`.
    - Télex Hoja 4A: 15% (\`6.000.000 PTA\`) en 2 tramos iguales de \`3.000.000 PTA\` (uno antes del 13/11 y otro después) firmados por \`E.B.\` → \`GIB-7742\`.
11. **4.2 La Consola de Relés (\`100011-IV\`):**
    - Hoja 4C: línea útil = \`FASE IV (12 V)\`.
    - Hoja 4B: 3 activos, \`R1 ≠ R2\`, \`R3 = R4\`, suma = \`12\`. Solución única entre las 64 combinaciones: \`${relayValidStates.join(', ')}\` (\`R1=ON, R5=ON, R6=ON\`, \`1+5+6=12\`) + \`FASE IV\` → \`100011-IV\`.

### META-PUZLE FINAL
12. **El Meridiano Borrado (\`ESTAVIVO-5792\`):**
    - **Sello de Plancha IV (Hoja 4D, pág. 27):** \`□ PLANCHA IV · MERIDIANO 16°W · COD. ZJ-9\`.
    - Orden geométrico Hoja 4E (\`${META_ORDER_SHAPES.join(' → ')}\`): \`CW-5\`, \`XE-7\`, \`ZJ-9\`, \`ZQ-2\`.
    - Suma de dígitos de control: \`5 + 7 + 9 + 2 = 23\` (Sector \`23\` = \`W\` en Anillo Exterior).
    - Con \`▲ ÍNDICE\` en \`W\`, \`CWXEZJZQ\` (Interior → Exterior) descifra a \`${e12Decoded}\`.
    - Añadiendo los 4 dígitos en ese orden (\`5792\`): **\`ESTAVIVO-5792\`**.
`;
}

// ============================================================================
// EJECUCIÓN PRINCIPAL DE COMPILACIÓN Y RENDER PDF
// ============================================================================

export async function runBuild() {
  await fs.mkdir(path.join(ROOT, 'tmp', 'qa'), { recursive: true });
  await fs.mkdir(path.join(ROOT, 'imprimir'), { recursive: true });
  await fs.mkdir(path.join(ROOT, 'docs'), { recursive: true });

  const printHtml = buildPrintHtmlDocument();
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

    // Comprobar overflow DOM de cada una de las 28 páginas antes de compilar PDF
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

    // Capturas PNG de páginas clave para inspección visual QA
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
