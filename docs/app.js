import { GAME_DATA } from './game_data.js';

const STORAGE_KEY = 'meridiano_borrado_state_v1';

// ============================================================================
// UTILIDADES: NORMALIZACIÓN, BASE64 UTF-8 Y SHA-256 PURO (HTTP / FILE / HTTPS)
// ============================================================================

export function normalizeAnswer(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function decodeB64(b64) {
  if (!b64) return '';
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

export function sha256Hex(str) {
  const bytes = new TextEncoder().encode(String(str));
  const words = [];
  for (let i = 0; i < bytes.length; i++) {
    words[i >> 2] = (words[i >> 2] || 0) | (bytes[i] << (24 - (i % 4) * 8));
  }
  const bitLen = bytes.length * 8;
  words[bitLen >> 5] = (words[bitLen >> 5] || 0) | (0x80 << (24 - (bitLen % 32)));
  words[(((bitLen + 64) >> 9) << 4) + 15] = bitLen;

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const rotr = (n, x) => (x >>> n) | (x << (32 - n));
  const w = new Array(64);

  for (let i = 0; i < words.length; i += 16) {
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      if (t < 16) {
        w[t] = words[i + t] || 0;
      } else {
        const s0 = rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3);
        const s1 = rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + h) | 0;
  }

  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

// ============================================================================
// ESTADO DE PARTIDA Y PERSISTENCIA EN LOCALSTORAGE
// ============================================================================

function defaultState() {
  return {
    started: false,
    completed: false,
    elapsedBeforePauseMs: 0,
    lastResumeAt: null,
    paused: false,
    finishedElapsedMs: null,
    solvedIds: [],
    hintsUsed: {}, // { e1: [1, 2], ... }
    discoveredDocs: [], // array de queryHash consultados o desbloqueados
    activeTab: 'cases',
    lastEnvelopeAnnounced: 1,
    bannerDismissedFor: 0,
    journal: [],
    nautical: { faro: 180, boya: 270, cell: '' },
    relays: { bits: [0, 0, 0, 0, 0, 0], phase: 'I' },
  };
}

let state = loadState();
const draftInputs = {};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota errors
  }
}

function isSolved(id) {
  return state.solvedIds.includes(id);
}

function isPuzzleUnlocked(id) {
  switch (id) {
    case 'e1':
      return true;
    case 'e2':
      return isSolved('e1');
    case 'e3':
      return isSolved('e2');
    case 'e4':
    case 'e5':
      return isSolved('e3');
    case 'e6':
      return isSolved('e4') && isSolved('e5');
    case 'e7':
    case 'e9':
      return isSolved('e6');
    case 'e8':
      return isSolved('e7');
    case 'e10':
      return isSolved('e8') && isSolved('e9');
    case 'e11':
      return isSolved('e10');
    case 'e12':
      return isSolved('e11');
    default:
      return false;
  }
}

function currentMaxEnvelope() {
  if (isSolved('e8') && isSolved('e9')) return 4;
  if (isSolved('e6')) return 3;
  if (isSolved('e3')) return 2;
  return 1;
}

function currentActNumber() {
  if (isSolved('e11')) return 5;
  if (isSolved('e8') && isSolved('e9')) return 4;
  if (isSolved('e6')) return 3;
  if (isSolved('e3')) return 2;
  return 1;
}

function getElapsedMs() {
  if (!state.started) return 0;
  if (state.completed && state.finishedElapsedMs != null) return state.finishedElapsedMs;
  if (state.paused || state.lastResumeAt == null) return state.elapsedBeforePauseMs;
  return state.elapsedBeforePauseMs + (Date.now() - state.lastResumeAt);
}

