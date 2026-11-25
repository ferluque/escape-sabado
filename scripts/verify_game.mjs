import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { chromium } from 'playwright-core';
import { GAME_DATA } from '../docs/game_data.js';
import {
  normalizeAnswer as webNormalize,
  sha256Hex as webSha256,
} from '../docs/app.js';
import {
  ASTROLABE_INNER,
  ASTROLABE_OUTER,
  BANK_ACCOUNTS,
  BUOY_ROWS,
  CARDANO_SPEC,
  CONTRALUZ_SPEC,
  FOLD_SPEC,
  META_ORDER_SHAPES,
  MORSE_TABLE,
  NAUTICAL_CHART_SPEC,
  PUZZLES,
  SEVEN_SEG_MAP,
  astrolabeDecode,
  decodeMorse,
  evaluateRelayRules,
  normalizeAnswer,
  sha256Hex,
} from './game_spec.mjs';
import { CHROME_CANDIDATES } from './build_kit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function decodeB64Utf8(b64) {
  return Buffer.from(String(b64), 'base64').toString('utf8');
}

async function findBrowserPath() {
  for (const p of CHROME_CANDIDATES) {
    try {
      await fs.access(p);
      return p;
    } catch {
      // ignore
    }
  }
  throw new Error('Chrome/Edge no encontrado.');
}

