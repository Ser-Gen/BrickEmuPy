import { WebAudioToneGenerator } from './audio/webAudioToneGenerator.js';
import { EmulatorEngine } from './core/emulatorEngine.js';
import { QT_KEY_TO_CODE } from './core/constants.js';
import { getPresets, loadFromLocalFiles, loadPreset } from './app/brickLoader.js';
import { DisplayRenderer } from './ui/displayRenderer.js';

const app = document.getElementById('app');
app.innerHTML = `
  <div class="layout">
    <header class="mobile-toolbar">
      <button id="mobileMenuBtn" class="mobile-btn" aria-controls="controlDrawer" aria-expanded="false">Menu</button>
      <button id="mobileRunPauseBtn" class="mobile-btn">Run</button>
      <button id="mobileMuteBtn" class="mobile-btn">Mute</button>
    </header>

    <aside id="controlDrawer" class="panel" aria-hidden="true" tabindex="-1">
      <h1>BrickEmuPy Web (MVP)</h1>
      <label>Preset ROM</label>
      <select id="preset"></select>
      <div id="presetWarning" class="preset-warning hidden" role="status" aria-live="polite"></div>
      <button id="loadPreset">Load Preset</button>
      <label>Local files (.brick + .bin + .srom + .svg)</label>
      <input id="localFiles" type="file" multiple />
      <button id="loadLocal">Load Local</button>

      <hr />
      <button id="run">Run</button>
      <button id="pause">Pause</button>
      <button id="reset">Reset</button>

      <label>Speed</label>
      <select id="speed">
        <option value="1">1x</option>
        <option value="2">2x</option>
        <option value="4">4x</option>
      </select>

      <label>Theme</label>
      <select id="theme">
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>

      <button id="controlsBtn">Controls</button>
      <button id="mute">Mute</button>
      <p id="status">Ready</p>
    </aside>

    <main class="screen">
      <div id="faceContainer"></div>
    </main>
  </div>

  <div id="drawerScrim" class="drawer-scrim hidden" aria-hidden="true"></div>

  <div id="controlsModal" class="modal hidden" aria-hidden="true">
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="controlsTitle">
      <div class="modal-head">
        <h2 id="controlsTitle">Keyboard Controls</h2>
        <button id="controlsClose" class="modal-close" type="button">Close</button>
      </div>
      <div class="modal-content">
        <table class="controls-table">
          <thead>
            <tr><th>Action</th><th>Keys</th></tr>
          </thead>
          <tbody id="controlsBody"></tbody>
        </table>
      </div>
    </div>
  </div>
`;

const presetSelect = document.getElementById('preset');
const presetWarning = document.getElementById('presetWarning');
const loadPresetBtn = document.getElementById('loadPreset');
const localFilesInput = document.getElementById('localFiles');
const loadLocalBtn = document.getElementById('loadLocal');
const runBtn = document.getElementById('run');
const pauseBtn = document.getElementById('pause');
const resetBtn = document.getElementById('reset');
const speedSelect = document.getElementById('speed');
const themeSelect = document.getElementById('theme');
const controlsBtn = document.getElementById('controlsBtn');
const controlsModal = document.getElementById('controlsModal');
const controlsClose = document.getElementById('controlsClose');
const controlsBody = document.getElementById('controlsBody');
const muteBtn = document.getElementById('mute');
const statusEl = document.getElementById('status');
const faceContainer = document.getElementById('faceContainer');
const controlDrawer = document.getElementById('controlDrawer');
const drawerScrim = document.getElementById('drawerScrim');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileRunPauseBtn = document.getElementById('mobileRunPauseBtn');
const mobileMuteBtn = document.getElementById('mobileMuteBtn');

const presets = getPresets();
const presetById = new Map(presets.map((p) => [p.id, p]));

for (const p of presets) {
  const opt = document.createElement('option');
  opt.value = p.id;
  opt.textContent = p.noGuarantee ? `${p.title} [no guarantee]` : p.title;
  presetSelect.appendChild(opt);
}

const renderer = new DisplayRenderer(faceContainer);
const toneGenerator = new WebAudioToneGenerator();
let engine = null;
let currentConfig = null;
let muted = false;
let drawerOpen = false;
let isMobileMode = false;
let lastFocusedBeforeDrawer = null;

const pressedCodes = new Set();
const THEME_KEY = 'brick_theme_mode';
const mediaTheme = window.matchMedia('(prefers-color-scheme: dark)');
const mobileViewportQuery = window.matchMedia('(max-width: 980px) and (orientation: portrait)');