function formatDurationMMSS(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function totalHintsCount() {
  return Object.values(state.hintsUsed).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
}

function appendJournal(title, detail) {
  const stamp = formatDurationMMSS(getElapsedMs());
  state.journal.unshift({ time: stamp, title, detail });
}

// ============================================================================
// DOM REFS Y MODALES
// ============================================================================

const $ = (sel) => document.querySelector(sel);

function openConfirmDialog(title, body, onAccept) {
  const dlg = $('#confirm-modal');
  $('#confirm-title').textContent = title;
  $('#confirm-body').textContent = body;
  const acceptBtn = $('#confirm-accept');
  const cancelBtn = $('#confirm-cancel');

  const cleanup = () => {
    acceptBtn.onclick = null;
    cancelBtn.onclick = null;
    if (dlg.open) dlg.close();
  };

  acceptBtn.onclick = () => {
    cleanup();
    onAccept();
  };
  cancelBtn.onclick = cleanup;
  dlg.showModal();
}

// ============================================================================
// RENDER PRINCIPAL Y EVENTOS
// ============================================================================

function initIntro() {
  $('#intro-title').textContent = GAME_DATA.meta.title;
  $('#intro-greeting').textContent = GAME_DATA.meta.intro.greeting;
  const box = $('#intro-paragraphs');
  box.innerHTML = '';
  for (const p of GAME_DATA.meta.intro.paragraphs) {
    const el = document.createElement('p');
    el.textContent = p;
    box.appendChild(el);
  }
}

function renderTopbar() {
  const topbar = $('#topbar');
  topbar.hidden = !state.started;
  if (!state.started) return;

  const env = currentMaxEnvelope();
  $('#top-status').textContent = `Sesión: ${GAME_DATA.meta.playersLabel} · Sobre ${env} activo`;
  $('#progress-counter').textContent = `${state.solvedIds.length} / ${GAME_DATA.puzzles.length}`;

  const pauseBtn = $('#btn-pause');
  pauseBtn.textContent = state.paused ? 'Reanudar' : 'Pausar';
  pauseBtn.hidden = state.completed;

  updateTimerDisplay();
}

function updateTimerDisplay() {
  const elapsedMs = getElapsedMs();
  const limitMs = GAME_DATA.meta.totalMinutes * 60 * 1000;
  const timerBox = $('#timer-box');
  const modeLabel = $('#timer-mode-label');
  const display = $('#timer-display');

  timerBox.classList.toggle('paused', state.paused && !state.completed);

  if (elapsedMs <= limitMs) {
    timerBox.classList.remove('overtime');
    modeLabel.textContent = state.paused ? 'Pausado' : 'Restante';
    display.textContent = formatDurationMMSS(limitMs - elapsedMs);
  } else {
    timerBox.classList.add('overtime');
    modeLabel.textContent = 'Tiempo extra';
    display.textContent = `+${formatDurationMMSS(elapsedMs - limitMs)}`;
  }
}

function renderEnvelopeBanner() {
  const maxEnv = currentMaxEnvelope();
  const banner = $('#envelope-banner');
  const dismissBtn = $('#btn-dismiss-banner');
  const ranges = {
    1: 'Páginas 1 a 6 del dosier',
    2: 'Páginas 7 a 14 del dosier (ramas paralelas disponibles)',
    3: 'Páginas 15 a 22 del dosier (ramas paralelas disponibles)',
    4: 'Páginas 23 a 28 del dosier (recta final)',
  };

  if (maxEnv > state.lastEnvelopeAnnounced) {
    state.lastEnvelopeAnnounced = maxEnv;
    saveState();
  }

  const isDismissed = state.bannerDismissedFor === maxEnv;
  if (isDismissed) {
    banner.hidden = true;
    return;
  }

  banner.hidden = false;
  $('#envelope-tag').textContent = `SOBRE ${maxEnv} DESBLOQUEADO`;
  $('#envelope-msg').textContent = `Abrid el SOBRE ${maxEnv} físico (${ranges[maxEnv]}).`;
  dismissBtn.hidden = false;
}

function renderTabsAvailability() {
  const archiveUnlocked = isSolved('e1');
  const radioUnlocked = isSolved('e3');
  const nauticalUnlocked = isSolved('e6');
  const relaysUnlocked = isSolved('e10');

  const setTabState = (btnId, lockId, unlocked, lockText) => {
    const btn = $(btnId);
    const lock = $(lockId);
    btn.disabled = !unlocked;
    lock.textContent = unlocked ? 'Activo' : lockText;
  };

  setTabState('#tab-archive', '#lock-archive', archiveUnlocked, 'Tras 1.1');
  setTabState('#tab-radio', '#lock-radio', radioUnlocked, 'Sobre 2');
  setTabState('#tab-nautical', '#lock-nautical', nauticalUnlocked, 'Sobre 3');
  setTabState('#tab-relays', '#lock-relays', relaysUnlocked, 'Tras 4.1');

  if (!unlockedForTab(state.activeTab)) {
    state.activeTab = 'cases';
  }

  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === state.activeTab);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    const active = panel.id === `panel-${state.activeTab}`;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
}

function unlockedForTab(tab) {
  if (tab === 'cases') return true;
  if (tab === 'archive') return isSolved('e1');
  if (tab === 'radio') return isSolved('e3');
  if (tab === 'nautical') return isSolved('e6');
  if (tab === 'relays') return isSolved('e10');
  return false;
}

function switchTab(tab) {
  if (!unlockedForTab(tab)) return;
  state.activeTab = tab;
  saveState();
  renderTabsAvailability();
  if (tab !== 'radio') {
    stopRadioAudio();
  }
}

function renderActsRail() {
  const acts = [
    { num: 1, label: 'Acto I · Sobre 1', sub: 'Precinto', ids: ['e1', 'e2', 'e3'] },
    { num: 2, label: 'Acto II · Sobre 2', sub: 'Tormenta (A∥B)', ids: ['e4', 'e5', 'e6'] },
    { num: 3, label: 'Acto III · Sobre 3', sub: 'Mareas (A∥B)', ids: ['e7', 'e8', 'e9'] },
    { num: 4, label: 'Acto IV · Sobre 4', sub: 'Exp. Negro', ids: ['e10', 'e11'] },
    { num: 5, label: 'Meta-Puzle Final', sub: '4 Sobres', ids: ['e12'] },
  ];

  const curAct = currentActNumber();
  const rail = $('#acts-rail');
  rail.innerHTML = acts
    .map((a) => {
      const done = a.ids.every((id) => isSolved(id));
      const cls = done ? 'done' : a.num === curAct ? 'current' : '';
      return `<div class="act-step ${cls}"><span class="act-kicker">${a.label}</span><strong>${a.sub}</strong></div>`;
    })
    .join('');
}