function startStaticDocsServer(docsDir) {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
  };
  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url, 'http://127.0.0.1');
      let rel = decodeURIComponent(reqUrl.pathname);
      if (rel === '/') rel = '/index.html';
      const target = path.resolve(docsDir, `.${rel}`);
      if (!target.startsWith(path.resolve(docsDir))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const data = await fs.readFile(target);
      const ext = path.extname(target);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

// ============================================================================
// BLOQUE 1: LÓGICA Y CRIPTOGRAFÍA DESDE DATOS REALES DEL PDF Y LA WEB
// ============================================================================

async function verifyLogicAndCryptography(kitHtml) {
  console.log('1/4 Auditando lógica y criptografía...');

  // 1.1 E1: Credencial desde Hoja 1A y Hoja 1B en el HTML real
  assert.ok(kitHtml.includes('<div class="stamp-mini-code">PRG</div>'), 'Hoja 1A debe mostrar sigla PRG');
  assert.ok(kitHtml.includes('<td><code>318</code></td>\n          <td>Torre de Petřín · Cúpula Norte</td>\n          <td>■ ACTIVO en enlace nocturno</td>'), 'Hoja 1A debe marcar Serie 318 activa');
  assert.ok(kitHtml.includes('<td><code>T49</code></td>\n          <td>22:00 – 06:00</td>\n          <td>Pavel Horák</td>'), 'Hoja 1B debe marcar turno T49');
  assert.equal(normalizeAnswer('PRG-318-T49'), normalizeAnswer(PUZZLES[0].answer));

  // 1.2 E3: Cruce de Hoja 1E (284°) con EXP-89-407 decodificado de game_data.js
  assert.ok(kitHtml.includes('<strong>284°</strong>'), 'Hoja 1E debe fijar azimut 284°');
  const docExp407 = GAME_DATA.archiveDocs.find((d) => d.queryHash === sha256Hex('exp89407'));
  assert.ok(docExp407, 'EXP-89-407 debe existir en GAME_DATA');
  const rows407 = JSON.parse(decodeB64Utf8(docExp407.rowsB64));
  const anomalies = rows407.filter((r) => {
    const az = parseInt(r[2], 10);
    return r[1] === 'MANUAL-OVERRIDE' && Math.abs(az - 284) > 10;
  });
  assert.equal(anomalies.length, 1, 'Debe haber exactamente 1 instante MANUAL-OVERRIDE con desvío >10°');
  const devDeg = Math.abs(parseInt(anomalies[0][2], 10) - 284);
  const hhmm = anomalies[0][0].replace(':', '');
  assert.equal(`${devDeg}-${hhmm}`, '14-0215');

  // 1.3 E5: Baliza única en Hoja 2C + Morse decodificado desde game_data.js
  const matchingBuoys = BUOY_ROWS.filter(
    (b) =>
      b.sector === 'Praga (Petřín)' &&
      b.freq.startsWith('4') &&
      b.mod === 'CW Morse' &&
      b.status.includes('Activa')
  );
  assert.equal(matchingBuoys.length, 1, 'Debe existir exactamente una baliza válida');
  assert.equal(matchingBuoys[0].freq, `${GAME_DATA.radio.targetFreqKHz.toFixed(1)} kHz`);
  const morseFromWeb = decodeB64Utf8(GAME_DATA.radio.morseB64);
  assert.equal(decodeMorse(morseFromWeb), 'TRAMPA');
  for (const ch of 'TRAMPA') {
    assert.ok(kitHtml.includes(`<span class="morse-ch">${ch}</span>`), `Tabla Morse debe incluir ${ch}`);
  }

  // 1.4 E6: Disco del Orloj con criptograma de DESPACHO-042 + primera letra de E5 ('T')
  const doc042 = GAME_DATA.archiveDocs.find((d) => d.queryHash === sha256Hex('despacho042'));
  assert.ok(doc042, 'DESPACHO-042 debe existir en GAME_DATA');
  const body042 = decodeB64Utf8(doc042.bodyB64);
  const matchCipher = body042.match(/CRYPTOGRAMA RECUPERADO:\s*([A-Z]+)/);
  assert.ok(matchCipher, 'DESPACHO-042 debe contener criptograma');
  assert.equal(astrolabeDecode(matchCipher[1], 'TRAMPA'[0]), 'DEMINKA');

  // 1.5 E7: Auditoría EXP-LLAVES-89 confirma LLAVE B-2 y cruce en Hoja 3A/3B
  const docKeys = GAME_DATA.archiveDocs.find((d) => d.queryHash === sha256Hex('expllaves89'));
  const rowsKeys = JSON.parse(decodeB64Utf8(docKeys.rowsB64));
  const cupolaUses = rowsKeys.filter((r) => r[2].includes('Sala Óptica'));
  assert.equal(cupolaUses.length, 2);
  assert.ok(cupolaUses.every((r) => r[1] === 'LLAVE B-2'));
  assert.ok(kitHtml.includes('<strong>Pavel Horák</strong>'), 'Recibo #19 debe señalar a Pavel Horák');

  // 1.6 E8: Cifrado de libro parseado directamente desde los <div class="article-row"> del HTML impreso
  const articleRegex = /<span class="art-num">Art\.\s*(\d+)\.<\/span>\s*<span class="art-body">([\s\S]*?)<\/span><\/div>/g;
  const parsedArticles = new Map();
  let m;
  while ((m = articleRegex.exec(kitHtml)) !== null) {
    const artNum = Number(m[1]);
    const cleanText = m[2].replace(/<sup[^>]*>\[[^\]]+\]<\/sup>/g, '').replace(/<[^>]+>/g, '').trim();
    parsedArticles.set(artNum, cleanText.split(/\s+/));
  }
  assert.equal(parsedArticles.size, 8, 'Hoja 3C debe contener exactamente 8 artículos');

  const docBitacora = GAME_DATA.archiveDocs.find((d) => d.queryHash === sha256Hex('bitacoramn'));
  assert.ok(docBitacora, 'BITACORA-MN debe existir en GAME_DATA');
  const bodyBitacora = decodeB64Utf8(docBitacora.bodyB64);
  const coordMatches = [...bodyBitacora.matchAll(/(\d+)·(\d+)/g)].map((x) => [Number(x[1]), Number(x[2])]);
  assert.equal(coordMatches.length, 8, 'BITACORA-MN debe contener 8 coordenadas');
  const bookWord = coordMatches
    .map(([a, w]) => {
      const word = parsedArticles.get(a)?.[w - 1];
      assert.ok(word, `Palabra (${a}, ${w}) debe existir en Hoja 3C`);
      return word[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    })
    .join('');
  assert.equal(bookWord, 'CISTERNA');

  // 1.7 E9: Triangulación geométrica de Mapa Táctico en GAME_DATA
  const { faro, boya, originX, originY, cellSize, cols, rows } = GAME_DATA.nautical;
  const fRad = (210 * Math.PI) / 180;
  const bRad = (285 * Math.PI) / 180;
  const d1 = { x: Math.sin(fRad), y: -Math.cos(fRad) };
  const d2 = { x: Math.sin(bRad), y: -Math.cos(bRad) };
  const det = d1.x * d2.y - d1.y * d2.x;
  const t1 = ((boya.x - faro.x) * d2.y - (boya.y - faro.y) * d2.x) / det;
  const ix = faro.x + t1 * d1.x;
  const iy = faro.y + t1 * d1.y;
  const cIdx = Math.floor((ix - originX) / cellSize);
  const rIdx = Math.floor((iy - originY) / cellSize);
  assert.equal(`${cols[cIdx]}${rows[rIdx]}`, 'C4');
  assert.ok(Math.hypot(ix - NAUTICAL_CHART_SPEC.targetCenter.x, iy - NAUTICAL_CHART_SPEC.targetCenter.y) < 0.05);

  // 1.8 E10: Marea Roja + cuentas bancarias
  const docCons = GAME_DATA.archiveDocs.find((d) => d.queryHash === sha256Hex('expmarea89'));
  assert.ok(docCons, 'EXP-MAREA-89 debe existir en GAME_DATA');
  const bodyCons = decodeB64Utf8(docCons.bodyB64);
  assert.ok(bodyCons.includes('40.000.000 CHF') && bodyCons.includes('E.B.'));
  const validBanks = BANK_ACCOUNTS.filter(
    (b) =>
      b.firma === 'E.B.' &&
      b.tramo1.startsWith('3.000.000 CHF') &&
      b.tramo2.startsWith('3.000.000 CHF') &&
      Number(b.tramo1.match(/\((\d{2})\/11\)/)[1]) < 17 &&
      Number(b.tramo2.match(/\((\d{2})\/11\)/)[1]) > 17
  );
  assert.equal(validBanks.length, 1);
  assert.equal(validBanks[0].id, 'VIE-7742');

  // 1.9 E11: Consola de Relés única entre las 64 combinaciones
  const validRelays = [];
  for (let mask = 0; mask < 64; mask++) {
    const bits = [0, 1, 2, 3, 4, 5].map((i) => (mask >> i) & 1);
    if (evaluateRelayRules(bits).valid) validRelays.push(bits.join(''));
  }
  assert.deepEqual(validRelays, ['100011']);

  // 1.10 E12: Sellos de plancha extraídos desde las 4 páginas de sobres del HTML
  const sealRegex = /data-seal-id="([^"]+)" data-seal-code="([^"]+)" data-seal-shape="([^"]+)"/g;
  const htmlSeals = [];
  while ((m = sealRegex.exec(kitHtml)) !== null) {
    htmlSeals.push({ id: m[1], code: m[2], shape: m[3] });
  }
  assert.equal(htmlSeals.length, 4, 'Debe haber exactamente 4 Sellos de Plancha en el PDF');
  const orderedSeals = META_ORDER_SHAPES.map((shape) => {
    const found = htmlSeals.find((s) => s.shape === shape);
    assert.ok(found, `Sello con forma ${shape} debe existir`);
    return found;
  });
  const digitSum = orderedSeals.reduce((acc, s) => acc + Number(s.code.split('-')[1]), 0);
  assert.equal(digitSum, 6);
  const sectorLetter = ASTROLABE_OUTER[digitSum - 1];
  assert.equal(sectorLetter, 'F');
  const cipher8 = orderedSeals.map((s) => s.code.split('-')[0]).join('');
  const digits4 = orderedSeals.map((s) => s.code.split('-')[1]).join('');
  assert.equal(`${astrolabeDecode(cipher8, sectorLetter)}-${digits4}`, 'LUZVERDE-0501');
}

