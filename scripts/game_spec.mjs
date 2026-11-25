import crypto from 'node:crypto';

export const GAME_TITLE = 'El Meridiano Borrado';
export const GAME_SUBTITLE = 'Expediente Cabo Valdeira · Archivo Hidrográfico 1989';
export const PLAYERS_LABEL = 'Fer y Lucía';
export const TOTAL_MINUTES = 120;

export function normalizeAnswer(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function sha256Hex(str) {
  return crypto.createHash('sha256').update(String(str), 'utf8').digest('hex');
}

export function encodeB64(str) {
  return Buffer.from(String(str), 'utf8').toString('base64');
}

// ============================================================================
// CONSTANTES CRIPTOGRÁFICAS Y GEOMÉTRICAS (FUENTE ÚNICA DE VERDAD)
// ============================================================================

export const ASTROLABE_OUTER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const ASTROLABE_KEYWORD = 'VALDEIRA';

export function buildKeyAlphabet(keyword) {
  const seen = new Set();
  let out = '';
  for (const ch of keyword.toUpperCase()) {
    if (/[A-Z]/.test(ch) && !seen.has(ch)) {
      seen.add(ch);
      out += ch;
    }
  }
  for (const ch of ASTROLABE_OUTER) {
    if (!seen.has(ch)) {
      seen.add(ch);
      out += ch;
    }
  }
  return out;
}

export const ASTROLABE_INNER = buildKeyAlphabet(ASTROLABE_KEYWORD); // VALDEIRBCFGHJKMNOPQSTUWXYZ

export function astrolabeDecode(ciphertext, indexOuterLetter) {
  const shift = ASTROLABE_OUTER.indexOf(indexOuterLetter.toUpperCase());
  if (shift < 0) throw new Error(`Invalid outer letter: ${indexOuterLetter}`);
  let plain = '';
  for (const ch of ciphertext.toUpperCase()) {
    const idx = ASTROLABE_INNER.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid inner letter: ${ch}`);
    plain += ASTROLABE_OUTER[(shift + idx) % 26];
  }
  return plain;
}

export function astrolabeEncode(plaintext, indexOuterLetter) {
  const shift = ASTROLABE_OUTER.indexOf(indexOuterLetter.toUpperCase());
  if (shift < 0) throw new Error(`Invalid outer letter: ${indexOuterLetter}`);
  let cipher = '';
  for (const ch of plaintext.toUpperCase()) {
    const k = ASTROLABE_OUTER.indexOf(ch);
    if (k < 0) throw new Error(`Invalid plain letter: ${ch}`);
    const idx = (k - shift + 26) % 26;
    cipher += ASTROLABE_INNER[idx];
  }
  return cipher;
}

export const MORSE_TABLE = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
};

export function encodeMorse(word) {
  return word
    .toUpperCase()
    .split('')
    .map((c) => {
      if (!MORSE_TABLE[c]) throw new Error(`Unsupported morse char: ${c}`);
      return MORSE_TABLE[c];
    })
    .join(' ');
}

export function decodeMorse(sequence) {
  const rev = Object.fromEntries(Object.entries(MORSE_TABLE).map(([k, v]) => [v, k]));
  return sequence
    .trim()
    .split(/\s+/)
    .map((token) => {
      if (!rev[token]) throw new Error(`Invalid morse token: ${token}`);
      return rev[token];
    })
    .join('');
}

// ============================================================================
// E2 — REJILLA DE CARDANO (12 cols x 9 rows)
// ============================================================================

export const CARDANO_SPEC = {
  widthMm: 168,
  heightMm: 140,
  originX: 12,
  originY: 16,
  cellSize: 12,
  cols: 12,
  rows: 9,
  holeSize: 10,
  regMarks: [
    { id: 'R1', shape: '▲', x: 6, y: 8 },
    { id: 'R2', shape: '◆', x: 162, y: 8 },
    { id: 'R3', shape: '■', x: 6, y: 132 },
    { id: 'R4', shape: '●', x: 162, y: 132 },
  ],
  windows: [
    { row: 0, col: 2, ch: 'E' },
    { row: 1, col: 9, ch: 'X' },
    { row: 2, col: 4, ch: 'P' },
    { row: 4, col: 1, ch: '8' },
    { row: 5, col: 7, ch: '9' },
    { row: 6, col: 10, ch: '4' },
    { row: 7, col: 3, ch: '0' },
    { row: 8, col: 8, ch: '7' },
  ],
  grid: [
    ['K', 'Q', 'E', 'M', '4', 'V', 'N', '2', 'B', 'R', '7', 'L'],
    ['3', 'T', 'H', '8', 'Z', '1', 'C', 'W', '6', 'X', 'D', '5'],
    ['F', '9', 'A', 'J', 'P', '0', 'S', 'U', 'G', '4', 'K', 'M'],
    ['6', 'L', 'Y', '2', 'N', 'Q', '3', 'B', 'H', '8', 'T', 'V'],
    ['W', '8', 'C', '5', 'D', 'R', '7', 'J', 'M', '1', 'Z', '9'],
    ['4', 'G', 'K', '0', 'S', 'F', '2', '9', 'A', 'U', '6', 'N'],
    ['P', '3', 'B', 'H', '5', 'L', 'T', '1', 'V', 'Q', '4', 'W'],
    ['7', 'Z', 'D', '0', 'M', '6', 'C', '8', 'R', '2', 'G', 'J'],
    ['1', 'S', 'U', 'K', '9', 'A', 'F', '5', '7', '3', 'N', 'B'],
  ],
};

// ============================================================================
// E4 — FOLD-IN (PLIEGUE OCULTO)
// ============================================================================

export const FOLD_SPEC = {
  widthMm: 176,
  heightMm: 190,
  foldAX: 56,
  foldBX: 120,
  glyphs: [
    {
      char: 'F',
      yOffset: 16,
      left: [
        [[-8, 0], [-8, 18]],
        [[-8, 0], [0, 0]],
        [[-8, 9], [0, 9]],
      ],
      right: [
        [[0, 0], [8, 0]],
        [[0, 9], [6, 9]],
      ],
    },
    {
      char: 'O',
      yOffset: 44,
      left: [
        [[0, 0], [-7, 0], [-9, 3], [-9, 15], [-7, 18], [0, 18]],
      ],
      right: [
        [[0, 0], [7, 0], [9, 3], [9, 15], [7, 18], [0, 18]],
      ],
    },
    {
      char: 'S',
      yOffset: 72,
      left: [
        [[0, 0], [-7, 0], [-9, 3], [-9, 7], [-7, 9], [0, 9]],
        [[-9, 15], [-7, 18], [0, 18]],
      ],
      right: [
        [[0, 0], [7, 0], [9, 3]],
        [[0, 9], [7, 9], [9, 11], [9, 15], [7, 18], [0, 18]],
      ],
    },
    {
      char: 'A',
      yOffset: 100,
      left: [
        [[-9, 18], [0, 0]],
        [[-4.5, 11], [0, 11]],
      ],
      right: [
        [[0, 0], [9, 18]],
        [[0, 11], [4.5, 11]],
      ],
    },
    {
      char: '4',
      yOffset: 128,
      left: [
        [[-2, 0], [-9, 12], [0, 12]],
      ],
      right: [
        [[0, 12], [9, 12]],
        [[4, 0], [4, 18]],
      ],
    },
    {
      char: '2',
      yOffset: 156,
      left: [
        [[0, 0], [-7, 0], [-9, 4]],
        [[0, 11], [-9, 18], [0, 18]],
      ],
      right: [
        [[0, 0], [7, 0], [9, 4], [9, 7], [0, 11]],
        [[0, 18], [9, 18]],
      ],
    },
  ],
};

// ============================================================================
// E9 — CONTRALUZ ÓPTICO + CARTA NÁUTICA INTERACTIVA
// ============================================================================

export const SEVEN_SEG_MAP = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'g', 'e', 'd'],
  '3': ['a', 'b', 'g', 'c', 'd'],
  '4': ['f', 'g', 'b', 'c'],
  '5': ['a', 'f', 'g', 'c', 'd'],
  '6': ['a', 'f', 'g', 'e', 'd', 'c'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
  F: ['a', 'f', 'g', 'e'],
  B: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
};

export const CONTRALUZ_SPEC = {
  widthMm: 160,
  heightMm: 160,
  regMarks: [
    { id: 'C1', shape: '▲', x: 10, y: 10 },
    { id: 'C2', shape: '◆', x: 150, y: 10 },
    { id: 'C3', shape: '■', x: 10, y: 150 },
    { id: 'C4', shape: '●', x: 150, y: 150 },
  ],
  rows: [
    {
      id: 'F',
      label: 'F',
      y: 34,
      digits: [
        { target: '2', x: 56, layerA: ['a', 'g'], layerB: ['b', 'e', 'd'] },
        { target: '1', x: 86, layerA: ['b'], layerB: ['c'] },
        { target: '0', x: 116, layerA: ['a', 'c', 'e'], layerB: ['b', 'd', 'f'] },
      ],
      labelSplit: { layerA: ['a', 'e'], layerB: ['f', 'g'] },
    },
    {
      id: 'B',
      label: 'B',
      y: 96,
      digits: [
        { target: '2', x: 56, layerA: ['b', 'd'], layerB: ['a', 'g', 'e'] },
        { target: '8', x: 86, layerA: ['a', 'c', 'f', 'g'], layerB: ['b', 'd', 'e'] },
        { target: '5', x: 116, layerA: ['a', 'g', 'd'], layerB: ['f', 'c'] },
      ],
      labelSplit: { layerA: ['f', 'b', 'd'], layerB: ['a', 'g', 'e', 'c'] },
    },
  ],
};

export const NAUTICAL_CHART_SPEC = {
  viewBoxWidth: 480,
  viewBoxHeight: 420,
  originX: 60,
  originY: 40,
  cellSize: 60,
  cols: ['A', 'B', 'C', 'D', 'E', 'F'],
  rows: ['1', '2', '3', '4', '5', '6'],
  faro: { name: 'Faro Norte', x: 300, y: 94.12, targetBearing: 210 },
  boya: { name: 'Boya Este', x: 383.87, y: 296.59, targetBearing: 285 },
  targetCell: 'C4',
  targetCenter: { x: 210, y: 250 },
};

// ============================================================================
// E8 — CIFRADO DE LIBRO (REGLAMENTO TÉCNICO 1979)
// ============================================================================

export const BOOK_CIPHER_ARTICLES = [
  {
    num: 1,
    text: 'Las planchas originales de cartografía costera permanecerán siempre guardadas dentro del archivo técnico bajo llave.',
  },
  {
    num: 2,
    text: 'Durante alertas marítimas severas la radiobaliza auxiliar repetirá automáticamente su señal cada cinco minutos exactos.',
  },
  {
    num: 3,
    text: 'Toda observación meteorológica nocturna comenzará puntualmente al sonar la campana principal del patio central.',
  },
  {
    num: 4,
    text: 'Todo expediente clasificado llevará fecha completa, sello húmedo y firma autógrafa del responsable de guardia.',
  },
  {
    num: 5,
    text: 'Los instrumentos ópticos de la torre deberán inspeccionarse antes de cualquier temporal anunciado desde tierra.',
  },
  {
    num: 6,
    text: 'Las copias duplicadas de mareas y corrientes nunca saldrán del recinto sin orden escrita previa.',
  },
  {
    num: 7,
    text: 'Ningún técnico podrá abandonar su puesto sin registrar el relevo firmado sobre el libro oficial.',
  },
  {
    num: 8,
    text: 'Cualquier variación superior a tres grados en el haz exige comunicar la incidencia al director.',
  },
];

export const BOOK_CIPHER_COORDS = [
  [3, 5],
  [5, 8],
  [7, 12],
  [1, 13],
  [8, 10],
  [2, 8],
  [6, 8],
  [4, 11],
];

export function solveBookCipher(articles, coords) {
  let out = '';
  const steps = [];
  for (const [artNum, wordPos] of coords) {
    const art = articles.find((a) => a.num === artNum);
    if (!art) throw new Error(`Missing article ${artNum}`);
    const words = art.text.trim().split(/\s+/);
    const word = words[wordPos - 1];
    if (!word) throw new Error(`Missing word ${wordPos} in article ${artNum}`);
    const cleanWord = word.replace(/[.,;:]/g, '');
    const letter = cleanWord[0]
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
    out += letter;
    steps.push({ artNum, wordPos, word: cleanWord, letter });
  }
  return { word: out, steps };
}

// ============================================================================
// E11 — CONSOLA DE RELÉS (VERIFICACIÓN ÚNICA)
// ============================================================================

export function evaluateRelayRules(bits) {
  // bits = [R1, R2, R3, R4, R5, R6] cada uno 0 o 1
  const activeCount = bits.reduce((a, b) => a + b, 0);
  const sumIndices = bits.reduce((acc, b, idx) => acc + (b ? idx + 1 : 0), 0);
  const rule1 = activeCount === 3;
  const rule2 = bits[0] !== bits[1];
  const rule3 = bits[2] === bits[3];
  const rule4 = sumIndices === 12;
  return { valid: rule1 && rule2 && rule3 && rule4, activeCount, sumIndices, rule1, rule2, rule3, rule4 };
}

// ============================================================================
// SELLOS DE PLANCHA Y META-PUZLE FINAL (E12)
// ============================================================================

export const PLATE_SEALS = [
  {
    id: 'I',
    envelope: 1,
    pageRef: 6,
    shape: '◎',
    shapeName: 'Doble círculo',
    meridian: '04°W',
    code: 'XE-7',
    letters: 'XE',
    digit: 7,
  },
  {
    id: 'II',
    envelope: 2,
    pageRef: 8,
    shape: '◇',
    shapeName: 'Rombo discontinuo',
    meridian: '08°W',
    code: 'ZQ-2',
    letters: 'ZQ',
    digit: 2,
  },
  {
    id: 'III',
    envelope: 3,
    pageRef: 21,
    shape: '△',
    shapeName: 'Triángulo punteado',
    meridian: '12°W',
    code: 'CW-5',
    letters: 'CW',
    digit: 5,
  },
  {
    id: 'IV',
    envelope: 4,
    pageRef: 27,
    shape: '□',
    shapeName: 'Cuadrado',
    meridian: '16°W',
    code: 'ZJ-9',
    letters: 'ZJ',
    digit: 9,
  },
];

export const META_ORDER_SHAPES = ['△', '◎', '□', '◇']; // III -> I -> IV -> II

// ============================================================================
// DATOS DE RADIOBALIZA (E5) Y TRANSFERENCIAS (E10)
// ============================================================================

export const BUOY_ROWS = [
  { code: 'Boya A-1', sector: 'Ría de Camariñas', freq: '382.0 kHz', mod: 'Voz AM', status: 'Activa (1985)', ref: 'BOYA-89-A' },
  { code: 'Boya B-7', sector: 'Cabo Valdeira', freq: '405.5 kHz', mod: 'FSK Datos', status: 'Activa (1987)', ref: 'BOYA-89-B' },
  { code: 'Boya C-2', sector: 'Cabo Valdeira', freq: '412.0 kHz', mod: 'CW Morse', status: 'Desmantelada (1986)', ref: 'BOYA-89-C' },
  { code: 'Boya D-9', sector: 'Fisterra Sur', freq: '424.0 kHz', mod: 'CW Morse', status: 'Activa (1989)', ref: 'BOYA-89-D' },
  { code: 'Boya E-4', sector: 'Cabo Valdeira', freq: '418.5 kHz', mod: 'CW Morse', status: 'Activa (1989)', ref: 'BOYA-89-E' },
  { code: 'Boya F-3', sector: 'Cabo Valdeira', freq: '431.0 kHz', mod: 'CW Morse', status: 'Averiada (sin portadora)', ref: 'BOYA-89-F' },
];

export const RADIO_SPEC = {
  targetFreqKHz: 418.5,
  minFreqKHz: 400.0,
  maxFreqKHz: 435.0,
  stepKHz: 0.5,
  word: 'TRAMPA',
  morse: encodeMorse('TRAMPA'),
};

export const BANK_ACCOUNTS = [
  { id: 'ZUR-4410', tramo1: '2.500.000 PTA (08/11)', tramo2: '2.500.000 PTA (18/11)', firma: 'E.B.', nota: 'Liquidación parcial logística' },
  { id: 'LUX-5190', tramo1: '6.000.000 PTA (15/11)', tramo2: '— (pago único)', firma: 'E.B.', nota: 'Prima extraordinaria sin fraccionar' },
  { id: 'PAN-8821', tramo1: '3.000.000 PTA (10/11)', tramo2: '3.000.000 PTA (17/11)', firma: 'A.L.', nota: 'Operación vicepresidencia' },
  { id: 'GIB-7742', tramo1: '3.000.000 PTA (10/11)', tramo2: '3.000.000 PTA (16/11)', firma: 'E.B.', nota: 'Tramo previo + tramo posterior 13/11' },
  { id: 'AND-3095', tramo1: '3.000.000 PTA (15/11)', tramo2: '3.000.000 PTA (20/11)', firma: 'E.B.', nota: 'Ambos ingresos tras el naufragio' },
];

// ============================================================================
// EXPEDIENTES DIGITALES CONSULTABLES EN EL TERMINAL DE ARCHIVO
// ============================================================================

export const ARCHIVE_DOCS = [
  {
    id: 'EXP-89-407',
    unlockAfter: 'e1',
    title: 'Registro Automático del Fotómetro y Servo-Motor · Torre Norte',
    classification: 'RESERVADO // 13–14 NOV 1989',
    summary:
      'Telemetría de azimut de la Lente Fresnel Serie 318 durante la noche del temporal.',
    rows: [
      ['01:30', 'AUTO-LOCK', '284°', 'Lectura nominal de servicio (viento NW 36 kt).'],
      ['01:45', 'AUTO-LOCK', '285°', 'Ráfaga NW 42 kt (+1° dentro de margen operativo).'],
      ['02:00', 'AUTO-LOCK', '286°', 'Ráfaga NW 54 kt (+2° dentro de margen operativo).'],
      ['02:15', 'MANUAL-OVERRIDE', '298°', 'Desconexión de embrague servo. Alarma umbral (>10°) silenciada en consola.'],
      ['02:30', 'MANUAL-LOCK', '298°', 'Haz retenido manualmente hacia los bajos exteriores; MV Arrecife vira a babor.'],
      ['02:45', 'RESTORE-AUTO', '284°', 'Reposición de la corona de giro. Última señal de socorro del mercante a las 02:38.'],
    ],
  },
  {
    id: 'DESPACHO-042',
    unlockAfter: 'e4',
    title: 'Despacho Hidrográfico Cifrado · Fosa 42',
    classification: 'CIFRADO CON ASTROLABIO // VALDEIRA-89',
    summary:
      'Despacho recuperado del respaldo magnético de Mateo Rivas sobre el cargamento real del MV Arrecife.',
    body:
      'CRYPTOGRAMA RECUPERADO: YHZNGAUZ\n\nNOTA DE CALIBRACIÓN DE MATEO RIVAS:\n"Alimenta el Astrolabio con la transmisión de la radiobaliza auxiliar (Hilo B): alinea la flecha ▲ ÍNDICE del disco interior con la PRIMERA LETRA de esa palabra en el anillo exterior, y traduce de Disco Interior a Anillo Exterior."',
  },
  {
    id: 'BOYA-89-E',
    unlockAfter: 'e4',
    title: 'Ficha Técnica de Baliza Auxiliar E-4 (Sector Cabo Valdeira)',
    classification: 'MANTENIMIENTO RADIOELÉCTRICO // ACTIVO',
    summary:
      'Baliza instalada clandestinamente por M. Rivas en abril de 1989 sobre escollo exterior.',
    body:
      'PORTADORA: 418.5 kHz · MODULACIÓN: CW Morse 680 Hz · RANGO: Cabo Valdeira.\nOBSERVACIÓN: Las bandas adyacentes presentan estática atmosférica severa. Sintoniza con precisión exactamente en 418.5 kHz dentro del Receptor de Radiobaliza para fijar la señal.',
  },
  {
    id: 'EXP-LLAVES-89',
    unlockAfter: 'e6',
    title: 'Auditoría Electrónica de Cerraduras de Seguridad · Torre Principal',
    classification: 'CONTROL DE ACCESOS // 13–14 NOV 1989',
    summary:
      'Registro magnético de apertura de la puerta blindada que da acceso al Servo de Cúpula.',
    rows: [
      ['18:02', 'LLAVE B-1', 'Archivo Técnico (Planta 1)', 'Salida registrada de A. Méndez-Vidal.'],
      ['21:38', 'LLAVE A-4', 'Archivo Cartográfico', 'Cierre de turno de E. Sampedro.'],
      ['02:04', 'LLAVE C-1', 'Sala de Motores (Sótano)', 'Entrada de R. Seoane y aprendiz para purgar generador.'],
      ['02:09', 'LLAVE B-2', 'Cúpula del Servo (Torre)', 'Apertura interior durante el temporal.'],
      ['02:47', 'LLAVE B-2', 'Cúpula del Servo (Torre)', 'Cierre exterior inmediatamente tras reponer el azimut.'],
    ],
  },
  {
    id: 'BITACORA-MR',
    unlockAfter: 'e7',
    title: 'Última Entrada en Bitácora Privada · Mateo Rivas',
    classification: 'SELLO PERSONAL M.R. // RECUPERADO',
    summary:
      'Anotación de emergencia grabada por Mateo Rivas antes de ocultarse la noche del 14 de noviembre.',
    body:
      'SECUENCIA DE UBICACIÓN FÍSICA (Reglamento Técnico de 1979):\n3·5 — 5·8 — 7·12 — 1·13 — 8·10 — 2·8 — 6·8 — 4·11\n\nCLAVE DE LECTURA: Primera letra de cada palabra (Artículo · Palabra) en la Hoja 3C.',
  },
  {
    id: 'EXP-CONSORCIO-89',
    unlockAfter: 'e9',
    title: 'Expediente Mercantil Consorcio Valdeira · Póliza MV Arrecife',
    classification: 'EXPEDIENTE NEGRO // CONFIDENCIAL',
    summary:
      'Resumen financiero de la póliza marítima suscrita por Consorcio Valdeira S.A. con Lloyds & Atlántica.',
    body:
      'BUQUE ASEGURADO: MV Arrecife (Carga declarada: Maquinaria Agrícola).\nINDEMNIZACIÓN TOTAL COBRADA POR SINIESTRO: 40.000.000 PTA.\nPRESIDENCIA Y FIRMA AUTORIZADA DEL CONSORCIO: Enrique Balboa (Iniciales E.B.).\nVICEPRESIDENCIA ADMINISTRATIVA: Alfonso Lema (Iniciales A.L.).\nCOMISIÓN PACTADA EN TÉLEX INTERVENIDOS: 15% del total de la póliza en dos tramos iguales (uno antes del 13/11 y otro después).',
  },
];

// ============================================================================
// DEFINICIÓN MAESTRA DE LOS 12 ENIGMAS (ACTOS I-IV + META-PUZLE)
// ============================================================================

export const PUZZLES = [
  {
    id: 'e1',
    act: 1,
    branch: 'main',
    code: '1.1',
    title: 'Credencial de Respaldo',
    prompt:
      'Combina los documentos del Sobre 1 para reconstruir la credencial de operador de la noche del 13/11/1989 (formato SIGLA-SERIE-TURNO).',
    placeholder: 'Ej. ABC-123-T00',
    answer: 'CVL-318-T49',
    inputType: 'text',
    envelope: 1,
    pagesHint: 'Hojas 1A y 1B',
    hints: [
      'Revisad el membrete oficial del observatorio en la Hoja 1A, la ficha de lentes ópticas y el cuadrante de turnos de la Hoja 1B.',
      'La sigla de estación aparece en el sello del membrete. Quedaos solo con la lente instalada en la Torre Principal (Óptica Norte activa) y con el turno que cubría las 02:15 de la madrugada.',
      'Sigla: CVL. Lente activa en Torre Principal: Serie 318. Turno de madrugada (22:00–06:00): T49. Clave completa: CVL-318-T49.',
    ],
    unlockMessage:
      'Acceso concedido. El Terminal de Archivo Digital queda operativo para consultar códigos de expediente.',
  },
  {
    id: 'e2',
    act: 1,
    branch: 'main',
    code: '1.2',
    title: 'El Acta Censurada',
    prompt:
      'Recorta las 8 ventanas marcadas en la Hoja 1D y alinea las marcas de registro sobre la matriz de la Hoja 1C para extraer la referencia del expediente censurado.',
    placeholder: 'Ej. EXP-00-000',
    answer: 'EXP-89-407',
    inputType: 'text',
    envelope: 1,
    pagesHint: 'Hojas 1C y 1D',
    hints: [
      'Recortad con cuidado los 8 cuadros marcados con tijeras en la Hoja 1D y superponedla sobre la matriz telegráfica de la Hoja 1C.',
      'Alinead exactamente las cuatro marcas de esquina (▲, ◆, ■, ●) antes de leer de izquierda a derecha y de arriba a abajo con formato EXP-__-___.',
      'Al alinear la rejilla de Cardano aparecen las letras y dígitos E-X-P-8-9-4-0-7: la referencia es EXP-89-407. Introducidla también en el Terminal de Archivo Digital.',
    ],
    unlockMessage:
      'Referencia validada. Podéis consultar EXP-89-407 en el Terminal de Archivo Digital para leer el registro del fotómetro.',
  },
  {
    id: 'e3',
    act: 1,
    branch: 'main',
    code: '1.3',
    title: 'Desvío en la Cúpula',
    prompt:
      'Cruza la especificación nominal de la Baliza Norte (Hoja 1E) con la telemetría de EXP-89-407 para determinar la magnitud exacta del desvío crítico y su hora (formato GRADOS-HHMM).',
    placeholder: 'Ej. 05-0130',
    answer: '14-0215',
    inputType: 'text',
    envelope: 1,
    pagesHint: 'Hoja 1E + Terminal Digital',
    hints: [
      'Consultad EXP-89-407 en el Terminal de Archivo Digital y comparad sus lecturas de azimut con el azimut oficial de la Hoja 1E.',
      'Buscad el instante en que la variación respecto a 284° supera el umbral crítico de 10°. Calculad la diferencia en grados y unidla a la hora HHMM.',
      'Azimut oficial: 284°. A las 02:15 (MANUAL-OVERRIDE) marca 298°. Diferencia: 298 - 284 = 14°. Código: 14-0215.',
    ],
    unlockMessage:
      'Acto I completado. Abrid el SOBRE 2 físico. Podéis dividiros entre el Hilo A (carta plegada) y el Hilo B (radiobaliza) antes de converger.',
  },
  {
    id: 'e4',
    act: 2,
    branch: 'threadA',
    code: '2.A',
    title: 'La Carta Plegada (Hilo A)',
    prompt:
      'Realiza los dos pliegues marcados (Pliegue A y Pliegue B) en el plano batimétrico de la Hoja 2B hasta unir ambos bordes para revelar el punto del hundimiento.',
    placeholder: 'Ej. SECTOR-00',
    answer: 'FOSA-42',
    inputType: 'text',
    envelope: 2,
    pagesHint: 'Hojas 2A y 2B',
    hints: [
      'Fijaos en las líneas verticales marcadas como PLIEGUE A (▲A) y PLIEGUE B (▲B) en la Hoja 2B.',
      'Doblad la lámina en acordeón ocultando hacia atrás toda la banda central entre A y B hasta que las líneas PLIEGUE A y PLIEGUE B queden pegadas borde con borde.',
      'Al juntar PLIEGUE A y PLIEGUE B, los trazos camuflados encajan verticalmente formando la palabra FOSA 42 (FOSA-42).',
    ],
    unlockMessage:
      'Despacho cifrado DESPACHO-042 desbloqueado en el Terminal de Archivo Digital (y ficha BOYA-89-E disponible).',
  },
  {
    id: 'e5',
    act: 2,
    branch: 'threadB',
    code: '2.B',
    title: 'La Baliza Fantasma (Hilo B)',
    prompt:
      'Filtra la tabla de boyas de la Hoja 2C, sintoniza la frecuencia exacta en el Receptor de Radiobaliza y decodifica la transmisión en Morse.',
    placeholder: 'Palabra recibida',
    answer: 'TRAMPA',
    inputType: 'text',
    envelope: 2,
    pagesHint: 'Hoja 2C + Receptor Web Audio',
    hints: [
      'Aplicad los filtros de la Hoja 2C para descartar las boyas que no correspondan al sector Cabo Valdeira, modulación CW Morse y estado activo tras 1988.',
      'La única boya que cumple todas las condiciones es la Boya E-4 en 418.5 kHz. Sintonizad 418.5 kHz en el Receptor de Radiobaliza y usad la tabla Morse.',
      'La secuencia emitida en 418.5 kHz es - .-. .- -- .--. .- que corresponde letra a letra a TRAMPA.',
    ],
    unlockMessage:
      'Transmisión decodificada. Cruzad este dato con DESPACHO-042 usando el Astrolabio recortable.',
  },
  {
    id: 'e6',
    act: 2,
    branch: 'converge',
    code: '2.C',
    title: 'El Astrolabio de Valdeira (Convergencia A+B)',
    prompt:
      'Recorta el Disco Interior (Hoja 2F), colócalo sobre el Anillo Exterior (Hoja 2E) siguiendo la instrucción de DESPACHO-042 y descifra el contenido real de la carga.',
    placeholder: 'Palabra descifrada',
    answer: 'RESIDUOS',
    inputType: 'text',
    envelope: 2,
    pagesHint: 'Hojas 2D–2G + Terminal Digital',
    hints: [
      'Recortad únicamente el Disco Interior de la Hoja 2F, colocadlo sobre el círculo central de la Hoja 2E y leed la nota de DESPACHO-042.',
      'La palabra de la baliza es TRAMPA, cuya primera letra es T. Alinead la flecha ▲ ÍNDICE del disco interior con la letra T del anillo exterior y leed YHZNGAUZ de dentro hacia fuera.',
      'Con ▲ ÍNDICE en T (sector 20), Y→R, H→E, Z→S, N→I, G→D, A→U, U→O, Z→S. La carga oculta era RESIDUOS.',
    ],
    unlockMessage:
      'Acto II completado. Abrid el SOBRE 3 físico. Volvéis a trabajar en paralelo: Hilo A (investigación documental) e Hilo B (óptica y carta náutica).',
  },
  {
    id: 'e7',
    act: 3,
    branch: 'threadA',
    code: '3.A',
    title: 'El Saboteador de la Cúpula (Hilo A)',
    prompt:
      'Cruza las coartadas, registros de centralita y el recibo de llaves (Hojas 3A–3B) junto con EXP-LLAVES-89 en el Terminal para identificar al autor material del desvío.',
    placeholder: 'Nombre y apellido',
    answer: 'Tomás Quiroga',
    inputType: 'text',
    envelope: 3,
    pagesHint: 'Hojas 3A, 3B + Terminal Digital',
    hints: [
      'Consultad EXP-LLAVES-89 en el Terminal para averiguar qué llave exacta abrió y cerró la Cúpula del Servo entre las 02:09 y las 02:47.',
      'La auditoría señala la Llave B-2. Comprobad en el Recibo #19 (Hoja 3A) quién la recibió esa tarde y contrastad las coartadas y llamadas de la Hoja 3B.',
      'Mateo Rivas entregó la llave B-2 a Tomás Quiroga a las 18:05 y tiene coartada con la Guardia Costera. Quiroga carece de coartada y llamó a la naviera a las 02:50: Tomás Quiroga.',
    ],
    unlockMessage:
      'Autor identificado. Se ha desbloqueado BITACORA-MR en el Terminal de Archivo Digital.',
  },
  {
    id: 'e8',
    act: 3,
    branch: 'threadA',
    code: '3.B',
    title: 'El Reglamento Cifrado (Hilo A)',
    prompt:
      'Aplica las coordenadas recuperadas en BITACORA-MR sobre el extracto del Reglamento Técnico de 1979 (Hoja 3C) para averiguar dónde ocultó Mateo las planchas originales.',
    placeholder: 'Palabra de 8 letras',
    answer: 'CISTERNA',
    inputType: 'text',
    envelope: 3,
    pagesHint: 'Hoja 3C + Terminal Digital',
    hints: [
      'Consultad BITACORA-MR en el Terminal para obtener las 8 coordenadas (Artículo · Palabra) y buscadlas en la Hoja 3C.',
      'Contad las palabras de cada artículo (los marcadores [5] y [10] facilitan la cuenta) y tomad únicamente la primera letra de cada palabra señalada.',
      '3·5 comenzará (C), 5·8 inspeccionarse (I), 7·12 sobre (S), 1·13 técnico (T), 8·10 exige (E), 2·8 repetirá (R), 6·8 nunca (N), 4·11 autógrafa (A) -> CISTERNA.',
    ],
    unlockMessage:
      'Ubicación localizada. Si también habéis completado el Hilo B (3.C / Triangulación), pasaréis automáticamente al Sobre 4.',
  },
  {
    id: 'e9',
    act: 3,
    branch: 'threadB',
    code: '3.C',
    title: 'Triangulación al Contraluz (Hilo B)',
    prompt:
      'Superpón las Láminas Ópticas A y B (Hojas 3D y 3E) al trasluz con la linterna del móvil para obtener los dos rumbos (F y B), trázaIos en la Carta Náutica interactiva y fija el cuadrante exacto (formato RUMBO_F-RUMBO_B-CUADRANTE).',
    placeholder: 'Ej. 180-270-B3',
    answer: '210-285-C4',
    inputType: 'nautical',
    envelope: 3,
    pagesHint: 'Hojas 3D, 3E, 3F, 3G + Carta Náutica Web',
    hints: [
      'Colocad la Hoja 3E directamente sobre la Hoja 3D (ambas boca arriba, alineando las marcas ▲ ◆ ■ ●) delante de la linterna del móvil.',
      'Al trasluz se leen dos cifras de tres dígitos: el rumbo F (Faro Norte) y el rumbo B (Boya Este). Ajustad ambos diales en la Carta Náutica Interactiva.',
      'La fila superior forma F = 210° y la inferior B = 285°. Sus rayos de demora se cruzan exactamente en el cuadrante C4: 210-285-C4.',
    ],
    unlockMessage:
      'Cuadrante de la cisterna fijado en la Carta Náutica. Completad ambos hilos del Acto III para abrir el Sobre 4.',
  },
  {
    id: 'e10',
    act: 4,
    branch: 'main',
    code: '4.1',
    title: 'La Cuenta Fantasma',
    prompt:
      'Cruza los télex y el extracto de movimientos bancarios (Hoja 4A) con el expediente EXP-CONSORCIO-89 en el Terminal para localizar la cuenta del soborno.',
    placeholder: 'Ej. ABC-0000',
    answer: 'GIB-7742',
    inputType: 'text',
    envelope: 4,
    pagesHint: 'Hoja 4A + Terminal Digital',
    hints: [
      'Consultad EXP-CONSORCIO-89 en el Terminal para conocer el importe total de la póliza y las iniciales del presidente Enrique Balboa.',
      'El 15% de 40.000.000 PTA son 6.000.000 PTA divididos en dos tramos iguales de 3.000.000 PTA (uno previo al 13/11 y otro posterior) bajo la firma E.B.',
      'ZUR-4410 suma 5M; LUX-5190 es un solo pago; PAN-8821 lleva firma A.L.; AND-3095 tiene ambas fechas tras el 13/11. La cuenta correcta es GIB-7742.',
    ],
    unlockMessage:
      'Prueba financiera asegurada. Se ha desbloqueado la Consola de Relés de Bóveda Cero.',
  },
  {
    id: 'e11',
    act: 4,
    branch: 'main',
    code: '4.2',
    title: 'La Consola de Relés',
    prompt:
      'Resuelve las 4 reglas eléctricas de enclavamiento (Hojas 4B y 4C) y configura los 6 relés R1–R6 más el selector de FASE en la Consola Interactiva.',
    placeholder: 'Configura los interruptores',
    answer: '100011-IV',
    inputType: 'relays',
    envelope: 4,
    pagesHint: 'Hojas 4B y 4C + Consola de Relés Web',
    hints: [
      'Anotad la tensión nominal y la fase útil indicada en la Hoja 4C, y aplicad las cuatro condiciones de R1–R6 de la Hoja 4B.',
      'Solo pueden estar activos 3 relés y la suma de sus índices debe ser 12 (Fase IV). Como R3 y R4 son iguales, si estuvieran activos serían 3+4=7 y el tercero no podría llegar a 12; luego R3 y R4 están inactivos.',
      'Con R3=OFF y R4=OFF, han de activarse R5 y R6 (5+6=11) más R1 (1) para sumar 12 (ya que R1≠R2). Combinación: R1, R5 y R6 activos + FASE IV (100011-IV).',
    ],
    unlockMessage:
      'Bóveda Cero energizada. Ha llegado el momento del Meta-Puzle Final: reunid elementos de los cuatro sobres físicos.',
  },
  {
    id: 'e12',
    act: 5,
    branch: 'meta',
    code: 'META',
    title: 'El Meridiano Borrado',
    prompt:
      'Reúne los cuatro Sellos de Plancha dispersos entre los Sobres 1, 2, 3 y 4 (Hojas 1E, 2A, 3F y 4D), sigue el protocolo de cierre de las Hojas 4D–4E junto con el Astrolabio del Sobre 2 e introduce la clave definitiva (formato PALABRA-DIGITOS).',
    placeholder: 'Ej. PALABRA-0000',
    answer: 'ESTAVIVO-5792',
    inputType: 'text',
    envelope: 4,
    pagesHint: 'Sellos en págs. 6, 8, 21 y 27 + Astrolabio (Sobre 2) + Hojas 4D–4E',
    hints: [
      'Buscad el sello impreso en la esquina de una hoja en cada uno de los cuatro sobres (Sobre 1 p. 6, Sobre 2 p. 8, Sobre 3 p. 21, Sobre 4 p. 27) y anotad su símbolo, par de letras y dígito.',
      'Sumad los 4 dígitos de control (5 + 7 + 9 + 2 = 23) para alinear la flecha ▲ ÍNDICE del Astrolabio con el sector 23 (letra W). Después ordenad los cuatro pares según la secuencia △ → ◎ → □ → ◇ y leed de Disco Interior a Anillo Exterior.',
      'Orden △→◎→□→◇: CW-5, XE-7, ZJ-9, ZQ-2. Con ▲ en sector 23 (W), CW XE ZJ ZQ descifra a ESTAVIVO. Añadiendo los 4 dígitos en el mismo orden: ESTAVIVO-5792.',
    ],
    unlockMessage:
      'Respaldo maestro liberado. Expediente Cabo Valdeira abierto ante las autoridades.',
  },
];

// ============================================================================
// NARRATIVA INTRO Y EPÍLOGO (ESPAÑOL DE ESPAÑA, PARA FER Y LUCÍA)
// ============================================================================

export const INTRO_NARRATIVE = {
  heading: 'Restauración de Respaldo · Cabo Valdeira (1989)',
  greeting: 'Bienvenidos, Fer y Lucía.',
  paragraphs: [
    'Son casi las diez de la noche del viernes cuando recogéis de la mesa la caja precintada sin remitente. Dentro aguardan cuatro sobres archivísticos numerados y una nota dirigida expresamente a vosotros dos: alguien ha reactivado tras treinta y tantos años la partición auxiliar del antiguo Observatorio Hidrográfico de Cabo Valdeira.',
    'La noche del 13 de noviembre de 1989, durante la peor galerna en décadas en la Costa da Morte, el mercante MV Arrecife embarrancó frente a los bajos del cabo. La investigación oficial cerró el caso como un error de cálculo provocado por el temporal y dio por desaparecido en el mar al subdirector del observatorio, Mateo Rivas.',
    'Esta consola dispone de un margen de seguridad de 120 minutos antes de que el ciclo magnético rote de nuevo. No abráis ningún sobre físico hasta que el sistema os lo indique y recordad que, en varios tramos, os convendrá repartiros los documentos sobre la mesa y cruzar lo que descubra cada uno.',
  ],
};

export const EPILOGUE_NARRATIVE = {
  heading: 'EXPEDIENTE DESCLASIFICADO · CASO CABO VALDEIRA RESUELTO',
  lead: 'Enhorabuena, Fer y Lucía. Habéis reconstruido toda la verdad oculta bajo el meridiano de 1989.',
  paragraphs: [
    'Al introducir la clave ESTAVIVO-5792, la bóveda digital libera las actas originales microfilmadas, los albaranes reales de carga y la grabación íntegra de Mateo Rivas. Treinta y seis bidones de residuos organoclorados del Consorcio Valdeira viajaban ocultos como maquinaria agrícola en las bodegas del MV Arrecife; su presidente, Enrique Balboa, compró mediante la cuenta GIB-7742 el silencio y la mano ejecutora del ingeniero nocturno Tomás Quiroga, quien desvió la lente norte +14° a las 02:15 para arrojar el buque contra la Fosa 42.',
    'Mateo Rivas no pereció aquella noche. Al descubrir la maniobra en la cúpula, puso a salvo las planchas cartográficas originales dentro de la cisterna sellada en el cuadrante C4, activó la baliza clandestina en 418.5 kHz y dejó este circuito de pruebas para que dos investigadores con paciencia, tijeras, luz y método reunieran las cuatro planchas dispersas.',
    'En la última línea del registro, fechada apenas dos meses atrás desde un apartado postal de Vigo, aparece una única nota sin firma: "Gracias por no rendiros a oscuras, Fer y Lucía. El lunes declararé ante el juzgado con las copias originales. — M.R."',
  ],
};

// Validación interna rápida de tabla de respuestas
export function getPuzzleAnswerRecords() {
  return PUZZLES.map((p) => {
    const norm = normalizeAnswer(p.answer);
    return {
      id: p.id,
      act: p.act,
      answer: p.answer,
      normalized: norm,
      sha256: sha256Hex(norm),
    };
  });
}