function buildPuzzleCard(p) {
  const solved = isSolved(p.id);
  const unlocked = isPuzzleUnlocked(p.id);
  const card = document.createElement('article');
  card.className = `puzzle-card ${solved ? 'solved' : unlocked ? '' : 'locked'}`;
  card.dataset.puzzleId = p.id;

  const head = document.createElement('div');
  head.className = 'puzzle-head';
  head.innerHTML = `
    <span class="puzzle-code">${p.code}${solved ? ' · RESUELTO' : unlocked ? '' : ' · BLOQUEADO'}</span>
    <span class="puzzle-meta">Sobre ${p.envelope} · ${p.pagesHint}</span>
  `;
  card.appendChild(head);

  const title = document.createElement('h3');
  title.className = 'puzzle-title';
  title.textContent = p.title;
  card.appendChild(title);

  const prompt = document.createElement('p');
  prompt.className = 'puzzle-prompt';
  prompt.textContent = unlocked
    ? decodeB64(p.promptB64)
    : 'Resuelve los enigmas anteriores para desbloquear este tramo de investigación.';
  card.appendChild(prompt);

  if (!unlocked) return card;

  // Formulario o acceso directo al módulo interactivo
  const form = document.createElement('form');
  form.className = 'puzzle-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = p.placeholder;
  input.autocomplete = 'off';
  input.disabled = solved;
  input.value = solved ? '' : draftInputs[p.id] || '';
  input.setAttribute('aria-label', `Respuesta para ${p.title}`);
  input.addEventListener('input', () => {
    draftInputs[p.id] = input.value;
  });

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn-primary';
  submitBtn.textContent = solved ? 'Validado' : 'Validar';
  submitBtn.disabled = solved;

  form.appendChild(input);
  form.appendChild(submitBtn);
  card.appendChild(form);

  const feedback = document.createElement('div');
  feedback.className = 'feedback-line';
  card.appendChild(feedback);

  const jumpMap = {
    e2: ['archive', 'Abrir Terminal de Archivo'],
    e3: ['archive', 'Abrir Terminal de Archivo'],
    e5: ['radio', 'Abrir Receptor de Radiobaliza'],
    e6: ['archive', 'Abrir Terminal de Archivo'],
    e7: ['archive', 'Abrir Terminal de Archivo'],
    e8: ['archive', 'Abrir Terminal de Archivo'],
    e9: ['nautical', 'Abrir Carta Náutica'],
    e10: ['archive', 'Abrir Terminal de Archivo'],
    e11: ['relays', 'Abrir Consola de Relés'],
  };
  if (jumpMap[p.id] && !solved) {
    const [targetTab, label] = jumpMap[p.id];
    const jump = document.createElement('button');
    jump.type = 'button';
    jump.className = 'btn btn-ghost btn-sm';
    jump.textContent = label;
    jump.addEventListener('click', () => switchTab(targetTab));
    card.appendChild(jump);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = attemptSolvePuzzle(p.id, input.value);
    if (!ok) {
      feedback.className = 'feedback-line err';
      feedback.textContent = 'Clave no válida. Comprobad el formato, el cálculo o los documentos asociados.';
    }
  });

  if (solved) {
    const unlockBox = document.createElement('div');
    unlockBox.className = 'unlock-box';
    unlockBox.textContent = decodeB64(p.unlockMessageB64);
    card.appendChild(unlockBox);
  }

  // Pistas progresivas de 3 niveles
  const hintsWrap = document.createElement('div');
  hintsWrap.className = 'hints-row';
  const btnsRow = document.createElement('div');
  btnsRow.className = 'hints-buttons';

  const usedLevels = state.hintsUsed[p.id] || [];
  p.hints.forEach((h) => {
    const revealed = usedLevels.includes(h.level);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = revealed ? `Pista ${h.level} (${h.label}) ✓` : `Ver Pista ${h.level}: ${h.label}`;
    btn.disabled = revealed;
    btn.addEventListener('click', () => {
      if (h.level === 3) {
        openConfirmDialog(
          'Confirmar Pista de Nivel 3',
          'El Nivel 3 muestra la explicación paso a paso y la clave exacta de este enigma. ¿Seguro que queréis revelarlo?',
          () => revealHint(p.id, h.level)
        );
      } else {
        revealHint(p.id, h.level);
      }
    });
    btnsRow.appendChild(btn);
  });

  hintsWrap.appendChild(btnsRow);
  p.hints.forEach((h) => {
    if (usedLevels.includes(h.level)) {
      const box = document.createElement('div');
      box.className = 'hint-box';
      const txt = decodeB64(h.b64);
      box.innerHTML = `<strong>Nivel ${h.level} (${h.label}):</strong> `;
      box.appendChild(document.createTextNode(txt));
      hintsWrap.appendChild(box);
    }
  });
  card.appendChild(hintsWrap);

  return card;
}

function revealHint(puzzleId, level) {
  if (!state.hintsUsed[puzzleId]) state.hintsUsed[puzzleId] = [];
  if (!state.hintsUsed[puzzleId].includes(level)) {
    state.hintsUsed[puzzleId].push(level);
    const p = GAME_DATA.puzzles.find((x) => x.id === puzzleId);
    appendJournal(`Pista Nivel ${level} consultada`, `${p.code} · ${p.title}`);
    saveState();
    renderAll();
  }
}