// ============================================================================
// BLOQUE 2: GEOMETRÍA SVG Y ALINEACIÓN FÍSICA EN CHROME
// ============================================================================

async function verifyGeometryAndSvg(pagePrint) {
  console.log('2/4 Auditando geometría SVG de Cardano, Fold-In, Disco Orloj y Contraluz...');

  const geo = await pagePrint.evaluate(() => {
    const baseSvg = document.getElementById('cardano-base-svg');
    const maskSvg = document.getElementById('cardano-mask-svg');
    const baseRegs = Array.from(baseSvg.querySelectorAll('.reg-mark')).map((g) => ({
      id: g.getAttribute('data-reg-id'),
      x: Number(g.getAttribute('data-x')),
      y: Number(g.getAttribute('data-y')),
    }));
    const maskRegs = Array.from(maskSvg.querySelectorAll('.reg-mark')).map((g) => ({
      id: g.getAttribute('data-reg-id'),
      x: Number(g.getAttribute('data-x')),
      y: Number(g.getAttribute('data-y')),
    }));
    const baseCells = Array.from(baseSvg.querySelectorAll('text[data-char]')).map((t) => ({
      r: Number(t.getAttribute('data-cell-r')),
      c: Number(t.getAttribute('data-cell-c')),
      ch: t.getAttribute('data-char'),
      x: Number(t.getAttribute('x')),
      y: Number(t.getAttribute('y')),
    }));
    const cutouts = Array.from(maskSvg.querySelectorAll('rect[data-cutout="true"]')).map((r) => ({
      x: Number(r.getAttribute('x')),
      y: Number(r.getAttribute('y')),
      w: Number(r.getAttribute('width')),
      h: Number(r.getAttribute('height')),
    }));

    const foldSvg = document.getElementById('fold-in-svg');
    const foldAX = Number(foldSvg.querySelector('[data-fold-line="A"]').getAttribute('x1'));
    const foldBX = Number(foldSvg.querySelector('[data-fold-line="B"]').getAttribute('x1'));
    const foldPolys = Array.from(foldSvg.querySelectorAll('polyline[data-fold]')).map((p) => ({
      side: p.getAttribute('data-fold'),
      char: p.getAttribute('data-char'),
      points: p
        .getAttribute('points')
        .trim()
        .split(/\s+/)
        .map((pt) => pt.split(',').map(Number)),
    }));

    const outerSvg = document.getElementById('astrolabe-outer-svg');
    const innerSvg = document.getElementById('astrolabe-inner-svg');
    const outerChars = Array.from(outerSvg.querySelectorAll('text[data-outer-char]')).map((t) => t.getAttribute('data-outer-char')).join('');
    const innerChars = Array.from(innerSvg.querySelectorAll('text[data-inner-char]')).map((t) => t.getAttribute('data-inner-char')).join('');
    const cutRadius = Number(innerSvg.querySelector('[data-cut-circle="true"]').getAttribute('data-radius'));

    const clA = document.getElementById('contraluz-a-svg');
    const clB = document.getElementById('contraluz-b-svg');
    const sheetA = clA.closest('.sheet').getBoundingClientRect();
    const sheetB = clB.closest('.sheet').getBoundingClientRect();
    const rectA = clA.getBoundingClientRect();
    const rectB = clB.getBoundingClientRect();

    const extractSegs = (svg) =>
      Array.from(svg.querySelectorAll('line[data-digit-idx]')).map((l) => ({
        row: l.getAttribute('data-row'),
        idx: Number(l.getAttribute('data-digit-idx')),
        target: l.getAttribute('data-target'),
        seg: l.getAttribute('data-seg'),
      }));

    return {
      cardano: {
        baseVB: baseSvg.getAttribute('viewBox'),
        maskVB: maskSvg.getAttribute('viewBox'),
        baseRegs,
        maskRegs,
        baseCells,
        cutouts,
      },
      fold: { foldAX, foldBX, foldPolys },
      astrolabe: { outerChars, innerChars, cutRadius },
      contraluz: {
        vbA: clA.getAttribute('viewBox'),
        vbB: clB.getAttribute('viewBox'),
        relA: { x: rectA.left - sheetA.left, y: rectA.top - sheetA.top, w: rectA.width, h: rectA.height },
        relB: { x: rectB.left - sheetB.left, y: rectB.top - sheetB.top, w: rectB.width, h: rectB.height },
        segsA: extractSegs(clA),
        segsB: extractSegs(clB),
      },
    };
  });

  // Validar Cardano
  assert.equal(geo.cardano.baseVB, geo.cardano.maskVB);
  assert.deepEqual(geo.cardano.baseRegs, geo.cardano.maskRegs);
  assert.equal(geo.cardano.cutouts.length, 8);
  const revealed = geo.cardano.cutouts
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((cut) => {
      const inside = geo.cardano.baseCells.filter(
        (c) => c.x > cut.x && c.x < cut.x + cut.w && c.y > cut.y && c.y < cut.y + cut.h
      );
      assert.equal(inside.length, 1, 'Cada ventana Cardano debe encuadrar exactamente 1 carácter');
      const cx = cut.x + cut.w / 2;
      const cy = cut.y + cut.h / 2;
      assert.ok(Math.hypot(inside[0].x - cx, inside[0].y - cy) < 0.01, 'Ventana Cardano debe estar centrada <0.01mm');
      return inside[0].ch;
    })
    .join('');
  assert.equal(revealed, 'EXP89407');

  // Validar Fold-In (ARCO 42)
  const shift = geo.fold.foldBX - geo.fold.foldAX;
  assert.equal(shift, 64);
  for (const g of FOLD_SPEC.glyphs) {
    const leftPts = geo.fold.foldPolys
      .filter((p) => p.char === g.char && p.side === 'left')
      .flatMap((p) => p.points)
      .filter(([x]) => Math.abs(x - geo.fold.foldAX) < 0.01);
    const rightPts = geo.fold.foldPolys
      .filter((p) => p.char === g.char && p.side === 'right')
      .flatMap((p) => p.points)
      .map(([x, y]) => [x - shift, y])
      .filter(([x]) => Math.abs(x - geo.fold.foldAX) < 0.01);

    for (const [, ly] of leftPts) {
      assert.ok(
        rightPts.some(([, ry]) => Math.abs(ly - ry) < 0.01),
        `Glifo ${g.char} en y=${ly} debe conectar exactamente en el pliegue A↔B`
      );
    }
  }

  // Validar Disco del Orloj
  assert.equal(geo.astrolabe.outerChars, ASTROLABE_OUTER);
  assert.equal(geo.astrolabe.innerChars, ASTROLABE_INNER);
  assert.equal(new Set(geo.astrolabe.innerChars).size, 26);
  assert.equal(geo.astrolabe.cutRadius, 62);

  // Validar Contraluz
  assert.equal(geo.contraluz.vbA, geo.contraluz.vbB);
  assert.ok(Math.abs(geo.contraluz.relA.x - geo.contraluz.relB.x) < 0.5, 'Contraluz X idéntico en página A4');
  assert.ok(Math.abs(geo.contraluz.relA.y - geo.contraluz.relB.y) < 0.5, 'Contraluz Y idéntico en página A4');
  assert.ok(Math.abs(geo.contraluz.relA.w - geo.contraluz.relB.w) < 0.5, 'Contraluz ancho idéntico');
  assert.ok(Math.abs(geo.contraluz.relA.h - geo.contraluz.relB.h) < 0.5, 'Contraluz alto idéntico');

  for (const row of CONTRALUZ_SPEC.rows) {
    row.digits.forEach((d, dIdx) => {
      const a = geo.contraluz.segsA.filter((s) => s.row === row.id && s.idx === dIdx).map((s) => s.seg);
      const b = geo.contraluz.segsB.filter((s) => s.row === row.id && s.idx === dIdx).map((s) => s.seg);
      const overlap = a.filter((s) => b.includes(s));
      assert.equal(overlap.length, 0, 'Capas A y B no deben duplicar segmentos');
      const union = [...new Set([...a, ...b])].sort().join('');
      const expected = [...SEVEN_SEG_MAP[d.target]].sort().join('');
      assert.equal(union, expected, `Unión A∪B de dígito ${row.id}[${dIdx}] debe formar ${d.target}`);
      assert.notEqual(a.sort().join(''), expected, 'Capa A sola no puede revelar dígito completo');
      assert.notEqual(b.sort().join(''), expected, 'Capa B sola no puede revelar dígito completo');
    });
  }
}

