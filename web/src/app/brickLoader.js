const PRESETS = [
  {
    id: 'e23plus',
    title: 'E23 Plus Mark II 96 in 1 (HT943)',
    brickUrl: './public/assets/E23PlusMarkII96in1.brick',
    noGuarantee: false,
  },
  {
    id: 'e88',
    title: 'E-88 8 in 1 (HT943)',
    brickUrl: './public/assets/E88_8in1.brick',
    noGuarantee: false,
  },
  {
    id: 'ga888',
    title: 'GA888 (HT943)',
    brickUrl: './public/assets/GA888.brick',
    noGuarantee: false,
  },
  {
    id: 'keychain55',
    title: 'Keychain 55 in 1 (HT943)',
    brickUrl: './public/assets/Keychain55in1.brick',
    noGuarantee: false,
  },
  {
    id: 'keychainpinball',
    title: 'Keychain PinBall (HT943)',
    brickUrl: './public/assets/KeychainPinBall.brick',
    noGuarantee: false,
  },
  {
    id: 'spaceintruder',
    title: 'Space Intruder TK-150I (HT943)',
    brickUrl: './public/assets/SpaceIntruderTK150I.brick',
    noGuarantee: false,
  },
  {
    id: 'apollo2in1',
    title: 'Apollo 2 in 1 Virtual Pet (SPLB20)',
    brickUrl: './public/assets/Apollo2in1.brick',
    noGuarantee: false,
  },
  {
    id: 'elfintwins',
    title: 'Elfin Twins GM-021 (SPLB20)',
    brickUrl: './public/assets/ElfinTwins.brick',
    noGuarantee: false,
  },
  {
    id: 'animestspacecobra',
    title: 'Animest Space Cobra (T7741)',
    brickUrl: './public/assets/AnimestSpaceCobra.brick',
    noGuarantee: true,
  },
  {
    id: 'dorayakihouse',
    title: 'Animest Dorayaki House (T7741)',
    brickUrl: './public/assets/DorayakiHouse.brick',
    noGuarantee: true,
  },
  {
    id: 'drslump',
    title: 'Dr. Slump Arale Ncha Bycha (T7741)',
    brickUrl: './public/assets/DrSlumpAraleNchaBycha.brick',
    noGuarantee: true,
  },
  {
    id: 'gakkensoccer',
    title: 'Gakken Soccer (T7741)',
    brickUrl: './public/assets/GakkenSoccer.brick',
    noGuarantee: true,
  },
  {
    id: 'isogedoraemon',
    title: 'Isoge Doraemon (T7741)',
    brickUrl: './public/assets/IsogeDoraemon.brick',
    noGuarantee: true,
  },
  {
    id: 'jumpingboy',
    title: 'Jumping Boy (T7741)',
    brickUrl: './public/assets/JumpingBoy.brick',
    noGuarantee: true,
  },
  {
    id: 'parmandaipinch',
    title: 'Parman Dai-Pinch (T7741)',
    brickUrl: './public/assets/ParmanDaiPinch.brick',
    noGuarantee: true,
  },
  {
    id: 'pengo',
    title: 'Pengo (T7741)',
    brickUrl: './public/assets/Pengo.brick',
    noGuarantee: true,
  },
  {
    id: 'powerfishing',
    title: 'Power Fishing (T7741)',
    brickUrl: './public/assets/PowerFishing.brick',
    noGuarantee: true,
  },
  {
    id: 'spicadartagnan',
    title: "Spica D'Artagnan (T7741)",
    brickUrl: './public/assets/SpicaDArtagnan.brick',
    noGuarantee: true,
  },
  {
    id: 'tomjerryprank',
    title: 'Tom & Jerry Prank (T7741)',
    brickUrl: './public/assets/TomJerryPrank.brick',
    noGuarantee: true,
  },
];

function basename(p) {
  return p.split('/').pop();
}

function normalizePath(p) {
  return p.replace(/^\.\//, '');
}

async function fetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed: ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed: ${url}`);
  return await r.text();
}

export function getPresets() {
  return PRESETS;
}

export async function loadPreset(presetId) {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) {
    throw new Error('ERR_BRICK_PARSE');
  }

  const brickText = await fetchText(preset.brickUrl);
  let config;
  try {
    config = JSON.parse(brickText);
  } catch {
    throw new Error('ERR_BRICK_PARSE');
  }

  const files = new Map();
  const romPath = config.mask_options.rom_path;
  const sromPath = config.mask_options.sound_rom_path;
  const facePath = config.face_path;

  const romUrl = `./public/assets/${basename(romPath)}`;
  const faceUrl = `./public/assets/${basename(facePath)}`;

  files.set(romPath, await fetchBytes(romUrl));
  files.set(normalizePath(romPath), files.get(romPath));
  files.set(basename(romPath), files.get(romPath));

  if (sromPath) {
    const sromUrl = `./public/assets/${basename(sromPath)}`;
    files.set(sromPath, await fetchBytes(sromUrl));
    files.set(normalizePath(sromPath), files.get(sromPath));
    files.set(basename(sromPath), files.get(sromPath));
  }

  return { config, files, faceUrl };
}

export async function loadFromLocalFiles(fileList) {
  const filesArr = Array.from(fileList);
  const byName = new Map(filesArr.map((f) => [f.name, f]));
  const brickFile = filesArr.find((f) => f.name.toLowerCase().endsWith('.brick'));
  if (!brickFile) {
    throw new Error('ERR_BRICK_PARSE');
  }

  let config;
  try {
    config = JSON.parse(await brickFile.text());
  } catch {
    throw new Error('ERR_BRICK_PARSE');
  }

  const romName = basename(config.mask_options.rom_path);
  const sromName = basename(config.mask_options.sound_rom_path || '');
  const faceName = basename(config.face_path || '');

  const romFile = byName.get(romName);
  if (!romFile) {
    throw new Error('ERR_ROM_MISSING');
  }

  const sromFile = sromName ? byName.get(sromName) : null;
  if (sromName && !sromFile) {
    throw new Error('ERR_SROM_MISSING');
  }

  const faceFile = byName.get(faceName);
  if (!faceFile) {
    throw new Error('ERR_FACE_MISSING');
  }

  const files = new Map();
  const romBytes = new Uint8Array(await romFile.arrayBuffer());
  files.set(config.mask_options.rom_path, romBytes);
  files.set(normalizePath(config.mask_options.rom_path), romBytes);
  files.set(romName, romBytes);

  const sromBytes = sromFile ? new Uint8Array(await sromFile.arrayBuffer()) : new Uint8Array();
  if (config.mask_options.sound_rom_path) {
    files.set(config.mask_options.sound_rom_path, sromBytes);
    files.set(normalizePath(config.mask_options.sound_rom_path), sromBytes);
  }
  if (sromName) {
    files.set(sromName, sromBytes);
  }

  const faceUrl = URL.createObjectURL(faceFile);
  return { config, files, faceUrl };
}

export function resolveBinary(files, path) {
  if (files.has(path)) return files.get(path);
  const normalized = normalizePath(path);
  if (files.has(normalized)) return files.get(normalized);
  const base = basename(path);
  if (files.has(base)) return files.get(base);
  return null;
}