function attemptSolvePuzzle(puzzleId, rawAnswer) {
  const p = GAME_DATA.puzzles.find((x) => x.id === puzzleId);
  if (!p || isSolved(puzzleId) || !isPuzzleUnlocked(puzzleId)) return false;

  const norm = normalizeAnswer(rawAnswer);
  if (!norm) return false;

  const hash = sha256Hex(norm);
  if (hash !== p.answerHash) return false;

  const prevMaxEnv = currentMaxEnvelope();
  delete draftInputs[puzzleId];
  state.solvedIds.push(puzzleId);

  for (const doc of GAME_DATA.archiveDocs) {
    if (doc.unlockAfter === puzzleId && doc.autoDiscover && !state.discoveredDocs.includes(doc.queryHash)) {
      state.discoveredDocs.push(doc.queryHash);
    }
  }

  appendJournal(`${p.code} resuelto · ${p.title}`, decodeB64(p.unlockMessageB64));

  const newMaxEnv = currentMaxEnvelope();
  if (newMaxEnv > prevMaxEnv) {
    state.bannerDismissedFor = 0;
  }

  if (puzzleId === 'e12') {
    state.completed = true;
    state.finishedElapsedMs = getElapsedMs();
    stopRadioAudio();
  }

  saveState();
  renderAll();
  return true;
}

function renderPuzzlesBoard() {
  const container = $('#puzzles-container');
  container.innerHTML = '';

  const curAct = currentActNumber();
  const visibleActs = [];
  for (let a = 1; a <= curAct; a++) visibleActs.push(a);

  // Mostrar primero el acto actual y debajo los anteriores ya completados
  visibleActs.reverse().forEach((actNum) => {
    const actPuzzles = GAME_DATA.puzzles.filter((p) => p.act === actNum);
    const threadA = actPuzzles.filter((p) => p.branch === 'threadA');
    const threadB = actPuzzles.filter((p) => p.branch === 'threadB');

    if (threadA.length > 0 && threadB.length > 0) {
      const split = document.createElement('div');
      split.className = 'parallel-split';

      const colA = document.createElement('div');
      colA.className = 'puzzles-grid';
      threadA.forEach((p) => colA.appendChild(buildPuzzleCard(p)));

      const colB = document.createElement('div');
      colB.className = 'puzzles-grid';
      threadB.forEach((p) => colB.appendChild(buildPuzzleCard(p)));

      split.appendChild(colA);
      split.appendChild(colB);
      container.appendChild(split);

      actPuzzles
        .filter((p) => p.branch !== 'threadA' && p.branch !== 'threadB')
        .forEach((p) => container.appendChild(buildPuzzleCard(p)));
    } else {
      actPuzzles.forEach((p) => container.appendChild(buildPuzzleCard(p)));
    }
  });
}

// ============================================================================
// MÓDULO 2: TERMINAL DE ARCHIVO DIGITAL
// ============================================================================

function renderArchiveChips() {
  const chips = $('#archive-chips');
  chips.innerHTML = '';
  for (const hash of state.discoveredDocs) {
    const doc = GAME_DATA.archiveDocs.find((d) => d.queryHash === hash);
    if (!doc) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'doc-chip';
    btn.textContent = decodeB64(doc.codeB64);
    btn.addEventListener('click', () => showArchiveDocument(doc));
    chips.appendChild(btn);
  }
}

