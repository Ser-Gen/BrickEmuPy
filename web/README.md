# BrickEmuPy Web MVP (No build tools)

Browser MVP for `HT943`, `SPLB20`, and `T7741` using plain `HTML + CSS + JS` modules.

## Run

From repository root:

```bash
cd web
python3 -m http.server 8080
```

Open:

`http://localhost:8080/`

## Implemented

- Browser runtime for `HT943`, `SPLB20`, and `T7741` cores.
- Preset ROM loading for available `HT943` devices:
  - `E23PlusMarkII96in1`
  - `E88_8in1`
  - `GA888`
  - `Keychain55in1`
  - `KeychainPinBall`
  - `SpaceIntruderTK150I`
- Preset ROM loading for available `SPLB20` virtual pets:
  - `Apollo2in1`
  - `ElfinTwins`
- Preset ROM loading for available `T7741` devices:
  - `AnimestSpaceCobra`
  - `DorayakiHouse`
  - `DrSlumpAraleNchaBycha`
  - `GakkenSoccer`
  - `IsogeDoraemon`
  - `JumpingBoy`
  - `ParmanDaiPinch`
  - `Pengo`
  - `PowerFishing`
  - `SpicaDArtagnan`
  - `TomJerryPrank`
- Local file loading (`.brick + .bin + .srom + .svg`).
- SVG segment rendering.
- Mouse + keyboard controls from `.brick` hotkeys.
- Web Audio tone playback.
- Run/Pause/Reset/Speed/Mute controls.
- Theme switcher (`System/Light/Dark`).
- Controls help modal with keyboard mapping.

## Mobile portrait mode

- On narrow portrait screens (`<=980px` + portrait), UI switches to a game-first mode.
- Main game area occupies most of viewport height.
- Settings panel becomes a drawer opened by `Menu` in top toolbar.
- Toolbar includes quick `Run/Pause` and `Mute` actions.
- SVG button touch targets are expanded for easier tapping.

## Notes

- Current web build supports `HT943`, `SPLB20`, and `T7741` cores.
- `T7741` presets are currently marked as **operation not guaranteed**.
  In UI they are shown in preset select as `[no guarantee]` and a warning banner is displayed when selected/loaded.
- `MameGalaxian` and `MameTamagotch` are intentionally not in presets because they are distributed without ROM in this repository.
- Audio starts after user interaction (browser autoplay policy).
- Mobile mode keeps emulator core/audio logic unchanged; only UI/input layer adapts.