// ============================================================================
// BLOQUE 3: INTEGRIDAD DE HASHES, CERO SPOILERS EN /DOCS Y B/N-SAFE
// ============================================================================

async function verifyHashesZeroSpoilersAndBW() {
  console.log('3/4 Auditando hashes SHA-256, cero spoilers en /docs y compatibilidad B/N...');

  const variantInputs = {
    e1: ['PRG-318-T49', 'prg 318 t49', ' PRG318T49 '],
    e2: ['EXP-89-407', 'exp 89 407'],
    e3: ['14-0215', '14 0215'],
    e4: ['ARCO-42', 'arco 42'],
    e5: ['TRAMPA', 'trámpa'],
    e6: ['DEMINKA', 'deminka'],
    e7: ['Pavel Horák', 'pavel horak', 'PAVELHORAK'],
    e8: ['CISTERNA', 'cisterna'],
    e9: ['210-285-C4', '210 285 c4'],
    e10: ['VIE-7742', 'vie 7742'],
    e11: ['100011-IV', '100011 iv'],
    e12: ['LUZVERDE-0501', 'luzverde 0501'],
  };

  for (const p of PUZZLES) {
    const webP = GAME_DATA.puzzles.find((x) => x.id === p.id);
    assert.ok(webP, `Puzle ${p.id} debe existir en GAME_DATA`);
    assert.equal(webP.hints.length, 3, `Puzle ${p.id} debe tener 3 niveles de pistas`);
    assert.ok(webP.hints[2].b64 && !webP.hints[2].text, `Nivel 3 de ${p.id} debe estar ofuscado en Base64`);
    for (const v of variantInputs[p.id]) {
      const hNode = sha256Hex(normalizeAnswer(v));
      const hWeb = webSha256(webNormalize(v));
      assert.equal(hWeb, webP.answerHash, `Hash web debe coincidir para variante "${v}"`);
      assert.equal(hNode, webP.answerHash, `Hash Node debe coincidir para variante "${v}"`);
    }
  }

  const docsFiles = ['index.html', 'styles.css', 'app.js', 'game_data.js'];
  const forbiddenLiterals = [
    'PRG-318-T49',
    'prg318t49',
    'EXP-89-407',
    '14-0215',
    'ARCO-42',
    'TRAMPA',
    'DEMINKA',
    'Pavel Horák',
    'pavelhorak',
    'CISTERNA',
    '210-285-C4',
    'VIE-7742',
    '100011-IV',
    'LUZVERDE-0501',
    'luzverde0501',
    'EFTMUQB',
    'DESPACHO-042',
    'EXP-LLAVES-89',
    'BITACORA-MN',
    'EXP-MAREA-89',
  ];
  for (const fname of docsFiles) {
    const txt = await fs.readFile(path.join(ROOT, 'docs', fname), 'utf8');
    for (const lit of forbiddenLiterals) {
      assert.ok(
        !txt.includes(lit),
        `¡Fallo de seguridad anti-spoilers! Se encontró "${lit}" en texto plano dentro de docs/${fname}`
      );
    }
  }

  const gitignore = await fs.readFile(path.join(ROOT, '.gitignore'), 'utf8');
  assert.ok(gitignore.includes('SOLUCIONES_NO_ABRIR.md'), '.gitignore debe incluir SOLUCIONES_NO_ABRIR.md');
  await fs.access(path.join(ROOT, 'docs', '.nojekyll'));
  await fs.access(path.join(ROOT, 'docs', 'assets', 'agencia-x-logo.png'));
  await fs.access(path.join(ROOT, 'docs', 'assets', 'agencia-x-icon.png'));
  await fs.access(path.join(ROOT, 'docs', 'assets', 'fonts', 'JetBrainsMono-Regular.woff2'));
  await fs.access(path.join(ROOT, 'docs', 'assets', 'fonts', 'JetBrainsMono-Bold.woff2'));

  const guide = await fs.readFile(path.join(ROOT, 'GUIA_PREPARACION_SIN_SPOILERS.md'), 'utf8');
  for (const lit of forbiddenLiterals) {
    assert.ok(!guide.includes(lit), `Guía sin spoilers no puede contener "${lit}"`);
  }
  assert.ok(guide.includes('Páginas 1 a 6'));
  assert.ok(guide.includes('Páginas 7 a 14'));
  assert.ok(guide.includes('Páginas 15 a 22'));
  assert.ok(guide.includes('Páginas 23 a 28'));

  assert.ok(!JSON.stringify(PUZZLES).includes('el botón rojo'), 'No depender solo de color');
}