function showArchiveDocument(doc) {
  const viewer = $('#archive-viewer');
  viewer.hidden = false;
  viewer.innerHTML = '';

  const cls = document.createElement('div');
  cls.className = 'pv-class';
  cls.textContent = `${decodeB64(doc.codeB64)} · ${decodeB64(doc.classificationB64)}`;
  viewer.appendChild(cls);

  const title = document.createElement('h3');
  title.textContent = decodeB64(doc.titleB64);
  viewer.appendChild(title);

  const sum = document.createElement('p');
  sum.textContent = decodeB64(doc.summaryB64);
  viewer.appendChild(sum);

  if (doc.bodyB64) {
    const pre = document.createElement('pre');
    pre.textContent = decodeB64(doc.bodyB64);
    viewer.appendChild(pre);
  }

  if (doc.rowsB64) {
    const rows = JSON.parse(decodeB64(doc.rowsB64));
    const table = document.createElement('table');
    table.className = 'pv-table';
    const tbody = document.createElement('tbody');
    for (const r of rows) {
      const tr = document.createElement('tr');
      for (const cell of r) {
        const td = document.createElement('td');
        td.textContent = cell;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    viewer.appendChild(table);
  }
}

function handleArchiveQuery(rawQuery) {
  const norm = normalizeAnswer(rawQuery);
  const fb = $('#archive-feedback');
  if (!norm) {
    fb.className = 'feedback-line err';
    fb.textContent = 'Introduce un código de expediente o referencia.';
    return;
  }

  const hash = sha256Hex(norm);
  const doc = GAME_DATA.archiveDocs.find((d) => d.queryHash === hash);
  if (!doc) {
    fb.className = 'feedback-line err';
    fb.textContent = 'No existe ningún expediente archivado bajo esa referencia.';
    return;
  }

  if (!isSolved(doc.unlockAfter)) {
    fb.className = 'feedback-line err';
    fb.textContent = 'Registro clasificado: aún no habéis desbloqueado el tramo de investigación correspondiente.';
    return;
  }

  if (!state.discoveredDocs.includes(doc.queryHash)) {
    state.discoveredDocs.push(doc.queryHash);
    appendJournal(`Expediente consultado: ${decodeB64(doc.codeB64)}`, decodeB64(doc.titleB64));
    saveState();
  }

  fb.className = 'feedback-line ok';
  fb.textContent = `Expediente ${decodeB64(doc.codeB64)} recuperado del respaldo magnético.`;
  renderArchiveChips();
  showArchiveDocument(doc);
}

// ============================================================================
// MÓDULO 3: RECEPTOR DE RADIOBALIZA (WEB AUDIO API + OSCILOSCOPIO + LÁMPARA)
// ============================================================================

let audioCtx = null;
let noiseNode = null;
let noiseGain = null;
let cwOsc = null;
let cwGain = null;
let radioActive = false;
let morseTimerId = null;
let scopeAnimId = null;
let pulseLit = false;

function getMorseTimeline(morseStr, slowMode) {
  const unit = slowMode ? 0.21 : 0.115; // segundos por punto
  const events = [];
  let t = 0;
  const letters = morseStr.trim().split(' ');
  letters.forEach((letter, lIdx) => {
    for (let i = 0; i < letter.length; i++) {
      const dur = letter[i] === '-' ? unit * 3 : unit;
      events.push({ start: t, end: t + dur });
      t += dur + unit; // espacio intra-carácter
    }
    if (lIdx < letters.length - 1) {
      t += unit * 2; // total 3 unidades entre letras
    }
  });
  t += unit * 9; // pausa larga antes de repetir secuencia
  return { events, totalDuration: t };
}

function ensureAudioNodes() {
  if (audioCtx) return true;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return false;
  try {
    audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    // Estática atmosférica mediante buffer de ruido blanco + bandpass
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    noiseNode.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 1.4;

    noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0;

    noiseNode.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    noiseNode.start();

    // Oscilador CW limpio a 680 Hz
    cwOsc = audioCtx.createOscillator();
    cwOsc.type = 'sine';
    cwOsc.frequency.value = 680;
    cwGain = audioCtx.createGain();
    cwGain.gain.value = 0;
    cwOsc.connect(cwGain);
    cwGain.connect(audioCtx.destination);
    cwOsc.start();
    return true;
  } catch {
    return false;
  }
}

function currentRadioFreq() {
  return Number($('#radio-slider').value);
}

function isTargetFreq(freq) {
  return Math.abs(freq - GAME_DATA.radio.targetFreqKHz) < 0.05;
}

function scheduleMorseLoop() {
  clearTimeout(morseTimerId);
  if (!radioActive) return;

  const freq = currentRadioFreq();
  const slowMode = $('#radio-slow-mode').checked;
  const locked = isTargetFreq(freq);

  if (noiseGain && audioCtx) {
    noiseGain.gain.setTargetAtTime(locked ? 0.012 : 0.065, audioCtx.currentTime, 0.04);
  }

  if (!locked) {
    pulseLit = false;
    $('#radio-lamp').classList.remove('lit');
    if (cwGain && audioCtx) {
      cwGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.02);
    }
    morseTimerId = setTimeout(scheduleMorseLoop, 250);
    return;
  }

  const morsePlain = decodeB64(GAME_DATA.radio.morseB64);
  const timeline = getMorseTimeline(morsePlain, slowMode);
  const startWall = performance.now();

  if (cwGain && audioCtx) {
    const t0 = audioCtx.currentTime + 0.03;
    cwGain.gain.cancelScheduledValues(t0);
    cwGain.gain.setValueAtTime(0, t0);
    for (const ev of timeline.events) {
      cwGain.gain.setValueAtTime(0, t0 + ev.start);
      cwGain.gain.linearRampToValueAtTime(0.18, t0 + ev.start + 0.008);
      cwGain.gain.setValueAtTime(0.18, t0 + ev.end - 0.008);
      cwGain.gain.linearRampToValueAtTime(0, t0 + ev.end);
    }
  }

  const updateVisualLamp = () => {
    if (!radioActive || !isTargetFreq(currentRadioFreq())) {
      pulseLit = false;
      $('#radio-lamp').classList.remove('lit');
      return;
    }
    const elapsedSec = (performance.now() - startWall) / 1000;
    const activeNow = timeline.events.some((ev) => elapsedSec >= ev.start && elapsedSec <= ev.end);
    pulseLit = activeNow;
    $('#radio-lamp').classList.toggle('lit', activeNow);
    if (elapsedSec < timeline.totalDuration) {
      morseTimerId = setTimeout(updateVisualLamp, 22);
    } else {
      scheduleMorseLoop();
    }
  };
  updateVisualLamp();
}

function drawScopeFrame() {
  const canvas = $('#radio-scope');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#081116';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#18323e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  const locked = isTargetFreq(currentRadioFreq());
  const now = performance.now() / 1000;
  ctx.strokeStyle = locked && pulseLit ? '#5cc4b3' : locked ? '#d8a354' : '#536e82';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    const amp = !radioActive ? 1 : locked ? (pulseLit ? 22 : 3) : 12;
    const y =
      h / 2 +
      (locked && pulseLit
        ? Math.sin(x * 0.25 + now * 22) * amp
        : (Math.sin(x * 0.4 + now * 35) * 0.5 + (Math.random() - 0.5)) * amp);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  if (radioActive) {
    scopeAnimId = requestAnimationFrame(drawScopeFrame);
  }
}

function updateRadioUI() {
  const freq = currentRadioFreq();
  $('#radio-freq-val').textContent = `${freq.toFixed(1)} kHz`;
  const locked = isTargetFreq(freq);
  const badge = $('#radio-carrier-badge');
  badge.textContent = locked ? 'PORTADORA CW ENGANCHADA (680 Hz)' : 'ESTÁTICA ATMOSFÉRICA';
  badge.classList.toggle('locked', locked);
  if (radioActive) scheduleMorseLoop();
}

function startRadioAudio() {
  ensureAudioNodes();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  radioActive = true;
  $('#radio-play-btn').disabled = true;
  $('#radio-stop-btn').disabled = false;
  scheduleMorseLoop();
  cancelAnimationFrame(scopeAnimId);
  drawScopeFrame();
}

function stopRadioAudio() {
  radioActive = false;
  pulseLit = false;
  clearTimeout(morseTimerId);
  cancelAnimationFrame(scopeAnimId);
  const lamp = $('#radio-lamp');
  if (lamp) lamp.classList.remove('lit');
  if (noiseGain && audioCtx) noiseGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.02);
  if (cwGain && audioCtx) cwGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.02);
  const playBtn = $('#radio-play-btn');
  const stopBtn = $('#radio-stop-btn');
  if (playBtn) playBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
  drawScopeFrame();
}

