const SVG_NS = 'http://www.w3.org/2000/svg';

function getUnitPerPixel(svg) {
  const ctm = svg.getScreenCTM();
  if (!ctm) {
    return { x: 1, y: 1 };
  }
  const x = ctm.a !== 0 ? 1 / Math.abs(ctm.a) : 1;
  const y = ctm.d !== 0 ? 1 / Math.abs(ctm.d) : 1;
  return { x, y };
}

export class DisplayRenderer {
  constructor(container) {
    this.container = container;
    this.svgRoot = null;
    this.segments = [];
    this.buttonHandlers = [];
  }

  async loadFace(faceUrl) {
    this.container.innerHTML = '';
    const res = await fetch(faceUrl);
    if (!res.ok) {
      throw new Error(`Cannot load SVG: ${faceUrl}`);
    }

    const svgText = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const parsedSvg = doc.documentElement;
    if (!parsedSvg || parsedSvg.tagName.toLowerCase() !== 'svg') {
      throw new Error('Invalid SVG document');
    }

    const svg = document.importNode(parsedSvg, true);
    svg.classList.add('face-svg');
    svg.style.background = 'transparent';
    svg.style.display = 'block';
    this.container.appendChild(svg);
    this.svgRoot = svg;

    this.segments = [];
    for (let bit = 0; bit < 8; bit += 1) {
      for (let nibble = 0; nibble < 256; nibble += 1) {
        const id = `${nibble}_${bit}`;
        const el = this.container.querySelector(`[id="${id}"]`);
        if (el) {
          this.segments.push({ nibble, bit, el, opacity: Number(el.style.opacity || 0) || 0 });
        }
      }
    }
  }

  _attachPointerHandlers(target, value, onPress, onRelease) {
    const activePointers = new Set();

    const ensurePress = (pointerId) => {
      if (activePointers.has(pointerId)) return;
      activePointers.add(pointerId);
      onPress(value);
    };

    const ensureRelease = (pointerId) => {
      if (!activePointers.has(pointerId)) return;
      activePointers.delete(pointerId);
      onRelease(value);
    };

    const onPointerDown = (e) => {
      e.preventDefault();
      if (typeof target.setPointerCapture === 'function') {
        try {
          target.setPointerCapture(e.pointerId);
        } catch (_) {
          // Ignore capture errors for unsupported pointer types.
        }
      }
      ensurePress(e.pointerId);
    };

    const onPointerUp = (e) => {
      e.preventDefault();
      ensureRelease(e.pointerId);
    };

    const onPointerCancel = (e) => {
      e.preventDefault();
      ensureRelease(e.pointerId);
    };

    const onLostCapture = (e) => {
      e.preventDefault();
      ensureRelease(e.pointerId);
    };

    const onPointerLeave = (e) => {
      if (e.buttons !== 0) return;
      e.preventDefault();
      ensureRelease(e.pointerId);
    };

    target.addEventListener('pointerdown', onPointerDown);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointercancel', onPointerCancel);
    target.addEventListener('lostpointercapture', onLostCapture);
    target.addEventListener('pointerleave', onPointerLeave);

    return () => {
      for (const pointerId of activePointers) {
        onRelease(value);
      }
      activePointers.clear();

      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerCancel);
      target.removeEventListener('lostpointercapture', onLostCapture);
      target.removeEventListener('pointerleave', onPointerLeave);
    };
  }

  _createTouchHitArea(el, minPx = 52) {
    if (!this.svgRoot || typeof el.getBBox !== 'function') {
      return null;
    }

    const bbox = el.getBBox();
    if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
      return null;
    }

    const unitPerPx = getUnitPerPixel(this.svgRoot);
    const minWidthUnits = minPx * unitPerPx.x;
    const minHeightUnits = minPx * unitPerPx.y;

    const expandX = Math.max(0, (minWidthUnits - bbox.width) / 2);
    const expandY = Math.max(0, (minHeightUnits - bbox.height) / 2);

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(bbox.x - expandX));
    rect.setAttribute('y', String(bbox.y - expandY));
    rect.setAttribute('width', String(bbox.width + expandX * 2));
    rect.setAttribute('height', String(bbox.height + expandY * 2));
    rect.setAttribute('fill', 'transparent');
    rect.setAttribute('pointer-events', 'all');
    rect.setAttribute('data-hit-area', 'true');
    rect.style.cursor = 'pointer';

    const rx = Number(el.getAttribute('rx') || 0);
    const ry = Number(el.getAttribute('ry') || 0);
    if (rx > 0) rect.setAttribute('rx', String(rx + expandX));
    if (ry > 0) rect.setAttribute('ry', String(ry + expandY));

    if (el.parentNode) {
      el.parentNode.insertBefore(rect, el.nextSibling);
    } else {
      this.svgRoot.appendChild(rect);
    }

    return rect;
  }

  bindButtons(buttons, onPress, onRelease) {
    this.buttonHandlers.forEach((fn) => fn());
    this.buttonHandlers = [];

    for (const [name, value] of Object.entries(buttons)) {
      const el = this.container.querySelector(`[id="${name}"]`);
      if (!el) continue;

      el.style.cursor = 'pointer';

      const cleanupMain = this._attachPointerHandlers(el, value, onPress, onRelease);
      const hitArea = this._createTouchHitArea(el);
      const cleanupHit = hitArea
        ? this._attachPointerHandlers(hitArea, value, onPress, onRelease)
        : () => {};

      this.buttonHandlers.push(() => {
        cleanupMain();
        cleanupHit();
        if (hitArea && hitArea.parentNode) {
          hitArea.parentNode.removeChild(hitArea);
        }
      });
    }
  }

  render(vram) {
    for (const s of this.segments) {
      if (vram.length > s.nibble) {
        const bitOn = (vram[s.nibble] >> s.bit) & 1;
        s.opacity = 0.4 * bitOn + 0.6 * s.opacity;
      } else {
        s.opacity = 0.6 * s.opacity;
      }
      s.el.style.opacity = String(s.opacity);
    }
  }
}