const QT_KEY_TO_LABEL = new Map([
  [32, 'Space'],
  [49, '1'],
  [50, '2'],
  [51, '3'],
  [65, 'A'],
  [68, 'D'],
  [83, 'S'],
  [16777234, 'Arrow Left'],
  [16777235, 'Arrow Up'],
  [16777236, 'Arrow Right'],
  [16777237, 'Arrow Down'],
  [16777220, 'Enter'],
  [16777216, 'Escape'],
  [67, 'C'],
]);

function addMediaChangeListener(query, handler) {
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', handler);
  } else if (typeof query.addListener === 'function') {
    query.addListener(handler);
  }
}

function setStatus(s) {
  statusEl.textContent = s;
}

function setPresetWarning(message) {
  if (!message) {
    presetWarning.classList.add('hidden');
    presetWarning.textContent = '';
    return;
  }
  presetWarning.textContent = message;
  presetWarning.classList.remove('hidden');
}

function updatePresetWarningForSelection() {
  const selected = presetById.get(presetSelect.value);
  if (selected?.noGuarantee) {
    setPresetWarning('T7741 preset selected: operation is not guaranteed.');
  } else {
    setPresetWarning('');
  }
}

function applyTheme(mode) {
  const resolved = mode === 'system' ? (mediaTheme.matches ? 'dark' : 'light') : mode;
  document.documentElement.dataset.theme = resolved;
}

function setThemeMode(mode) {
  localStorage.setItem(THEME_KEY, mode);
  themeSelect.value = mode;
  applyTheme(mode);
}