// ============================================================================
// MÓDULO 4: CARTA NÁUTICA INTERACTIVA
// ============================================================================

function rayIntersection(p1, deg1, p2, deg2) {
  const r1 = (deg1 * Math.PI) / 180;
  const r2 = (deg2 * Math.PI) / 180;
  const d1 = { x: Math.sin(r1), y: -Math.cos(r1) };
  const d2 = { x: Math.sin(r2), y: -Math.cos(r2) };
  const det = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(det) < 1e-4) return null;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const t1 = (dx * d2.y - dy * d2.x) / det;
  const t2 = (dx * d1.y - dy * d1.x) / det;
  if (t1 < 5 || t2 < 5) return null;
  return { x: p1.x + t1 * d1.x, y: p1.y + t1 * d1.y };
}

function renderNauticalChart() {
  const svg = $('#nautical-svg');
  const cfg = GAME_DATA.nautical;
  const { originX, originY, cellSize, cols, rows, faro, boya } = cfg;
  const faroDeg = state.nautical.faro;
  const boyaDeg = state.nautical.boya;
  const selectedCell = state.nautical.cell;

  let html = `
    <rect x="0" y="0" width="480" height="420" fill="#091521"/>
    <path d="M 40 28 L 438 28 L 438 118 C 392 110, 355 96, 304 96 C 248 96, 206 132, 160 176 C 118 214, 72 238, 40 282 Z" fill="#172836" stroke="#36536a" stroke-width="1.2"/>
    <text x="115" y="72" font-family="Georgia, serif" font-size="13" fill="#7d9ab1" font-style="italic">Costa de Cabo Valdeira</text>
  `;

  // Cabeceras A–F y 1–6
  cols.forEach((c, ci) => {
    const cx = originX + ci * cellSize + cellSize / 2;
    html += `<text x="${cx}" y="26" text-anchor="middle" font-family="monospace" font-size="13" font-weight="bold" fill="#d8a354">${c}</text>`;
  });
  rows.forEach((r, ri) => {
    const cy = originY + ri * cellSize + cellSize / 2 + 4;
    html += `<text x="38" y="${cy}" text-anchor="middle" font-family="monospace" font-size="13" font-weight="bold" fill="#d8a354">${r}</text>`;
  });

  // Cuadrícula clicable
  rows.forEach((r, ri) => {
    cols.forEach((c, ci) => {
      const id = `${c}${r}`;
      const x = originX + ci * cellSize;
      const y = originY + ri * cellSize;
      const isSel = selectedCell === id;
      html += `
        <rect class="nautical-cell ${isSel ? 'selected' : ''}" data-cell="${id}" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${isSel ? 'rgba(92,196,179,0.28)' : 'rgba(255,255,255,0.01)'}" stroke="#264056" stroke-width="1"/>
        <text x="${x + 6}" y="${y + 15}" font-family="monospace" font-size="10" fill="#6f8da4" pointer-events="none">${id}</text>
      `;
    });
  });

  // Rayos de Faro y Boya
  const fRad = (faroDeg * Math.PI) / 180;
  const bRad = (boyaDeg * Math.PI) / 180;
  const fEndX = faro.x + Math.sin(fRad) * 520;
  const fEndY = faro.y - Math.cos(fRad) * 520;
  const bEndX = boya.x + Math.sin(bRad) * 520;
  const bEndY = boya.y - Math.cos(bRad) * 520;

  html += `<g pointer-events="none">
    <line x1="${faro.x}" y1="${faro.y}" x2="${fEndX.toFixed(1)}" y2="${fEndY.toFixed(1)}" stroke="#d8a354" stroke-width="2" stroke-dasharray="6 4"/>
    <line x1="${boya.x}" y1="${boya.y}" x2="${bEndX.toFixed(1)}" y2="${bEndY.toFixed(1)}" stroke="#5cc4b3" stroke-width="2" stroke-dasharray="6 4"/>
  `;

  const cross = rayIntersection(faro, faroDeg, boya, boyaDeg);
  if (cross && cross.x >= 20 && cross.x <= 460 && cross.y >= 20 && cross.y <= 405) {
    html += `
      <circle cx="${cross.x.toFixed(1)}" cy="${cross.y.toFixed(1)}" r="10" fill="none" stroke="#ffd166" stroke-width="2"/>
      <circle cx="${cross.x.toFixed(1)}" cy="${cross.y.toFixed(1)}" r="3.5" fill="#ffd166"/>
    `;
  }

  // Marcadores de Faro Norte y Boya Este
  html += `
    <circle cx="${faro.x}" cy="${faro.y}" r="6" fill="#d8a354" stroke="#091521" stroke-width="2"/>
    <text x="${faro.x + 10}" y="${faro.y - 6}" font-family="monospace" font-size="11" font-weight="bold" fill="#f7d59c">F (Faro Norte)</text>
    <polygon points="${boya.x},${boya.y - 7} ${boya.x + 7},${boya.y + 5} ${boya.x - 7},${boya.y + 5}" fill="#5cc4b3" stroke="#091521" stroke-width="1.5"/>
    <text x="${boya.x - 10}" y="${boya.y + 18}" text-anchor="end" font-family="monospace" font-size="11" font-weight="bold" fill="#99e2d5">B (Boya Este)</text>
  </g>`;

  svg.innerHTML = html;

  svg.querySelectorAll('.nautical-cell').forEach((rect) => {
    rect.addEventListener('click', () => {
      state.nautical.cell = rect.dataset.cell;
      saveState();
      renderNauticalControls();
      renderNauticalChart();
    });
  });
}

