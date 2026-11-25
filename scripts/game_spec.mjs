import crypto from 'node:crypto';

export const GAME_TITLE = 'Operación Praga Cero';
export const GAME_SUBTITLE = 'Agencia X · Canal Seguro Nivel 5 · Protocolo Pre-Despliegue (Praga)';
export const PLAYERS_LABEL = 'Agentes F y L (Fer y Lucía)';
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
export const ASTROLABE_KEYWORD = 'PRAGAORLOJ';

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

export const ASTROLABE_INNER = buildKeyAlphabet(ASTROLABE_KEYWORD); // PRAGOLJBCDEFHIKMNQSTUVWXYZ

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
// E4 — FOLD-IN (PLIEGUE OCULTO -> ARCO 42)
// ============================================================================

export const FOLD_SPEC = {
  widthMm: 176,
  heightMm: 190,
  foldAX: 56,
  foldBX: 120,
  glyphs: [
    {
      char: 'A',
      yOffset: 16,
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
      char: 'R',
      yOffset: 44,
      left: [
        [[-8, 0], [-8, 18]],
        [[-8, 0], [0, 0]],
        [[-8, 9], [0, 9]],
      ],
      right: [
        [[0, 0], [6, 0], [8, 2], [8, 7], [6, 9], [0, 9]],
        [[0, 9], [8, 18]],
      ],
    },
    {
      char: 'C',
      yOffset: 72,
      left: [
        [[0, 0], [-7, 0], [-9, 3], [-9, 15], [-7, 18], [0, 18]],
      ],
      right: [
        [[0, 0], [7, 0], [9, 3]],
        [[0, 18], [7, 18], [9, 15]],
      ],
    },
    {
      char: 'O',
      yOffset: 100,
      left: [
        [[0, 0], [-7, 0], [-9, 3], [-9, 15], [-7, 18], [0, 18]],
      ],
      right: [
        [[0, 0], [7, 0], [9, 3], [9, 15], [7, 18], [0, 18]],
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
// E9 — CONTRALUZ ÓPTICO + MAPA TÁCTICO DE PRAGA
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
  faro: { name: 'Foco de Petřín', x: 300, y: 94.12, targetBearing: 210 },
  boya: { name: 'Baliza Orloj', x: 383.87, y: 296.59, targetBearing: 285 },
  targetCell: 'C4',
  targetCenter: { x: 210, y: 250 },
};

// ============================================================================
// E8 — CIFRADO DE LIBRO (MANUAL DE OPERACIONES PRAGA 1979)
// ============================================================================

export const BOOK_CIPHER_ARTICLES = [
  {
    num: 1,
    text: 'Las placas originales de inteligencia urbana permanecerán siempre guardadas dentro del archivo técnico bajo llave.',
  },
  {
    num: 2,
    text: 'Durante alertas operativas severas la emisora auxiliar repetirá automáticamente su señal cada cinco minutos exactos.',
  },
  {
    num: 3,
    text: 'Toda transmisión nocturna cifrada comenzará puntualmente al sonar las campanadas del reloj de plaza.',
  },
  {
    num: 4,
    text: 'Todo expediente clasificado llevará fecha completa, sello húmedo y firma autógrafa del agente de guardia.',
  },
  {
    num: 5,
    text: 'Los enlaces ópticos de la torre deberán inspeccionarse antes de cualquier despliegue aéreo en destino.',
  },
  {
    num: 6,
    text: 'Las copias duplicadas de rutas y pisos nunca saldrán del recinto sin orden escrita previa.',
  },
  {
    num: 7,
    text: 'Ningún agente podrá abandonar su puesto sin registrar el relevo firmado sobre el libro oficial.',
  },
  {
    num: 8,
    text: 'Cualquier desvío superior a diez grados en el haz exige comunicar la incidencia a central.',
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
    meridian: 'PRG-N',
    code: 'UN-5',
    letters: 'UN',
    digit: 5,
  },
  {
    id: 'II',
    envelope: 2,
    pageRef: 8,
    shape: '◇',
    shapeName: 'Rombo discontinuo',
    meridian: 'PRG-E',
    code: 'YZ-1',
    letters: 'YZ',
    digit: 1,
  },
  {
    id: 'III',
    envelope: 3,
    pageRef: 21,
    shape: '△',
    shapeName: 'Triángulo punteado',
    meridian: 'PRG-S',
    code: 'JM-0',
    letters: 'JM',
    digit: 0,
  },
  {
    id: 'IV',
    envelope: 4,
    pageRef: 27,
    shape: '□',
    shapeName: 'Cuadrado',
    meridian: 'PRG-O',
    code: 'ZH-0',
    letters: 'ZH',
    digit: 0,
  },
];

export const META_ORDER_SHAPES = ['△', '◎', '□', '◇']; // III -> I -> IV -> II

// ============================================================================
// DATOS DE RADIOBALIZA (E5) Y TRANSFERENCIAS (E10)
// ============================================================================

export const BUOY_ROWS = [
  { code: 'Baliza A-1', sector: 'Viena Centro', freq: '382.0 kHz', mod: 'Voz AM', status: 'Activa (1985)', ref: 'BALIZA-89-A' },
  { code: 'Baliza B-7', sector: 'Praga (Petřín)', freq: '405.5 kHz', mod: 'FSK Datos', status: 'Activa (1987)', ref: 'BALIZA-89-B' },
  { code: 'Baliza C-2', sector: 'Praga (Petřín)', freq: '412.0 kHz', mod: 'CW Morse', status: 'Desmantelada (1986)', ref: 'BALIZA-89-C' },
  { code: 'Baliza D-9', sector: 'Dresde Sur', freq: '424.0 kHz', mod: 'CW Morse', status: 'Activa (1989)', ref: 'BALIZA-89-D' },
  { code: 'Baliza E-4', sector: 'Praga (Petřín)', freq: '418.5 kHz', mod: 'CW Morse', status: 'Activa (1989)', ref: 'BALIZA-89-E' },
  { code: 'Baliza F-3', sector: 'Praga (Petřín)', freq: '431.0 kHz', mod: 'CW Morse', status: 'Averiada (sin portadora)', ref: 'BALIZA-89-F' },
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
  { id: 'ZUR-4410', tramo1: '2.500.000 CHF (12/11)', tramo2: '2.500.000 CHF (21/11)', firma: 'E.B.', nota: 'Liquidación parcial logística' },
  { id: 'LUX-5190', tramo1: '6.000.000 CHF (19/11)', tramo2: '— (pago único)', firma: 'E.B.', nota: 'Prima extraordinaria sin fraccionar' },
  { id: 'PAN-8821', tramo1: '3.000.000 CHF (14/11)', tramo2: '3.000.000 CHF (20/11)', firma: 'A.L.', nota: 'Operación dirección adjunta' },
  { id: 'VIE-7742', tramo1: '3.000.000 CHF (14/11)', tramo2: '3.000.000 CHF (20/11)', firma: 'E.B.', nota: 'Tramo previo + tramo posterior 17/11' },
  { id: 'AND-3095', tramo1: '3.000.000 CHF (19/11)', tramo2: '3.000.000 CHF (24/11)', firma: 'E.B.', nota: 'Ambos ingresos tras la noche del 17/11' },
];

// ============================================================================
// EXPEDIENTES DIGITALES CONSULTABLES EN EL TERMINAL DE ARCHIVO
// ============================================================================

export const ARCHIVE_DOCS = [
  {
    id: 'EXP-89-407',
    unlockAfter: 'e1',
    title: 'Registro Automático del Repetidor Óptico · Torre de Petřín',
    classification: 'NIVEL 5 // ESTACIÓN PRG-89 · 17–18 NOV 1989',
    summary:
      'Telemetría de azimut del Enlace Óptico Serie 318 la noche en que cayó la célula de Marea Roja en Praga.',
    rows: [
      ['01:30', 'AUTO-LOCK', '284°', 'Lectura nominal de servicio (enlace estable sobre el Moldava).'],
      ['01:45', 'AUTO-LOCK', '285°', 'Ráfaga térmica (+1° dentro de margen operativo).'],
      ['02:00', 'AUTO-LOCK', '286°', 'Oscilación de torre (+2° dentro de margen operativo).'],
      ['02:15', 'MANUAL-OVERRIDE', '298°', 'Desconexión manual de servo. Alarma umbral (>10°) silenciada en consola.'],
      ['02:30', 'MANUAL-LOCK', '298°', 'Haz bloqueado intencionadamente hacia sector ciego; pérdida del convoy aliado.'],
      ['02:45', 'RESTORE-AUTO', '284°', 'Reposición de la corona óptica tras evacuación de Marea Roja.'],
    ],
  },
  {
    id: 'DESPACHO-042',
    unlockAfter: 'e4',
    title: 'Despacho Cifrado de Estación · Piso Franco Histórico',
    classification: 'CIFRADO DISCO ORLOJ // PRAGA-89',
    summary:
      'Despacho recuperado del respaldo magnético de Marek Novák sobre el refugio elegido por Marea Roja en la Praga actual.',
    body:
      'CRYPTOGRAMA RECUPERADO: EFTMUQB\n\nNOTA DE CALIBRACIÓN DE MAREK NOVÁK:\n"Calibra el Disco del Orloj con la transmisión de la emisora auxiliar (Hilo B): alinea la flecha ▲ ÍNDICE del disco interior con la PRIMERA LETRA de esa palabra en el anillo exterior, y traduce de Disco Interior a Anillo Exterior."',
  },
  {
    id: 'BALIZA-89-E',
    unlockAfter: 'e4',
    title: 'Ficha Técnica de Baliza Auxiliar E-4 (Torre de Petřín · Praga)',
    classification: 'MANTENIMIENTO RADIOELÉCTRICO // ACTIVO',
    summary:
      'Baliza instalada en secreto por el agente Marek Novák en 1989 dentro del repetidor sur de Petřín.',
    body:
      'PORTADORA: 418.5 kHz · MODULACIÓN: CW Morse 680 Hz · SECTOR: Praga (Petřín).\nOBSERVACIÓN: Las frecuencias adyacentes emiten estática atmosférica severa. Sintonizad con precisión exactamente en 418.5 kHz en el Receptor de Radiobaliza.',
  },
  {
    id: 'EXP-LLAVES-89',
    unlockAfter: 'e6',
    title: 'Auditoría Electrónica de Cerraduras · Estación PRG-89',
    classification: 'CONTROL DE ACCESOS // 17–18 NOV 1989',
    summary:
      'Registro magnético de apertura de la puerta blindada que da acceso al Repetidor Óptico de Petřín.',
    rows: [
      ['18:02', 'LLAVE B-1', 'Despacho Central', 'Salida registrada de Dr. Viktor Kovář.'],
      ['21:38', 'LLAVE A-4', 'Archivo de Microfilms', 'Cierre de turno de Klára Veselá.'],
      ['02:04', 'LLAVE C-1', 'Sótano del Castillo', 'Entrada de Jan Dvořák y aprendiz para purgar generador.'],
      ['02:09', 'LLAVE B-2', 'Sala Óptica (Torre)', 'Apertura interior durante el apagón del sector.'],
      ['02:47', 'LLAVE B-2', 'Sala Óptica (Torre)', 'Cierre exterior inmediatamente tras reponer el azimut.'],
    ],
  },
  {
    id: 'BITACORA-MN',
    unlockAfter: 'e7',
    title: 'Última Entrada en Bitácora Privada · Agente Marek Novák',
    classification: 'SELLO PERSONAL M.N. // RECUPERADO',
    summary:
      'Anotación de emergencia dejada por Novák en 1989 antes de borrar su rastro en Praga.',
    body:
      'SECUENCIA DE UBICACIÓN FÍSICA (Manual de Operaciones de 1979):\n3·5 — 5·8 — 7·12 — 1·13 — 8·10 — 2·8 — 6·8 — 4·11\n\nCLAVE DE LECTURA: Primera letra de cada palabra (Artículo · Palabra) en la Hoja 3C.',
  },
  {
    id: 'EXP-MAREA-89',
    unlockAfter: 'e9',
    title: 'Expediente Financiero · Célula Marea Roja (Praga 1989)',
    classification: 'DOSSIER NEGRO // CONFIDENCIAL',
    summary:
      'Registro de pagos interceptados tras la desarticulación incompleta de la célula en noviembre de 1989.',
    body:
      'FONDO RESERVADO TOTAL MOVILIZADO POR MAREA ROJA: 40.000.000 CHF.\nENLACE FINANCIERO Y FIRMA AUTORIZADA: Emil Beneš (Iniciales E.B.).\nDIRECCIÓN ADJUNTA: Antonín Lukáš (Iniciales A.L.).\nCOMISIÓN PACTADA EN TÉLEX INTERVENIDOS: 15% del fondo total en dos tramos iguales (uno antes del 17/11 y otro después).',
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
    title: 'Credencial Estación PRG-89',
    prompt:
      'Combinad los documentos del Sobre 1 para reconstruir la credencial del enlace de Praga de la noche del 17/11/1989 (formato SIGLA-SERIE-TURNO).',
    placeholder: 'Ej. ABC-123-T00',
    answer: 'PRG-318-T49',
    inputType: 'text',
    envelope: 1,
    pagesHint: 'Hojas 1A y 1B',
    hints: [
      'Revisad el sello oficial de estación en la Hoja 1A, la tabla de enlaces ópticos y el cuadrante de guardias de la Hoja 1B.',
      'La sigla de estación aparece en el membrete. Quedaos solo con el enlace óptico activo en Torre de Petřín y con el turno que cubría la anomalía de las 02:15.',
      'Sigla: PRG. Enlace activo en Torre de Petřín: Serie 318. Turno de madrugada (22:00–06:00): T49. Clave completa: PRG-318-T49.',
    ],
    unlockMessage:
      'Acceso de Nivel 5 concedido. El Terminal Seguro de Agencia X queda operativo para consultar códigos de expediente.',
  },
  {
    id: 'e2',
    act: 1,
    branch: 'main',
    code: '1.2',
    title: 'El Cable Censurado',
    prompt:
      'Recortad las 8 ventanas marcadas en la Hoja 1D y alinead las marcas de registro sobre la matriz de la Hoja 1C para extraer la referencia del expediente censurado.',
    placeholder: 'Ej. EXP-00-000',
    answer: 'EXP-89-407',
    inputType: 'text',
    envelope: 1,
    pagesHint: 'Hojas 1C y 1D',
    hints: [
      'Recortad con cuidado los 8 cuadros marcados con tijeras en la Hoja 1D y superponedla sobre la matriz telegráfica de la Hoja 1C.',
      'Alinead exactamente las cuatro marcas de esquina (▲, ◆, ■, ●) antes de leer de izquierda a derecha y de arriba a abajo con formato EXP-__-___.',
      'Al alinear la rejilla de Cardano aparecen las letras y dígitos E-X-P-8-9-4-0-7: la referencia es EXP-89-407. Introducidla también en el Terminal Seguro.',
    ],
    unlockMessage:
      'Referencia validada. Consultad EXP-89-407 en el Terminal Seguro para inspeccionar la telemetría de la torre.',
  },
  {
    id: 'e3',
    act: 1,
    branch: 'main',
    code: '1.3',
    title: 'Desvío en Torre de Petřín',
    prompt:
      'Cruzad la calibración nominal de la Hoja 1E con la telemetría de EXP-89-407 para hallar el desvío crítico y su hora exacta (formato GRADOS-HHMM).',
    placeholder: 'Ej. 05-0130',
    answer: '14-0215',
    inputType: 'text',
    envelope: 1,
    pagesHint: 'Hoja 1E + Terminal Seguro',
    hints: [
      'Consultad EXP-89-407 en el Terminal Seguro y comparad sus lecturas de azimut con el azimut nominal de la Hoja 1E.',
      'Buscad el instante en que la variación respecto a 284° supera el umbral crítico de 10°. Calculad la diferencia en grados y unidla a la hora HHMM.',
      'Azimut oficial: 284°. A las 02:15 (MANUAL-OVERRIDE) marca 298°. Diferencia: 298 - 284 = 14°. Código: 14-0215.',
    ],
    unlockMessage:
      'Acto I completado. Abrid el SOBRE 2 físico. Podéis dividiros entre el Hilo A (plano plegado) y el Hilo B (radiobaliza) antes de converger.',
  },
  {
    id: 'e4',
    act: 2,
    branch: 'threadA',
    code: '2.A',
    title: 'El Plano Plegado del Moldava (Hilo A)',
    prompt:
      'Realizad los dos pliegues marcados (Pliegue A y Pliegue B) en el plano del Moldava (Hoja 2B) hasta unir ambos bordes y revelar el punto exacto de fuga.',
    placeholder: 'Ej. ZONA-00',
    answer: 'ARCO-42',
    inputType: 'text',
    envelope: 2,
    pagesHint: 'Hojas 2A y 2B',
    hints: [
      'Fijaos en las líneas verticales marcadas como PLIEGUE A (▲A) y PLIEGUE B (▲B) en la Hoja 2B.',
      'Doblad la lámina en acordeón ocultando hacia atrás toda la banda central entre A y B hasta que las líneas PLIEGUE A y PLIEGUE B queden pegadas borde con borde.',
      'Al juntar PLIEGUE A y PLIEGUE B, los trazos camuflados encajan verticalmente formando el código ARCO 42 (ARCO-42).',
    ],
    unlockMessage:
      'Despacho cifrado DESPACHO-042 desbloqueado en el Terminal Seguro (y ficha BALIZA-89-E disponible).',
  },
  {
    id: 'e5',
    act: 2,
    branch: 'threadB',
    code: '2.B',
    title: 'La Emisora de Petřín (Hilo B)',
    prompt:
      'Filtrad la tabla de balizas de la Hoja 2C, sintonizad la frecuencia exacta en el Receptor de Radiobaliza y decodificad la transmisión en Morse.',
    placeholder: 'Palabra recibida',
    answer: 'TRAMPA',
    inputType: 'text',
    envelope: 2,
    pagesHint: 'Hoja 2C + Receptor Web Audio',
    hints: [
      'Aplicad los filtros de la Hoja 2C para descartar las balizas que no correspondan al sector Praga (Petřín), banda 400 kHz, modulación CW Morse y estado activo tras 1988.',
      'La única baliza que cumple las cuatro condiciones es Baliza E-4 en 418.5 kHz. Sintonizad 418.5 kHz en el Receptor de Radiobaliza y usad la tabla Morse.',
      'La secuencia emitida en 418.5 kHz es - .-. .- -- .--. .- que corresponde letra a letra a TRAMPA.',
    ],
    unlockMessage:
      'Señal decodificada. Cruzad este dato con DESPACHO-042 usando el Disco Astronómico del Orloj recortable.',
  },
  {
    id: 'e6',
    act: 2,
    branch: 'converge',
    code: '2.C',
    title: 'El Disco del Orloj (Convergencia A+B)',
    prompt:
      'Recortad el Disco Interior (Hoja 2F), colocadlo sobre el Anillo Exterior del Orloj (Hoja 2E) siguiendo la nota de DESPACHO-042 y descifrad el nombre clave del edificio que hoy sirve de cobertura en Praga.',
    placeholder: 'Nombre clave (7 letras)',
    answer: 'DEMINKA',
    inputType: 'text',
    envelope: 2,
    pagesHint: 'Hojas 2D–2G + Terminal Seguro',
    hints: [
      'Recortad únicamente el Disco Interior de la Hoja 2F, colocadlo sobre el círculo central de la Hoja 2E y leed la nota de DESPACHO-042.',
      'La palabra de la baliza es TRAMPA, cuya primera letra es T. Alinead la flecha ▲ ÍNDICE del disco interior con la letra T del anillo exterior y leed EFTMUQB de dentro hacia fuera.',
      'Con ▲ ÍNDICE en T (sector 20), E→D, F→E, T→M, M→I, U→N, Q→K, B→A. La palabra descifrada es DEMINKA.',
    ],
    unlockMessage:
      'Acto II completado. Abrid el SOBRE 3 físico. Volvéis a trabajar en paralelo: Hilo A (investigación documental) e Hilo B (óptica y mapa táctico de Praga).',
  },
  {
    id: 'e7',
    act: 3,
    branch: 'threadA',
    code: '3.A',
    title: 'El Topo de Estación PRG-89 (Hilo A)',
    prompt:
      'Cruzad las coartadas, registros de centralita y el recibo de llaves (Hojas 3A–3B) junto con la auditoría del Terminal Seguro para identificar al agente doble de la torre.',
    placeholder: 'Nombre y apellido',
    answer: 'Pavel Horák',
    inputType: 'text',
    envelope: 3,
    pagesHint: 'Hojas 3A, 3B + Terminal Seguro',
    hints: [
      'Consultad EXP-LLAVES-89 en el Terminal Seguro para averiguar qué llave exacta abrió y cerró la Sala Óptica entre las 02:09 y las 02:47.',
      'La auditoría señala la Llave B-2. Comprobad en el Recibo #19 (Hoja 3A) quién la recibió esa tarde y contrastad las coartadas y llamadas de la Hoja 3B.',
      'Marek Novák entregó la llave B-2 a Pavel Horák a las 18:05 y tiene coartada junto al Reloj Astronómico. Horák carece de coartada y llamó al buzón de Marea Roja a las 02:50: Pavel Horák.',
    ],
    unlockMessage:
      'Topo identificado. Se ha desbloqueado BITACORA-MN en el Terminal Seguro.',
  },
  {
    id: 'e8',
    act: 3,
    branch: 'threadA',
    code: '3.B',
    title: 'El Manual de Campo Cifrado (Hilo A)',
    prompt:
      'Aplicad las coordenadas recuperadas en BITACORA-MN sobre el extracto del Manual de Operaciones de 1979 (Hoja 3C) para descubrir dónde ocultó Marek Novák las matrices originales.',
    placeholder: 'Palabra de 8 letras',
    answer: 'CISTERNA',
    inputType: 'text',
    envelope: 3,
    pagesHint: 'Hoja 3C + Terminal Seguro',
    hints: [
      'Consultad BITACORA-MN en el Terminal Seguro para obtener las 8 coordenadas (Artículo · Palabra) y buscadlas en la Hoja 3C.',
      'Contad las palabras de cada artículo (los marcadores [5] y [10] facilitan la cuenta) y tomad únicamente la primera letra de cada palabra señalada.',
      '3·5 comenzará (C), 5·8 inspeccionarse (I), 7·12 sobre (S), 1·13 técnico (T), 8·10 exige (E), 2·8 repetirá (R), 6·8 nunca (N), 4·11 autógrafa (A) -> CISTERNA.',
    ],
    unlockMessage:
      'Escondite localizado. Si también habéis completado el Hilo B (3.C / Triangulación), pasaréis automáticamente al Sobre 4.',
  },
  {
    id: 'e9',
    act: 3,
    branch: 'threadB',
    code: '3.C',
    title: 'Triangulación sobre el Moldava (Hilo B)',
    prompt:
      'Superponed las Láminas Ópticas A y B (Hojas 3D y 3E) al trasluz con la linterna del móvil para obtener los dos rumbos (F y B), trazadlos en el Mapa Táctico de Praga y fijad el cuadrante exacto (formato RUMBO_F-RUMBO_B-CUADRANTE).',
    placeholder: 'Ej. 180-270-B3',
    answer: '210-285-C4',
    inputType: 'nautical',
    envelope: 3,
    pagesHint: 'Hojas 3D, 3E, 3F, 3G + Mapa Táctico Web',
    hints: [
      'Colocad la Hoja 3E directamente sobre la Hoja 3D (ambas boca arriba, alineando las marcas ▲ ◆ ■ ●) delante de la linterna del móvil.',
      'Al trasluz se leen dos cifras de tres dígitos: el rumbo F (Foco de Petřín) y el rumbo B (Baliza Orloj). Ajustad ambos diales en el Mapa Táctico Interactivo.',
      'La fila superior forma F = 210° y la inferior B = 285°. Sus haces se cruzan exactamente en el cuadrante C4 (Isla Kampa): 210-285-C4.',
    ],
    unlockMessage:
      'Cuadrante del depósito subterráneo fijado sobre el Moldava. Completad ambos hilos del Acto III para abrir el Sobre 4.',
  },
  {
    id: 'e10',
    act: 4,
    branch: 'main',
    code: '4.1',
    title: 'La Cuenta de Marea Roja',
    prompt:
      'Cruzad los télex y el extracto de transferencias (Hoja 4A) con el expediente financiero del Terminal Seguro para localizar la cuenta que reactivó la célula.',
    placeholder: 'Ej. ABC-0000',
    answer: 'VIE-7742',
    inputType: 'text',
    envelope: 4,
    pagesHint: 'Hoja 4A + Terminal Seguro',
    hints: [
      'Consultad EXP-MAREA-89 en el Terminal Seguro para conocer el fondo total movilizado y las iniciales del enlace financiero Emil Beneš.',
      'El 15% de 40.000.000 CHF son 6.000.000 CHF divididos en dos tramos iguales de 3.000.000 CHF (uno previo al 17/11 y otro posterior) bajo la firma E.B.',
      'ZUR-4410 suma 5M; LUX-5190 es un solo pago; PAN-8821 lleva firma A.L.; AND-3095 tiene ambas fechas tras el 17/11. La cuenta correcta es VIE-7742.',
    ],
    unlockMessage:
      'Rastro financiero bloqueado. Se ha desbloqueado la Consola de Relés de Bóveda Cero.',
  },
  {
    id: 'e11',
    act: 4,
    branch: 'main',
    code: '4.2',
    title: 'La Consola de Bóveda Cero',
    prompt:
      'Resolved las 4 reglas eléctricas de enclavamiento (Hojas 4B y 4C) y configurad los 6 relés R1–R6 más el selector de FASE en la Consola Interactiva.',
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
      'Bóveda Cero energizada. Último protocolo activo: reunid elementos de los cuatro sobres físicos para liberar la autorización final de Praga.',
  },
  {
    id: 'e12',
    act: 5,
    branch: 'meta',
    code: 'META',
    title: 'Protocolo Praga Cero',
    prompt:
      'Reunid los cuatro Sellos de Plancha dispersos entre los Sobres 1, 2, 3 y 4 (Hojas 1E, 2A, 3F y 4D), seguid el protocolo de cierre de las Hojas 4D–4E junto con el Disco del Orloj del Sobre 2 e introducid la autorización definitiva (formato PALABRA-DIGITOS).',
    placeholder: 'Ej. PALABRA-0000',
    answer: 'LUZVERDE-0501',
    inputType: 'text',
    envelope: 4,
    pagesHint: 'Sellos en págs. 6, 8, 21 y 27 + Disco Orloj (Sobre 2) + Hojas 4D–4E',
    hints: [
      'Buscad el sello impreso en la esquina de una hoja en cada uno de los cuatro sobres (Sobre 1 p. 6, Sobre 2 p. 8, Sobre 3 p. 21, Sobre 4 p. 27) y anotad su símbolo, par de letras y dígito.',
      'Sumad los 4 dígitos de control (0 + 5 + 0 + 1 = 6) para alinear la flecha ▲ ÍNDICE del Disco del Orloj con el sector 06 (letra F). Después ordenad los cuatro pares según la secuencia △ → ◎ → □ → ◇ y leed de Disco Interior a Anillo Exterior.',
      'Orden △→◎→□→◇: JM-0, UN-5, ZH-0, YZ-1. Con ▲ en sector 06 (F), JM UN ZH YZ descifra a LUZVERDE. Añadiendo los 4 dígitos en el mismo orden: LUZVERDE-0501.',
    ],
    unlockMessage:
      'Autorización Praga Cero validada. Despliegue de enero desbloqueado para Agentes F y L.',
  },
];

// ============================================================================
// NARRATIVA INTRO Y EPÍLOGO (ESPAÑOL DE ESPAÑA, AGENCIA X · FER Y LUCÍA)
// ============================================================================

export const INTRO_NARRATIVE = {
  heading: 'Canal Seguro · Protocolo Pre-Despliegue Praga',
  greeting: 'Agentes F y L (Fer y Lucía): conexión prioritaria verificada.',
  paragraphs: [
    'Tras cerrar con éxito vuestra misión de campo en Tarifa (Operación Espejismo) y localizar la pista de Marea Roja en Europa Central, Agencia X Central ha interceptado un último paquete físico sellado procedente del archivo de la antigua Estación PRG-89 de Praga, clausurada en noviembre de 1989.',
    'Antes de que embarquéis rumbo a la República Checa el próximo 5 de enero, alguien dentro de la red intenta reactivar los viejos nodos ocultos bajo el Moldava. Vuestra misión de gabinete esta noche consiste en descifrar los cuatro sobres de inteligencia y purgar las credenciales históricas antes del despliegue.',
    'Disponéis de 120 minutos en este canal seguro. No abráis ningún sobre físico hasta que el sistema os lo ordene, repartíos los documentos cuando la investigación abra dos hilos paralelos y recordad la directiva clásica de la casa: el paraguas sigue siendo obligatorio por órdenes de arriba.',
  ],
};

export const EPILOGUE_NARRATIVE = {
  heading: 'AGENCIA X CENTRAL · DESPLIEGUE A PRAGA AUTORIZADO',
  lead: 'Excelente trabajo de campo en mesa, Agentes F y L. Operación Praga Cero completada con éxito.',
  paragraphs: [
    'Al validar LUZVERDE-0501, la Bóveda Cero sella definitivamente la cuenta VIE-7742 de Emil Beneš, confirma la traición del topo Pavel Horák en Torre de Petřín (+14° a las 02:15) y recupera las matrices originales escondidas por Marek Novák dentro de la cisterna subterránea bajo Isla Kampa (cuadrante C4).',
    'Con el nodo histórico neutralizado, vuestra cobertura turística queda completamente limpia para el desplazamiento oficial del 05/01/2027 al 09/01/2027 (vuelos FR9745 / FR9746 Málaga–Praga) y vuestra base operativa en el Deminka Palace (Škrétova 6), donde ya trabajaron nuestros agentes en 1989.',
    'Último anexo de Agencia X Central antes de hacer las maletas: además del Puente de Carlos, el Reloj Astronómico, el Castillo y Josefov, tenéis autorización de Nivel 5 para infiltración intensiva en cervecerías tradicionales checas. No olvidéis el paraguas. — Dirección Central, Agencia X.',
  ],
};

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