function toActionLabel(buttonId) {
  const cleaned = buttonId.replace(/^btn/, '');
  return cleaned
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

function renderControlsTable(buttons) {
  controlsBody.innerHTML = '';
  const rows = Object.entries(buttons).map(([name, value]) => {
    const keys = (value.hot_keys || []).map((k) => QT_KEY_TO_LABEL.get(k) || `KeyCode ${k}`);
    return { name: toActionLabel(name), keys: keys.join(', ') };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name));
  for (const row of rows) {
    const tr = document.createElement('tr');
    const tdAction = document.createElement('td');
    const tdKeys = document.createElement('td');
    tdAction.textContent = row.name;
    tdKeys.textContent = row.keys || '—';
    tr.appendChild(tdAction);
    tr.appendChild(tdKeys);
    controlsBody.appendChild(tr);
  }
}

function updateRunPauseUI() {
  const running = Boolean(engine && engine.running);
  mobileRunPauseBtn.textContent = running ? 'Pause' : 'Run';
}

function updateMuteUI() {
  muteBtn.textContent = muted ? 'Unmute' : 'Mute';
  mobileMuteBtn.textContent = muted ? 'Unmute' : 'Mute';
}

function setDrawerOpen(open, restoreFocus = true) {
  if (!isMobileMode) {
    open = false;
  }

  drawerOpen = open;
  document.documentElement.dataset.drawerOpen = open ? 'true' : 'false';
  mobileMenuBtn.setAttribute('aria-expanded', String(open));
  controlDrawer.setAttribute('aria-hidden', String(!open));

  drawerScrim.classList.toggle('hidden', !open);
  drawerScrim.setAttribute('aria-hidden', String(!open));

  if (open) {
    lastFocusedBeforeDrawer = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    controlDrawer.focus();
  } else {
    document.body.style.overflow = '';
    if (restoreFocus && lastFocusedBeforeDrawer) {
      lastFocusedBeforeDrawer.focus();
    }
  }
}

function updateViewportMode() {
  isMobileMode = mobileViewportQuery.matches;
  document.documentElement.dataset.viewportMode = isMobileMode ? 'mobile' : 'desktop';
  if (!isMobileMode) {
    setDrawerOpen(false, false);
  }
}

function openControlsModal() {
  controlsModal.classList.remove('hidden');
  controlsModal.setAttribute('aria-hidden', 'false');
}

function closeControlsModal() {
  controlsModal.classList.add('hidden');
  controlsModal.setAttribute('aria-hidden', 'true');
}

function mapButtonsByCode(buttons) {
  const map = new Map();
  for (const button of Object.values(buttons)) {
    for (const qtKey of button.hot_keys || []) {
      const code = QT_KEY_TO_CODE.get(qtKey);
      if (!code) continue;
      if (!map.has(code)) map.set(code, []);
      map.get(code).push(button);
    }
  }
  return map;
}

async function handleRun() {
  if (!engine) return;
  await toneGenerator.ensureUnlocked();
  toneGenerator.rebaseTimeline(engine.emuNowSec());
  engine.start();
  updateRunPauseUI();
  setStatus('Running');
}

function handlePause() {
  if (!engine) return;
  engine.pause();
  updateRunPauseUI();
  setStatus('Paused');
}

function handleToggleRunPause() {
  if (!engine) return;
  if (engine.running) {
    handlePause();
  } else {
    handleRun();
  }
}

function handleReset() {
  if (!engine) return;
  engine.reset();
  renderer.render(engine.getFrame());
  setStatus('Reset');
}

function handleToggleMute() {
  muted = !muted;
  toneGenerator.setMuted(muted);
  updateMuteUI();
}

let keyMap = new Map();

async function boot(bundle) {
  const { config, files, faceUrl } = bundle;
  currentConfig = config;
  if (engine) {
    engine.pause();
  }

  await renderer.loadFace(faceUrl);
  keyMap = mapButtonsByCode(config.buttons);

  engine = new EmulatorEngine(config, files, toneGenerator);
  engine.onFrame = (frame) => renderer.render(frame);

  renderer.bindButtons(
    config.buttons,
    (button) => engine.pressButton(button),
    (button) => engine.releaseButton(button)
  );

  renderer.render(engine.getFrame());
  renderControlsTable(config.buttons);
  if (config.core === 'T7741') {
    setPresetWarning('T7741 device loaded: operation is not guaranteed.');
  } else {
    updatePresetWarningForSelection();
  }
  updateRunPauseUI();
  setStatus(`Loaded: ${config.core}`);
}

loadPresetBtn.addEventListener('click', async () => {
  try {
    const bundle = await loadPreset(presetSelect.value);
    await boot(bundle);
    if (isMobileMode) setDrawerOpen(false, false);
  } catch (e) {
    setStatus(`Error: ${String(e.message || e)}`);
  }
});

loadLocalBtn.addEventListener('click', async () => {
  try {
    const bundle = await loadFromLocalFiles(localFilesInput.files);
    await boot(bundle);
    if (isMobileMode) setDrawerOpen(false, false);
  } catch (e) {
    setStatus(`Error: ${String(e.message || e)}`);
  }
});

runBtn.addEventListener('click', handleRun);
pauseBtn.addEventListener('click', handlePause);
resetBtn.addEventListener('click', handleReset);
mobileRunPauseBtn.addEventListener('click', handleToggleRunPause);

speedSelect.addEventListener('change', () => {
  if (!engine) return;
  engine.setSpeed(Number(speedSelect.value));
});

presetSelect.addEventListener('change', () => {
  updatePresetWarningForSelection();
});

muteBtn.addEventListener('click', handleToggleMute);
mobileMuteBtn.addEventListener('click', handleToggleMute);

controlsBtn.addEventListener('click', () => {
  if (isMobileMode) setDrawerOpen(false, false);
  openControlsModal();
});

controlsClose.addEventListener('click', () => {
  closeControlsModal();
});

controlsModal.addEventListener('click', (event) => {
  if (event.target === controlsModal) {
    closeControlsModal();
  }
});

mobileMenuBtn.addEventListener('click', () => {
  setDrawerOpen(!drawerOpen);
});

drawerScrim.addEventListener('click', () => {
  setDrawerOpen(false);
});

themeSelect.addEventListener('change', () => {
  setThemeMode(themeSelect.value);
});

addMediaChangeListener(mediaTheme, () => {
  const mode = localStorage.getItem(THEME_KEY) || 'system';
  if (mode === 'system') {
    applyTheme(mode);
  }
});

addMediaChangeListener(mobileViewportQuery, () => {
  updateViewportMode();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!controlsModal.classList.contains('hidden')) {
      closeControlsModal();
      return;
    }
    if (drawerOpen) {
      setDrawerOpen(false);
      return;
    }
  }

  if (!engine || !currentConfig || event.repeat) return;
  const buttons = keyMap.get(event.code);
  if (!buttons) return;
  pressedCodes.add(event.code);
  for (const button of buttons) {
    engine.pressButton(button);
  }
});

window.addEventListener('keyup', (event) => {
  if (!engine || !currentConfig || !pressedCodes.has(event.code)) return;
  const buttons = keyMap.get(event.code);
  if (!buttons) return;
  pressedCodes.delete(event.code);
  for (const button of buttons) {
    engine.releaseButton(button);
  }
});

updateViewportMode();
setThemeMode(localStorage.getItem(THEME_KEY) || 'system');
updateMuteUI();
updatePresetWarningForSelection();
loadPresetBtn.click();