function renderNauticalControls() {
  const { faro, boya, cell } = state.nautical;
  $('#faro-bearing').value = faro;
  $('#faro-bearing-num').value = faro;
  $('#faro-bearing-val').textContent = `${faro}°`;
  $('#boya-bearing').value = boya;
  $('#boya-bearing-num').value = boya;
  $('#boya-bearing-val').textContent = `${boya}°`;
  $('#nautical-selected-cell').textContent = cell || 'Ninguno (clic en cuadrícula)';
  $('#nautical-preview-code').textContent = `${faro}-${boya}-${cell || '?'}`;
}

// ============================================================================
// MÓDULO 5: CONSOLA DE RELÉS DE BÓVEDA CERO
// ============================================================================

function renderRelaysPanel() {
  const container = $('#relays-switches');
  container.innerHTML = '';

  state.relays.bits.forEach((bit, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `relay-switch ${bit ? 'on' : ''}`;
    btn.dataset.relayIdx = String(idx);
    btn.setAttribute('aria-pressed', bit ? 'true' : 'false');
    btn.innerHTML = `
      <span class="relay-id">R${idx + 1}</span>
      <span class="relay-state">${bit ? '■ ACTIVO' : '□ INACTIVO'}</span>
    `;
    btn.addEventListener('click', () => {
      state.relays.bits[idx] = state.relays.bits[idx] ? 0 : 1;
      saveState();
      renderRelaysPanel();
    });
    container.appendChild(btn);
  });

  document.querySelectorAll('.phase-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.phase === state.relays.phase);
  });

  const activeCount = state.relays.bits.reduce((a, b) => a + b, 0);
  const sumIndices = state.relays.bits.reduce((acc, b, idx) => acc + (b ? idx + 1 : 0), 0);
  $('#relay-active-count').textContent = String(activeCount);
  $('#relay-index-sum').textContent = `${sumIndices} V`;
  $('#relay-preview-code').textContent = `${state.relays.bits.join('')}-${state.relays.phase}`;
}

// ============================================================================
// EPÍLOGO Y DIARIO
// ============================================================================

function renderJournalModal() {
  const list = $('#journal-entries');
  list.innerHTML = '';
  if (state.journal.length === 0) {
    list.innerHTML = '<p class="journal-empty">Aún no hay descubrimientos registrados.</p>';
    return;
  }
  for (const entry of state.journal) {
    const div = document.createElement('div');
    div.className = 'journal-item';
    div.innerHTML = `<div class="j-time">${entry.time}</div><strong></strong><div></div>`;
    div.querySelector('strong').textContent = entry.title;
    div.querySelector('div:last-child').textContent = entry.detail;
    list.appendChild(div);
  }
}

function renderEpilogue() {
  const epi = JSON.parse(decodeB64(GAME_DATA.epilogueB64));
  $('#epilogue-eyebrow').textContent = epi.heading;
  $('#epilogue-heading').textContent = GAME_DATA.meta.title;
  $('#epilogue-lead').textContent = epi.lead;
  $('#final-time').textContent = formatDurationMMSS(getElapsedMs());
  $('#final-hints').textContent = String(totalHintsCount());
  $('#final-solved').textContent = `${state.solvedIds.length} / ${GAME_DATA.puzzles.length}`;

  const copy = $('#epilogue-paragraphs');
  copy.innerHTML = '';
  for (const p of epi.paragraphs) {
    const el = document.createElement('p');
    el.textContent = p;
    copy.appendChild(el);
  }
}

function renderAll() {
  const intro = $('#intro-screen');
  const workspace = $('#workspace-screen');
  const epilogue = $('#epilogue-screen');

  renderTopbar();

  if (!state.started) {
    intro.hidden = false;
    workspace.hidden = true;
    epilogue.hidden = true;
    return;
  }

  if (state.completed) {
    intro.hidden = true;
    workspace.hidden = true;
    epilogue.hidden = false;
    renderEpilogue();
    return;
  }

  intro.hidden = true;
  workspace.hidden = false;
  epilogue.hidden = true;

  renderEnvelopeBanner();
  renderTabsAvailability();
  renderActsRail();
  renderPuzzlesBoard();
  renderArchiveChips();
  updateRadioUI();
  renderNauticalControls();
  renderNauticalChart();
  renderRelaysPanel();
}

// ============================================================================
// INICIALIZACIÓN Y EVENT LISTENERS
// ============================================================================

function resetGame() {
  stopRadioAudio();
  for (const k of Object.keys(draftInputs)) delete draftInputs[k];
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  $('#archive-viewer').hidden = true;
  $('#archive-feedback').textContent = '';
  $('#nautical-feedback').textContent = '';
  $('#relays-feedback').textContent = '';
  renderAll();
}