// ============================================================================
// BLOQUE 4: VERIFICACIÓN PDF (pdf-lib) + FLUJO COMPLETO E2E EN CHROME
// ============================================================================

async function verifyPdfAndE2E(browser) {
  console.log('4/4 Auditando PDF con pdf-lib y ejecutando recorrido completo E2E en Chrome...');

  const pdfPath = path.join(ROOT, 'imprimir', 'KIT_ESCAPE_ROOM.pdf');
  const pdfBytes = await fs.readFile(pdfPath);
  assert.ok(pdfBytes.length > 100_000, 'El PDF debe superar 100 KB');
  const pdfDoc = await PDFDocument.load(pdfBytes);
  assert.equal(pdfDoc.getPageCount(), 28, 'El PDF debe tener exactamente 28 páginas');
  for (let i = 0; i < 28; i++) {
    const sz = pdfDoc.getPage(i).getSize();
    assert.ok(Math.abs(sz.width - 595.28) < 4, `Página ${i + 1} ancho A4 esperado (~595pt), got ${sz.width}`);
    assert.ok(Math.abs(sz.height - 841.89) < 4, `Página ${i + 1} alto A4 esperado (~842pt), got ${sz.height}`);
  }

  const { server, baseUrl } = await startStaticDocsServer(path.join(ROOT, 'docs'));
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await context.newPage();

    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    page.on('requestfailed', (req) => errors.push(`requestfailed: ${req.url()}`));

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(ROOT, 'tmp', 'qa', 'web_intro.png') });

    // Activar protocolo
    await page.click('#btn-start');
    await page.waitForSelector('#workspace-screen:not([hidden])');
    assert.ok((await page.textContent('#envelope-tag')).includes('SOBRE 1'));

    // Pausar y reanudar reloj
    await page.click('#btn-pause');
    assert.equal(await page.textContent('#timer-mode-label'), 'Pausado');
    await page.click('#btn-pause');
    assert.equal(await page.textContent('#timer-mode-label'), 'Restante');

    // Rechazo de clave falsa
    const e1Card = page.locator('.puzzle-card[data-puzzle-id="e1"]');
    await e1Card.locator('input').fill('CLAVE-FALSA-000');
    await e1Card.locator('button[type="submit"]').click();
    assert.ok((await e1Card.locator('.feedback-line.err').textContent()).includes('Clave no válida'));
    assert.equal(await page.locator('.puzzle-card[data-puzzle-id="e1"].solved').count(), 0);

    const solveInCard = async (id, answer) => {
      const card = page.locator(`.puzzle-card[data-puzzle-id="${id}"]`);
      await card.locator('input').fill(answer);
      await card.locator('button[type="submit"]').click();
      await page.waitForSelector(`.puzzle-card[data-puzzle-id="${id}"].solved`);
    };

    // Acto I
    await solveInCard('e1', 'PRG-318-T49');
    await page.click('#tab-archive');
    await page.fill('#archive-input', 'EXP-89-407');
    await page.click('#archive-form button[type="submit"]');
    await page.waitForSelector('#archive-viewer:not([hidden])');
    assert.ok((await page.textContent('#archive-viewer')).includes('MANUAL-OVERRIDE'));
    await page.click('[data-tab="cases"]');

    await solveInCard('e2', 'EXP-89-407');
    await solveInCard('e3', '14-0215');
    assert.ok((await page.textContent('#envelope-tag')).includes('SOBRE 2'));

    // Acto II: Receptor Web Audio en 418.5 kHz
    await page.click('#tab-radio');
    await page.fill('#radio-slider', '418.5');
    await page.dispatchEvent('#radio-slider', 'input');
    assert.ok((await page.textContent('#radio-carrier-badge')).includes('PORTADORA CW ENGANCHADA'));
    await page.click('#radio-play-btn');
    await page.waitForTimeout(150);
    await page.click('#radio-stop-btn');
    await page.click('[data-tab="cases"]');

    await solveInCard('e4', 'ARCO-42');
    const e6LockedBefore = await page.locator('.puzzle-card[data-puzzle-id="e6"].locked').count();
    assert.equal(e6LockedBefore, 1, 'e6 debe permanecer bloqueado hasta resolver tanto Hilo A como Hilo B');
    await solveInCard('e5', 'TRAMPA');
    await solveInCard('e6', 'DEMINKA');
    assert.ok((await page.textContent('#envelope-tag')).includes('SOBRE 3'));

    // Acto III: Hilo A + Hilo B (Mapa Táctico Praga)
    await solveInCard('e7', 'Pavel Horák');
    await solveInCard('e8', 'CISTERNA');

    await page.click('#tab-nautical');
    await page.fill('#faro-bearing-num', '210');
    await page.dispatchEvent('#faro-bearing-num', 'input');
    await page.fill('#boya-bearing-num', '285');
    await page.dispatchEvent('#boya-bearing-num', 'input');
    await page.click('#nautical-svg .nautical-cell[data-cell="C4"]');
    await page.screenshot({ path: path.join(ROOT, 'tmp', 'qa', 'web_nautical.png') });
    await page.click('#btn-submit-nautical');
    await page.click('[data-tab="cases"]');
    await page.waitForSelector('.puzzle-card[data-puzzle-id="e9"].solved');
    assert.ok((await page.textContent('#envelope-tag')).includes('SOBRE 4'));

    // Persistencia localStorage
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.textContent('#progress-counter'), '9 / 12');

    // Acto IV
    await solveInCard('e10', 'VIE-7742');
    await page.click('#tab-relays');
    await page.click('.relay-switch[data-relay-idx="0"]'); // R1 ON
    await page.click('.relay-switch[data-relay-idx="4"]'); // R5 ON
    await page.click('.relay-switch[data-relay-idx="5"]'); // R6 ON
    await page.click('.phase-btn[data-phase="IV"]');
    assert.equal(await page.textContent('#relay-index-sum'), '12 V');
    await page.screenshot({ path: path.join(ROOT, 'tmp', 'qa', 'web_relays.png') });
    await page.click('#btn-submit-relays');
    await page.click('[data-tab="cases"]');
    await page.waitForSelector('.puzzle-card[data-puzzle-id="e11"].solved');

    // 3 niveles de pistas + Meta-Puzle Final
    const e12Card = page.locator('.puzzle-card[data-puzzle-id="e12"]');
    const hintBtns = e12Card.locator('.hints-buttons button');
    await hintBtns.nth(0).click();
    await hintBtns.nth(1).click();
    await hintBtns.nth(2).click();
    await page.click('#confirm-accept');
    assert.equal(await e12Card.locator('.hint-box').count(), 3);

    await e12Card.locator('input').fill('LUZVERDE-0501');
    await e12Card.locator('button[type="submit"]').click();
    await page.waitForSelector('#epilogue-screen:not([hidden])');
    assert.equal(await page.textContent('#final-solved'), '12 / 12');
    assert.equal(await page.textContent('#final-hints'), '3');
    await page.screenshot({ path: path.join(ROOT, 'tmp', 'qa', 'web_epilogue.png') });

    // Vista móvil 390x844 sin overflow horizontal
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#btn-reset-end');
    await page.click('#confirm-accept');
    await page.waitForSelector('#intro-screen:not([hidden])');
    await page.click('#btn-start');
    const mobileOverflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    assert.ok(
      mobileOverflow.scrollW <= mobileOverflow.clientW + 2,
      `Overflow horizontal en móvil: scrollWidth=${mobileOverflow.scrollW}, clientWidth=${mobileOverflow.clientW}`
    );
    await page.screenshot({ path: path.join(ROOT, 'tmp', 'qa', 'web_mobile.png') });

    assert.deepEqual(errors, [], `Errores de consola/red detectados: ${errors.join(' | ')}`);
  } finally {
    server.close();
  }
}

async function main() {
  const printHtmlPath = path.join(ROOT, 'tmp', 'kit_print.html');
  const kitHtml = await fs.readFile(printHtmlPath, 'utf8');

  await verifyLogicAndCryptography(kitHtml);

  const executablePath = await findBrowserPath();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  try {
    const contextPrint = await browser.newContext({ viewport: { width: 900, height: 1280 }, deviceScaleFactor: 2 });
    const pagePrint = await contextPrint.newPage();
    await pagePrint.goto(new URL(`file:///${printHtmlPath.replace(/\\/g, '/')}`).href, { waitUntil: 'networkidle' });
    await verifyGeometryAndSvg(pagePrint);
    await contextPrint.close();

    await verifyHashesZeroSpoilersAndBW();
    await verifyPdfAndE2E(browser);

    console.log('VERIFICACION_COMPLETA_100%_VERDE');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('FALLO EN VERIFICACION:', err);
  process.exit(1);
});