function wireEvents() {
  $('#btn-start').addEventListener('click', () => {
    state.started = true;
    state.paused = false;
    state.elapsedBeforePauseMs = 0;
    state.lastResumeAt = Date.now();
    appendJournal('Sesión iniciada', `Fer y Lucía abren el Sobre 1 (${GAME_DATA.meta.title}).`);
    saveState();
    renderAll();
  });

  $('#btn-pause').addEventListener('click', () => {
    if (!state.started || state.completed) return;
    if (state.paused) {
      state.paused = false;
      state.lastResumeAt = Date.now();
    } else {
      state.elapsedBeforePauseMs = getElapsedMs();
      state.lastResumeAt = null;
      state.paused = true;
    }
    saveState();
    renderTopbar();
  });

  $('#btn-dismiss-banner').addEventListener('click', () => {
    state.bannerDismissedFor = currentMaxEnvelope();
    saveState();
    renderEnvelopeBanner();
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Terminal de Archivo
  $('#archive-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleArchiveQuery($('#archive-input').value);
  });

  // Radio
  $('#radio-slider').addEventListener('input', updateRadioUI);
  $('#radio-step-down').addEventListener('click', () => {
    const sl = $('#radio-slider');
    sl.value = String(Math.max(Number(sl.min), Number(sl.value) - 0.5));
    updateRadioUI();
  });
  $('#radio-step-up').addEventListener('click', () => {
    const sl = $('#radio-slider');
    sl.value = String(Math.min(Number(sl.max), Number(sl.value) + 0.5));
    updateRadioUI();
  });
  $('#radio-slow-mode').addEventListener('change', () => {
    if (radioActive) scheduleMorseLoop();
  });
  $('#radio-play-btn').addEventListener('click', startRadioAudio);
  $('#radio-stop-btn').addEventListener('click', stopRadioAudio);

  // Carta Náutica
  const setFaro = (val) => {
    const clamped = Math.max(0, Math.min(359, Number(val) || 0));
    state.nautical.faro = clamped;
    saveState();
    renderNauticalControls();
    renderNauticalChart();
  };
  const setBoya = (val) => {
    const clamped = Math.max(0, Math.min(359, Number(val) || 0));
    state.nautical.boya = clamped;
    saveState();
    renderNauticalControls();
    renderNauticalChart();
  };
  $('#faro-bearing').addEventListener('input', (e) => setFaro(e.target.value));
  $('#faro-bearing-num').addEventListener('input', (e) => setFaro(e.target.value));
  $('#boya-bearing').addEventListener('input', (e) => setBoya(e.target.value));
  $('#boya-bearing-num').addEventListener('input', (e) => setBoya(e.target.value));

  $('#btn-submit-nautical').addEventListener('click', () => {
    const fb = $('#nautical-feedback');
    if (!state.nautical.cell) {
      fb.className = 'feedback-line err';
      fb.textContent = 'Haz clic en el cuadrante exacto (A1–F6) de la carta antes de confirmar.';
      return;
    }
    const candidate = `${state.nautical.faro}-${state.nautical.boya}-${state.nautical.cell}`;
    const ok = attemptSolvePuzzle('e9', candidate);
    if (ok) {
      fb.className = 'feedback-line ok';
      fb.textContent = 'Triangulación verificada. Volved a la pestaña Expediente y Retos.';
    } else {
      fb.className = 'feedback-line err';
      fb.textContent = 'Los rumbos o el cuadrante seleccionado no coinciden con la señal óptica.';
    }
  });

  // Consola de Relés
  document.querySelectorAll('.phase-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.relays.phase = btn.dataset.phase;
      saveState();
      renderRelaysPanel();
    });
  });

  $('#btn-submit-relays').addEventListener('click', () => {
    const fb = $('#relays-feedback');
    const code = `${state.relays.bits.join('')}-${state.relays.phase}`;
    const ok = attemptSolvePuzzle('e11', code);
    if (ok) {
      fb.className = 'feedback-line ok';
      fb.textContent = 'Bóveda Cero energizada. Meta-Puzle Final desbloqueado en Expediente y Retos.';
    } else {
      fb.className = 'feedback-line err';
      fb.textContent = 'Enclavamiento rechazado. Revisa las cuatro reglas de la Hoja 4B y la fase útil (Hoja 4C).';
    }
  });

  // Modales Diario & Reinicio
  const openJournal = () => {
    renderJournalModal();
    $('#journal-modal').showModal();
  };
  $('#btn-journal').addEventListener('click', openJournal);
  $('#btn-view-journal-end').addEventListener('click', openJournal);
  $('#btn-close-journal').addEventListener('click', () => $('#journal-modal').close());

  const askReset = () => {
    if ($('#journal-modal').open) $('#journal-modal').close();
    openConfirmDialog(
      'Reiniciar partida',
      'Se borrará todo el progreso guardado de Fer y Lucía y el temporizador volverá a 120:00. ¿Continuar?',
      resetGame
    );
  };
  $('#btn-reset-game').addEventListener('click', askReset);
  $('#btn-reset-end').addEventListener('click', askReset);

  setInterval(() => {
    if (state.started && !state.completed && !state.paused) {
      updateTimerDisplay();
    }
  }, 1000);
}

if (typeof document !== 'undefined') {
  initIntro();
  wireEvents();
  renderAll();
}
