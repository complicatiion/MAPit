(() => {
  'use strict';

  const VERSION = '1.1.2';
  let W = 1600;
  let H = 1000;
  const $ = id => document.getElementById(id);
  const canvas = $('mapCanvas');
  const ctx = canvas.getContext('2d');
  const stage = $('canvasStage');
  const selectionRect = $('selectionRect');
  const history = new HistoryManager(120);

  const uid = prefix => `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const safeName = s => (s || 'layer').replace(/[^a-z0-9_\-]+/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'layer';
  const nowStamp = () => new Date().toISOString().replace(/[:.]/g, '-');

  let tool = 'select';
  let selectedIds = new Set();
  let currentRoadId = null;
  let pointer = null;
  let drag = null;
  let bgImage = null;
  let importedPatternImage = null;
  let selectedIconId = null;
  let selectedBuiltinId = null;
  let builtInSymbolsLoaded = false;
  let buildingMode = 'normal';
  let roadPreset = 'asphalt';
  let markerShape = 'diamond';
  let spacePressed = false;
  let panDrag = null;
  let transformPanelLock = false;

  const state = {
    meta: { app: 'MAPit', version: VERSION, createdAt: new Date().toISOString(), savedAt: null },
    view: { zoom: 1, panX: 0, panY: 0 },
    canvas: {
      width: W,
      height: H,
      color: '#1F1F22',
      gridColor: '#ffffff',
      gridSize: 40,
      gridOpacity: 0,
      gridEnabled: false,
      canvasGlow: 18,
      background: null,
      backgroundName: '',
      bgOpacity: 100,
      bgBrightness: 0,
      bgContrast: 0,
      bgGrayscale: 0,
      bgFit: 'cover'
    },
    toggles: { snap: false, guides: false, centerline: true },
    pattern: { enabled: false, type: 'dots', scale: 34, opacity: 20, color: '#ffffff', rotation: 0, lineWidth: 1, image: null, imageName: '' },
    patterns: [],
    activePatternId: null,
    layers: [],
    activeLayerId: null,
    icons: [],
    objects: []
  };

  const defaults = {
    roads: {
      autoDesign: true,
      fill: '#CAAA98', stroke: '#F8E2D2', centerColor: '#ffffff', width: 30,
      glow: 28, opacity: 1, edgeSoftness: 25, roughness: 0, centerLine: true,
      centerStrength: .8, outline: true, outlineStrength: .65, outlineWidth: 8, solid: 1, dashed: false, stripeDash: [26, 24], edgeNoise: 0, style: 'asphalt'
    },
    buildings: { fill: '#6F7178', stroke: '#ffffff', outlineWidth: 2, glow: 30, radius: 4, shadow: 18, opacity: .95, density: 60 },
    marker: { fill: '#2C2C2C', stroke: '#ffffff', text: '#ffffff', size: 34, glow: 25, borderWidth: 3, opacity: 1, shape: 'diamond', label: 'A' },
    icon: { size: 48, glow: 20, opacity: 1, stroke: '#ffffff' },
    boundary: { fill: '#6F7780', stroke: '#ffffff', opacity: .30, outsideOpacity: .55, outlineWidth: 2, glow: 22 }
  };

  const roadPresets = {
    asphalt: { fill: '#4b4d52', stroke: '#ffffff', centerColor: '#ffffff', width: 30, centerLine: true, outline: true, roughness: 0, edgeSoftness: 15, dashed: false, glow: 26, style: 'asphalt' },
    trail: { fill: '#9A8678', stroke: '#CAAA98', centerColor: '#f5dfcf', width: 18, centerLine: false, outline: true, roughness: 38, edgeSoftness: 40, dashed: true, glow: 18, style: 'trail' },
    dirt: { fill: '#806B60', stroke: '#CAAA98', centerColor: '#f4d8c6', width: 22, centerLine: false, outline: false, roughness: 72, edgeSoftness: 60, dashed: false, glow: 20, edgeNoise: 1, style: 'dirt' },
    river: { fill: '#435e73', stroke: '#a9d8ff', centerColor: '#d6f2ff', width: 28, centerLine: false, outline: true, roughness: 12, edgeSoftness: 45, dashed: false, glow: 24, style: 'river' },
    rail: { fill: '#34363a', stroke: '#d4d4d4', centerColor: '#f6f6f6', width: 16, centerLine: false, outline: true, roughness: 0, edgeSoftness: 8, dashed: false, glow: 16, style: 'rail' },
    border: { fill: '#522546', stroke: '#F7374F', centerColor: '#fff', width: 12, centerLine: false, outline: true, roughness: 10, edgeSoftness: 20, dashed: true, glow: 30, style: 'border' }
  };

  function layerById(id) { return state.layers.find(l => l.id === id); }
  function activeLayer() { return layerById(state.activeLayerId); }
  function layerVisible(id) { const l = layerById(id); return !l || l.visible; }
  function layerLocked(id) { const l = layerById(id); return !!(l && l.locked); }
  function ensureLayer(kind) {
    const template = {
      roads: ['Roads', 'Road splines and paths'],
      buildings: ['Buildings', 'Building blocks'],
      markers: ['Markers', 'Map markers and labels'],
      icons: ['Icons', 'Imported icon placements'],
      terrain: ['Map Boundary', 'Map boundary and terrain mask'],
      islands: ['Islands', 'Natural island shapes'],
      pattern: ['Pattern Overlay', 'Viewer pattern overlay'],
      labels: ['Labels', 'Text labels and annotations'],
      background: ['Background', 'Background image']
    }[kind] || ['Custom Layer', 'Custom export layer'];
    let layer = state.layers.find(l => l.kind === kind && !l.locked);
    if (!layer) {
      layer = { id: uid(`layer_${kind}`), kind, name: template[0], description: template[1], visible: true, locked: false, export: true };
      state.layers.push(layer);
      if (!state.activeLayerId) state.activeLayerId = layer.id;
    }
    return layer;
  }

  function createObjectLayer(kind, name, description) {
    const layer = {
      id: uid(`layer_${kind}`),
      kind,
      name: name || 'Object Layer',
      description: description || 'User-created object layer',
      visible: true,
      locked: false,
      export: true
    };
    state.layers.unshift(layer);
    state.activeLayerId = layer.id;
    return layer;
  }

  function targetLayer(kind) {
    const active = activeLayer();
    if (active && active.kind === kind && !active.locked) return active.id;
    return ensureLayer(kind).id;
  }

  function layerIdByKind(kind) {
    return state.layers.find(l => l.kind === kind)?.id || null;
  }

  function patternLayerId() {
    const p = activePattern();
    return p?.layerId || layerIdByKind('pattern');
  }

  function patternTemplate(type = 'dots') {
    return { enabled: true, type, scale: 34, opacity: 20, color: '#ffffff', rotation: 0, lineWidth: 1, image: null, imageName: '' };
  }

  function activePattern() {
    if (!state.patterns) state.patterns = [];
    return state.patterns.find(p => p.id === state.activePatternId) || state.patterns[0] || null;
  }

  function syncActivePatternControls() {
    const p = activePattern();
    if (!p) {
      $('patternEnabled')?.classList.remove('on');
      $('patternToggle')?.classList.remove('active');
      return;
    }
    state.pattern = { ...patternTemplate(p.type), ...p };
    importedPatternImage = p.imageObj || null;
    $('patternEnabled')?.classList.toggle('on', !!p.enabled);
    $('patternToggle')?.classList.toggle('active', state.patterns.some(x => x.enabled));
    if ($('patternScale')) $('patternScale').value = p.scale;
    if ($('patternOpacity')) $('patternOpacity').value = p.opacity;
    if ($('patternRotation')) $('patternRotation').value = p.rotation;
    if ($('patternLineWidth')) $('patternLineWidth').value = p.lineWidth;
    if ($('patternColor')) $('patternColor').value = p.color;
    document.querySelectorAll('[data-pattern]').forEach(b => b.classList.toggle('active', b.dataset.pattern === p.type));
    updateRangeOutputs();
  }

  function ensurePatternLayer(type = state.pattern?.type || 'dots', forceNew = false) {
    if (!state.patterns) state.patterns = [];
    let p = activePattern();
    if (!p || forceNew) {
      const count = state.patterns.length + 1;
      const layer = { id: uid('layer_pattern'), kind: 'pattern', name: `Pattern ${count} - ${type}`, description: `Pattern overlay: ${type}`, visible: true, locked: false, export: true };
      state.layers.unshift(layer);
      p = { id: uid('pattern'), layerId: layer.id, ...patternTemplate(type) };
      state.patterns.unshift(p);
      state.activePatternId = p.id;
      state.activeLayerId = layer.id;
    }
    p.type = type || p.type;
    p.enabled = true;
    state.pattern = { ...patternTemplate(p.type), ...p };
    syncActivePatternControls();
    return layerById(p.layerId);
  }

  function createPatternLayer(type = state.pattern?.type || 'dots', reason = 'Added Pattern Layer') {
    ensurePatternLayer(type, true);
    setStyleTab('pattern');
    pushHistory(reason);
    renderLayers();
    render();
  }

  function enablePatternOverlay(reason = 'Pattern Overlay Enabled') {
    ensurePatternLayer(state.pattern?.type || 'dots', false);
    setStyleTab('pattern');
    pushHistory(reason);
    renderLayers();
    render();
  }

  function resizeCanvasBackingStore() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  function getViewportTransform() {
    const rect = stage.getBoundingClientRect();
    const fit = Math.min(rect.width / W, rect.height / H) * state.view.zoom;
    const ox = (rect.width - W * fit) / 2 + state.view.panX;
    const oy = (rect.height - H * fit) / 2 + state.view.panY;
    return { fit, ox, oy, rect };
  }

  function updateZoomUi() {
    const pct = Math.round(state.view.zoom * 100);
    const readout = $('zoomReadout');
    const slider = $('zoomSlider');
    if (readout) readout.textContent = `${pct}%`;
    if (slider) slider.value = String(pct);
  }

  function setZoom(nextZoom, clientX = null, clientY = null) {
    const before = getViewportTransform();
    const cx = clientX ?? (before.rect.left + before.rect.width / 2);
    const cy = clientY ?? (before.rect.top + before.rect.height / 2);
    const mapX = (cx - before.rect.left - before.ox) / before.fit;
    const mapY = (cy - before.rect.top - before.oy) / before.fit;

    state.view.zoom = clamp(nextZoom, 0.25, 4);

    const baseFit = Math.min(before.rect.width / W, before.rect.height / H);
    const newFit = baseFit * state.view.zoom;
    const baseX = (before.rect.width - W * newFit) / 2;
    const baseY = (before.rect.height - H * newFit) / 2;

    state.view.panX = (cx - before.rect.left) - mapX * newFit - baseX;
    state.view.panY = (cy - before.rect.top) - mapY * newFit - baseY;

    updateZoomUi();
    render();
  }

  function zoomBy(delta, clientX = null, clientY = null) {
    const factor = delta > 0 ? 1.1 : 1 / 1.1;
    setZoom(state.view.zoom * factor, clientX, clientY);
  }

  function centerView() {
    state.view.panX = 0;
    state.view.panY = 0;
    updateZoomUi();
    render();
  }

  function toCanvasPoint(evt) {
    const { fit, ox, oy, rect } = getViewportTransform();
    return {
      x: clamp((evt.clientX - rect.left - ox) / fit, 0, W),
      y: clamp((evt.clientY - rect.top - oy) / fit, 0, H)
    };
  }

  function applyTransform() {
    const { fit, ox, oy } = getViewportTransform();
    ctx.translate(ox, oy);
    ctx.scale(fit, fit);
  }

  function render() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.restore();

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    applyTransform();
    drawCanvasBase();
    drawGrid();
    drawBackground();
    drawPattern();
    drawObjects();
    drawGuides();
    drawCurrentPreview();
    ctx.restore();

    $('emptyHint').classList.toggle('hidden', state.objects.length > 0 || !!state.canvas.background || !!state.canvas.gridEnabled || (state.patterns && state.patterns.some(p => p.enabled)));
    $('objectReadout').textContent = `${state.objects.length} objects`;
    updateZoomUi();
    updateTransformPanel();
  }

  function drawCanvasBase() {
    ctx.save();
    ctx.fillStyle = state.canvas.color;
    ctx.shadowColor = `rgba(247,55,79,${state.canvas.canvasGlow / 120})`;
    ctx.shadowBlur = state.canvas.canvasGlow;
    ctx.fillRect(0, 0, W, H);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawGrid() {
    if (!state.canvas.gridEnabled) return;
    const size = Math.max(8, Number(state.canvas.gridSize) || 40);
    const opacity = Math.max(4, Number(state.canvas.gridOpacity) || 20);
    ctx.save();
    ctx.globalAlpha = opacity / 100;
    ctx.strokeStyle = state.canvas.gridColor || '#ffffff';
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    for (let x = 0; x <= W; x += size) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += size) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.globalAlpha = opacity / 70;
    for (let x = size; x < W; x += size * 2) {
      for (let y = size; y < H; y += size * 2) {
        ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fillStyle = state.canvas.gridColor; ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawBackground() {
    const bl = layerIdByKind('background');
    if (!bgImage || !bl || !layerVisible(bl)) return;
    ctx.save();
    ctx.globalAlpha = state.canvas.bgOpacity / 100;
    ctx.filter = `brightness(${100 + state.canvas.bgBrightness}%) contrast(${100 + state.canvas.bgContrast}%) grayscale(${state.canvas.bgGrayscale}%)`;
    const iw = bgImage.naturalWidth || bgImage.width;
    const ih = bgImage.naturalHeight || bgImage.height;
    const fitScale = state.canvas.bgFit === 'contain' ? Math.min(W / iw, H / ih) : Math.max(W / iw, H / ih);
    const dw = iw * fitScale;
    const dh = ih * fitScale;
    ctx.drawImage(bgImage, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.filter = 'none';
    ctx.restore();
  }

  function drawObjects(layerFilter = null) {
    const drawOrder = [...state.layers].reverse().map(l => l.id);
    drawOrder.forEach(layerId => {
      if (layerFilter && layerId !== layerFilter) return;
      if (!layerVisible(layerId)) return;
      state.objects.filter(o => o.layerId === layerId).forEach(obj => {
        if (obj.type === 'terrain') drawTerrain(obj);
        if (obj.type === 'road') drawRoad(obj);
        if (obj.type === 'building') drawBuilding(obj);
        if (obj.type === 'marker') drawMarker(obj);
        if (obj.type === 'icon') drawIconObject(obj);
        if (obj.type === 'label') drawLabel(obj);
      });
    });
  }

  function setShadow(style, color = null) {
    const glow = style.glow || 0;
    ctx.shadowColor = color || style.stroke || style.fill || '#F7374F';
    ctx.shadowBlur = glow;
  }

  function buildSmooth(points, rough = 0) {
    if (!points || points.length < 2) return points || [];
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      for (let s = 0; s < 18; s++) {
        const t = s / 18;
        const t2 = t * t;
        const t3 = t2 * t;
        const x = .5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x) * t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x) * t3);
        const y = .5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y) * t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y) * t3);
        const jitter = rough ? (Math.sin((i * 37 + s) * 1.618) * rough * .07) : 0;
        out.push({ x: x + jitter, y: y - jitter });
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }

  function strokeSmooth(points, style, widthMod = 1, alphaMod = 1, offset = 0) {
    const smooth = buildSmooth(points, style.roughness || 0);
    if (smooth.length < 2) return;
    ctx.save();
    ctx.globalAlpha = clamp((style.opacity ?? 1) * (style.solid ?? 1) * alphaMod, 0, 1);
    ctx.lineCap = style.style === 'dirt' || style.style === 'trail' ? 'butt' : 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = style.fill;
    ctx.lineWidth = Math.max(1, style.width * widthMod);
    if (style.dashed) ctx.setLineDash([Math.max(12, style.width), Math.max(10, style.width * .75)]);
    setShadow(style);
    ctx.beginPath();
    ctx.moveTo(smooth[0].x, smooth[0].y + offset);
    smooth.slice(1).forEach(p => ctx.lineTo(p.x, p.y + offset));
    ctx.stroke();
    ctx.restore();
  }

  function drawRoad(obj) {
    const s = obj.style || defaults.roads;
    if (!obj.points || obj.points.length < 2) {
      drawHandles(obj);
      return;
    }
    if (s.autoDesign === false) {
      strokeSmooth(obj.points, { ...s, centerLine: false, outline: false, roughness: 0, dashed: false }, 1, 1);
      drawHandles(obj);
      return;
    }
    const outlineAlpha = clamp(s.outlineStrength ?? .65, 0, 1);
    const outlinePad = Number.isFinite(s.outlineWidth) ? s.outlineWidth : 8;
    const softness = clamp(s.edgeSoftness || 0, 0, 100);
    if (softness > 0) {
      const softStyle = { ...s, fill: s.stroke || s.fill, width: s.width + outlinePad + softness * .32, glow: (s.glow || 0) + softness * .18, roughness: (s.roughness || 0) + softness * .18, dashed: false, solid: 1 };
      strokeSmooth(obj.points, softStyle, 1, Math.min(.30, .035 + softness / 360));
    }
    if (s.outline && outlinePad > 0 && outlineAlpha > 0) {
      const outlineStyle = { ...s, fill: s.stroke, width: s.width + outlinePad, glow: s.glow + 6, roughness: (s.roughness || 0) * .7, dashed: false, solid: 1 };
      strokeSmooth(obj.points, outlineStyle, 1, outlineAlpha);
    }
    if (s.style === 'dirt' || s.style === 'trail') {
      for (let i = 0; i < 3; i++) {
        const roughStyle = { ...s, width: s.width * (1 - i * .15), glow: Math.max(0, s.glow - 8), roughness: (s.roughness || 0) + i * 16 };
        strokeSmooth(obj.points, roughStyle, 1, .34, (i - 1) * 2.5);
      }
      strokeSmooth(obj.points, s, .82, .72);
    } else {
      strokeSmooth(obj.points, s, 1, 1);
    }
    if (s.centerLine && s.centerStrength > 0) {
      const smooth = buildSmooth(obj.points, Math.min(8, s.roughness || 0));
      ctx.save();
      ctx.globalAlpha = (s.opacity ?? 1) * s.centerStrength;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = s.centerColor || '#fff';
      ctx.lineWidth = Math.max(2, s.width * .075);
      ctx.setLineDash(s.stripeDash || [26, 24]);
      ctx.shadowColor = s.centerColor || '#fff'; ctx.shadowBlur = Math.max(0, s.glow / 2);
      ctx.beginPath(); ctx.moveTo(smooth[0].x, smooth[0].y); smooth.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
      ctx.restore();
    }
    if (s.style === 'rail') drawRailTies(obj, s);
    drawHandles(obj);
  }

  function drawRailTies(obj, s) {
    const pts = buildSmooth(obj.points, 0);
    ctx.save();
    ctx.strokeStyle = s.stroke; ctx.lineWidth = 3; ctx.globalAlpha = .8;
    for (let i = 8; i < pts.length - 8; i += 9) {
      const p = pts[i]; const n = pts[i + 1];
      const ang = Math.atan2(n.y - p.y, n.x - p.x) + Math.PI / 2;
      const len = s.width * .9;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(ang) * len, p.y + Math.sin(ang) * len);
      ctx.lineTo(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHandles(obj) {
    if (tool !== 'road' && !selectedIds.has(obj.id) && currentRoadId !== obj.id) return;
    drawPointHandles(obj, selectedIds.has(obj.id) || currentRoadId === obj.id ? '#F7374F' : '#ffffff');
  }

  function drawPointHandles(obj, color = '#F7374F') {
    if (!obj.points || !obj.points.length) return;
    ctx.save();
    obj.points.forEach((p, idx) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = '#F7374F'; ctx.shadowBlur = 20; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '10px Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(idx + 1), p.x, p.y);
    });
    ctx.restore();
  }

  function roundRectPath(x, y, w, h, r) {
    const rr = Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y); ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y); ctx.closePath();
  }

  function drawBuilding(obj) {
    const s = obj.style || defaults.buildings;
    ctx.save();
    ctx.globalAlpha = s.opacity ?? 1;
    ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = s.shadow || 0; ctx.shadowOffsetY = Math.min(10, (s.shadow || 0) / 4);
    roundRectPath(obj.x, obj.y, obj.w, obj.h, s.radius || 0);
    ctx.fillStyle = s.fill; ctx.fill();
    ctx.shadowOffsetY = 0; ctx.shadowBlur = s.glow || 0; ctx.shadowColor = s.stroke || '#fff';
    ctx.strokeStyle = s.stroke || '#fff'; ctx.lineWidth = s.outlineWidth ?? 2; ctx.stroke();
    if (selectedIds.has(obj.id)) drawSelectionOutline(obj);
    ctx.restore();
  }


  function closedSmoothPath(points) {
    if (!points || points.length < 3) return;
    const n = points.length;
    ctx.beginPath();
    const first = points[0];
    ctx.moveTo(first.x, first.y);
    for (let i = 0; i < n; i++) {
      const p0 = points[(i - 1 + n) % n];
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const p3 = points[(i + 2) % n];
      for (let step = 1; step <= 8; step++) {
        const t = step / 8;
        const t2 = t * t;
        const t3 = t2 * t;
        const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x) * t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x) * t3);
        const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y) * t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y) * t3);
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  }

  function drawTerrain(obj) {
    const s = { ...defaults.boundary, ...(obj.style || {}) };
    const pts = obj.points || [];
    if (!pts.length) return;
    ctx.save();
    if (obj.isBoundary) {
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = `rgba(0,0,0,${s.outsideOpacity ?? .55})`;
      ctx.fill('evenodd');
    }
    ctx.globalAlpha = s.opacity ?? .30;
    ctx.fillStyle = s.fill || '#6F7780';
    ctx.strokeStyle = s.stroke || '#ffffff';
    ctx.lineWidth = s.outlineWidth || 2;
    ctx.shadowColor = s.stroke || '#fff';
    ctx.shadowBlur = s.glow || 0;
    closedSmoothPath(pts);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    if (selectedIds.has(obj.id)) { drawSelectionOutline(obj); drawPointHandles(obj, '#ffffff'); }
    ctx.restore();
  }

  function markerPath(x, y, size, shape) {
    const r = size / 2;
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(x, y, r, 0, Math.PI * 2);
    else if (shape === 'square') ctx.rect(x - r, y - r, size, size);
    else if (shape === 'triangle') {
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 3;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
    } else if (shape === 'hex') {
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
    } else if (shape === 'shield') {
      ctx.moveTo(x, y - r); ctx.lineTo(x + r * .75, y - r * .45); ctx.lineTo(x + r * .55, y + r * .45); ctx.lineTo(x, y + r); ctx.lineTo(x - r * .55, y + r * .45); ctx.lineTo(x - r * .75, y - r * .45); ctx.closePath();
    } else if (shape === 'cross') {
      const a = r * .35;
      ctx.moveTo(x - a, y - r); ctx.lineTo(x + a, y - r); ctx.lineTo(x + a, y - a); ctx.lineTo(x + r, y - a); ctx.lineTo(x + r, y + a); ctx.lineTo(x + a, y + a); ctx.lineTo(x + a, y + r); ctx.lineTo(x - a, y + r); ctx.lineTo(x - a, y + a); ctx.lineTo(x - r, y + a); ctx.lineTo(x - r, y - a); ctx.lineTo(x - a, y - a); ctx.closePath();
    } else if (shape === 'star') {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const rr = i % 2 ? r * .45 : r;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
    } else {
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    }
  }

  function drawMarker(obj) {
    const s = obj.style || defaults.marker;
    ctx.save();
    ctx.globalAlpha = s.opacity ?? 1;
    markerPath(obj.x, obj.y, s.size, s.shape || 'diamond');
    ctx.fillStyle = s.fill; ctx.fill();
    ctx.shadowColor = s.stroke || '#fff'; ctx.shadowBlur = s.glow || 0;
    ctx.lineWidth = s.borderWidth || 2; ctx.strokeStyle = s.stroke || '#fff'; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = s.text || '#fff'; ctx.font = `800 ${Math.max(11, s.size * .42)}px Segoe UI`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(obj.label || s.label || '', obj.x, obj.y + 1);
    if (selectedIds.has(obj.id)) drawSelectionOutline(obj);
    ctx.restore();
  }


  function drawLabel(obj) {
    const s = obj.style || defaults.marker;
    const text = obj.text || obj.label || '';
    ctx.save();
    ctx.globalAlpha = s.opacity ?? 1;
    ctx.font = `800 ${Math.max(12, s.size * .42)}px Segoe UI`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pad = Math.max(6, s.size * .18);
    const w = ctx.measureText(text).width + pad * 2;
    const h = Math.max(22, s.size * .68);
    roundRectPath(obj.x - w / 2, obj.y - h / 2, w, h, Math.min(10, h / 2));
    ctx.fillStyle = s.fill || 'rgba(44,44,44,.78)';
    ctx.shadowColor = s.stroke || '#fff';
    ctx.shadowBlur = s.glow || 0;
    ctx.fill();
    ctx.lineWidth = Math.max(1, s.borderWidth || 2);
    ctx.strokeStyle = s.stroke || '#fff';
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = s.text || '#fff';
    ctx.fillText(text, obj.x, obj.y + 1);
    if (selectedIds.has(obj.id)) drawSelectionOutline(obj);
    ctx.restore();
  }

  function drawIconObject(obj) {
    const icon = state.icons.find(i => i.id === obj.iconId);
    if (!icon || !icon.image) return;
    const s = obj.style || defaults.icon;
    ctx.save();
    ctx.globalAlpha = s.opacity ?? 1;
    ctx.shadowColor = s.stroke || '#fff'; ctx.shadowBlur = s.glow || 0;
    ctx.drawImage(icon.image, obj.x - s.size / 2, obj.y - s.size / 2, s.size, s.size);
    if (selectedIds.has(obj.id)) drawSelectionOutline(obj);
    ctx.restore();
  }

  function selectionFrame(obj) {
    const b = boundsOf(obj);
    return { x: b.x - 8, y: b.y - 8, w: b.w + 16, h: b.h + 16 };
  }

  function drawSelectionOutline(obj) {
    const b = selectionFrame(obj);
    ctx.save();
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = '#F7374F';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#F7374F';
    ctx.shadowBlur = 14;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);
    if (obj.type === 'terrain' || obj.type === 'building' || obj.type === 'icon' || obj.type === 'marker' || obj.type === 'label') {
      const handleSize = Math.max(8, 12 / Math.max(.25, state.view.zoom));
      selectionCorners(b).forEach(c => {
        ctx.beginPath();
        ctx.rect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#F7374F';
        ctx.lineWidth = Math.max(1.5, 2 / Math.max(.6, state.view.zoom));
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  function selectionCorners(b) {
    return [
      { key: 'nw', x: b.x, y: b.y },
      { key: 'ne', x: b.x + b.w, y: b.y },
      { key: 'se', x: b.x + b.w, y: b.y + b.h },
      { key: 'sw', x: b.x, y: b.y + b.h }
    ];
  }

  function drawPattern() {
    const list = (state.patterns && state.patterns.length) ? state.patterns : (state.pattern?.enabled ? [state.pattern] : []);
    list.forEach(pattern => {
      if (!pattern.enabled) return;
      if (pattern.layerId && !layerVisible(pattern.layerId)) return;
      drawSinglePattern(pattern, ctx);
    });
  }

  function drawSinglePattern(pattern, targetCtx) {
    const s = Math.max(5, pattern.scale || 34);
    targetCtx.save();
    targetCtx.globalAlpha = (pattern.opacity ?? 20) / 100;
    targetCtx.strokeStyle = pattern.color || '#fff';
    targetCtx.fillStyle = pattern.color || '#fff';
    targetCtx.lineWidth = pattern.lineWidth || 1;
    targetCtx.translate(W / 2, H / 2);
    targetCtx.rotate((pattern.rotation || 0) * Math.PI / 180);
    targetCtx.translate(-W / 2, -H / 2);
    const imageObj = pattern.imageObj || (pattern.id === state.activePatternId ? importedPatternImage : null);
    if (pattern.image && imageObj) {
      const pat = targetCtx.createPattern(imageObj, 'repeat');
      if (pat) { targetCtx.fillStyle = pat; targetCtx.fillRect(0, 0, W, H); }
    } else if (pattern.type === 'dots') {
      for (let x = 0; x < W; x += s) for (let y = 0; y < H; y += s) { targetCtx.beginPath(); targetCtx.arc(x, y, Math.max(1, (pattern.lineWidth || 1) * 1.2), 0, Math.PI * 2); targetCtx.fill(); }
    } else if (pattern.type === 'diagonal' || pattern.type === 'hatch') {
      for (let x = -H; x < W + H; x += s) { targetCtx.beginPath(); targetCtx.moveTo(x, H); targetCtx.lineTo(x + H, 0); targetCtx.stroke(); }
      if (pattern.type === 'hatch') for (let x = 0; x < W + H; x += s) { targetCtx.beginPath(); targetCtx.moveTo(x, 0); targetCtx.lineTo(x - H, H); targetCtx.stroke(); }
    } else if (pattern.type === 'grid') {
      for (let x = 0; x <= W; x += s) { targetCtx.beginPath(); targetCtx.moveTo(x, 0); targetCtx.lineTo(x, H); targetCtx.stroke(); }
      for (let y = 0; y <= H; y += s) { targetCtx.beginPath(); targetCtx.moveTo(0, y); targetCtx.lineTo(W, y); targetCtx.stroke(); }
    } else if (pattern.type === 'hex' || pattern.type === 'honeycomb') {
      const r = s / 2; const h = Math.sin(Math.PI / 3) * r;
      for (let y = -h; y < H + h; y += h * 2) for (let x = -r; x < W + r; x += r * 3) hex(targetCtx, x + ((Math.round(y / (h * 2)) % 2) * r * 1.5), y, r);
    } else if (pattern.type === 'scan') {
      for (let y = 0; y <= H; y += s / 2) { targetCtx.beginPath(); targetCtx.moveTo(0, y); targetCtx.lineTo(W, y); targetCtx.stroke(); }
    } else if (pattern.type === 'plus') {
      for (let x = 0; x <= W; x += s) for (let y = 0; y <= H; y += s) { targetCtx.beginPath(); targetCtx.moveTo(x - s*.16, y); targetCtx.lineTo(x + s*.16, y); targetCtx.moveTo(x, y - s*.16); targetCtx.lineTo(x, y + s*.16); targetCtx.stroke(); }
    } else if (pattern.type === 'triangles') {
      for (let x = -s; x <= W + s; x += s) for (let y = -s; y <= H + s; y += s) { targetCtx.beginPath(); targetCtx.moveTo(x, y + s*.35); targetCtx.lineTo(x + s*.35, y - s*.25); targetCtx.lineTo(x + s*.70, y + s*.35); targetCtx.closePath(); targetCtx.stroke(); }
    } else if (pattern.type === 'cross') {
      for (let x = 0; x <= W; x += s) for (let y = 0; y <= H; y += s) { targetCtx.beginPath(); targetCtx.moveTo(x - s*.22, y - s*.22); targetCtx.lineTo(x + s*.22, y + s*.22); targetCtx.moveTo(x + s*.22, y - s*.22); targetCtx.lineTo(x - s*.22, y + s*.22); targetCtx.stroke(); }
    } else if (pattern.type === 'rings') {
      for (let x = 0; x <= W; x += s) for (let y = 0; y <= H; y += s) { targetCtx.beginPath(); targetCtx.arc(x, y, s*.22, 0, Math.PI*2); targetCtx.stroke(); }
    }
    targetCtx.restore();
  }

  function hex(targetCtx, x, y, r) {
    targetCtx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      i ? targetCtx.lineTo(px, py) : targetCtx.moveTo(px, py);
    }
    targetCtx.closePath(); targetCtx.stroke();
  }

  function drawGuides() {
    if (!state.toggles.guides || !pointer) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(247,55,79,.55)'; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(pointer.x, 0); ctx.lineTo(pointer.x, H); ctx.moveTo(0, pointer.y); ctx.lineTo(W, pointer.y); ctx.stroke();
    ctx.restore();
  }

  function drawCurrentPreview() {
    if (drag && (drag.mode === 'building' || drag.mode === 'boundary' || drag.mode === 'island' || drag.mode === 'zone' || drag.mode === 'select' || drag.mode === 'deleteArea')) {
      const r = rectFrom(drag.start, drag.current);
      ctx.save();
      ctx.strokeStyle = drag.mode === 'deleteArea' ? '#F7374F' : '#ffffff';
      ctx.fillStyle = drag.mode === 'deleteArea' ? 'rgba(247,55,79,.10)' : 'rgba(255,255,255,.06)';
      ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore();
    }
  }

  function snap(p) {
    if (!state.toggles.snap) return p;
    const s = Math.max(4, state.canvas.gridSize / 2);
    return { x: Math.round(p.x / s) * s, y: Math.round(p.y / s) * s };
  }

  function rectFrom(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; }

  function boundsOf(obj) {
    if (obj.type === 'road') {
      const xs = obj.points.map(p => p.x), ys = obj.points.map(p => p.y); const pad = (obj.style?.width || 20) / 2 + 12;
      return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
    }
    if (obj.type === 'building') return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    if (obj.type === 'label') { const size = obj.style?.size || 34; const textLen = String(obj.text || obj.label || '').length; return { x: obj.x - Math.max(40, textLen * size * .22), y: obj.y - size * .45, w: Math.max(80, textLen * size * .44), h: size * .9 }; }
    if (obj.type === 'terrain') {
      const xs = obj.points.map(p => p.x), ys = obj.points.map(p => p.y);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    const size = obj.style?.size || 40;
    return { x: obj.x - size / 2, y: obj.y - size / 2, w: size, h: size };
  }

  function rectHit(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  function hitPointHandle(p) {
    const handleRadius = 15 / Math.max(.25, state.view.zoom);
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const obj = state.objects[i];
      if (!selectedIds.has(obj.id) && currentRoadId !== obj.id) continue;
      if (!obj.points || !layerVisible(obj.layerId) || layerLocked(obj.layerId)) continue;
      for (let idx = obj.points.length - 1; idx >= 0; idx--) {
        const pt = obj.points[idx];
        const d = Math.hypot(pt.x - p.x, pt.y - p.y);
        if (d <= handleRadius) return { obj, index: idx };
      }
    }
    return null;
  }


  function hitScaleHandle(p) {
    const radius = 16 / Math.max(.25, state.view.zoom);
    const selected = state.objects.filter(o => selectedIds.has(o.id) && layerVisible(o.layerId) && !layerLocked(o.layerId));
    for (let i = selected.length - 1; i >= 0; i--) {
      const obj = selected[i];
      const b = selectionFrame(obj);
      for (const c of selectionCorners(b)) {
        if (Math.abs(p.x - c.x) <= radius && Math.abs(p.y - c.y) <= radius) {
          return { obj, corner: c.key, bounds: boundsOf(obj) };
        }
      }
    }
    return null;
  }

  function hitObject(p) {
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const obj = state.objects[i];
      if (!layerVisible(obj.layerId) || layerLocked(obj.layerId)) continue;
      const b = boundsOf(obj);
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return obj;
    }
    return null;
  }

  function onPointerDown(evt) {
    if (evt.button === 1 || spacePressed || tool === 'pan') {
      evt.preventDefault();
      panDrag = { startX: evt.clientX, startY: evt.clientY, panX: state.view.panX, panY: state.view.panY };
      canvas.style.cursor = 'grabbing';
      return;
    }
    const rawPoint = toCanvasPoint(evt);
    pointer = snap(rawPoint);
    const p = pointer;
    const scaleHit = hitScaleHandle(rawPoint);
    if (scaleHit && tool !== 'delete' && tool !== 'pan') {
      selectedIds = new Set([scaleHit.obj.id]);
      drag = { mode: 'scale', objId: scaleHit.obj.id, corner: scaleHit.corner, start: rawPoint, current: rawPoint, original: clone(scaleHit.obj), bounds: clone(scaleHit.bounds) };
      render(); renderLayers(); return;
    }
    const handle = hitPointHandle(rawPoint);
    if (handle && (tool === 'select' || tool === 'road' || tool === 'boundary' || tool === 'island')) {
      selectedIds = new Set([handle.obj.id]);
      drag = { mode: 'point', objId: handle.obj.id, index: handle.index, start: p, current: p };
      render(); renderLayers(); return;
    }
    if (tool === 'road') { addRoadPoint(p); return; }
    if (tool === 'marker') { addMarker(p); return; }
    if (tool === 'label') { addLabel(p); return; }
    if (tool === 'icon') { addIcon(p); return; }
    if (tool === 'buildingStamp') { stampBuilding(p); return; }
    if (tool === 'zone') { drag = { mode: 'zone', start: p, current: p }; render(); return; }
    if (tool === 'building') { drag = { mode: 'building', start: p, current: p }; render(); return; }
    if (tool === 'boundary') { drag = { mode: 'boundary', start: p, current: p }; render(); return; }
    if (tool === 'island') { drag = { mode: 'island', start: p, current: p }; render(); return; }
    if (tool === 'delete') {
      const hit = hitObject(p);
      if (hit) { deleteObjects([hit.id], 'Deleted object'); return; }
      drag = { mode: 'deleteArea', start: p, current: p }; render(); return;
    }
    if (tool === 'select') {
      const hit = hitObject(p);
      if (hit) {
        if (!evt.shiftKey) selectedIds.clear();
        selectedIds.add(hit.id);
        drag = { mode: 'move', start: p, current: p, ids: [...selectedIds], original: clone(state.objects.filter(o => selectedIds.has(o.id))) };
        render(); renderLayers(); return;
      }
      if (!evt.shiftKey) selectedIds.clear();
      drag = { mode: 'select', start: p, current: p };
      render(); renderLayers();
    }
  }

  function onPointerMove(evt) {
    if (panDrag) {
      state.view.panX = panDrag.panX + (evt.clientX - panDrag.startX);
      state.view.panY = panDrag.panY + (evt.clientY - panDrag.startY);
      render();
      return;
    }
    const rawPoint = toCanvasPoint(evt);
    pointer = drag && (drag.mode === 'scale' || drag.mode === 'point') ? rawPoint : snap(rawPoint);
    $('coordReadout').textContent = `X: ${Math.round(pointer.x)} · Y: ${Math.round(pointer.y)}`;
    if (drag) {
      drag.current = pointer;
      if (drag.mode === 'move') {
        const dx = drag.current.x - drag.start.x, dy = drag.current.y - drag.start.y;
        drag.original.forEach(orig => {
          const obj = state.objects.find(o => o.id === orig.id);
          if (!obj) return;
          if (obj.type === 'road' || obj.type === 'terrain') obj.points = orig.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
          else { obj.x = orig.x + dx; obj.y = orig.y + dy; }
        });
      }
      if (drag.mode === 'point') {
        const obj = state.objects.find(o => o.id === drag.objId);
        if (obj && obj.points && obj.points[drag.index]) obj.points[drag.index] = drag.current;
      }
      if (drag.mode === 'scale') {
        const obj = state.objects.find(o => o.id === drag.objId);
        if (obj) scaleObjectFromDrag(obj, drag);
      }
      render();
    } else if (state.toggles.guides) render();
  }

  function onPointerUp() {
    if (panDrag) { panDrag = null; canvas.style.cursor = ''; return; }
    if (!drag) return;
    const r = rectFrom(drag.start, drag.current);
    if (drag.mode === 'building' && r.w > 8 && r.h > 8) {
      const obj = { id: uid('building'), type: 'building', layerId: targetLayer('buildings'), x: r.x, y: r.y, w: r.w, h: r.h, style: buildBuildingStyle() };
      state.objects.push(obj); selectedIds = new Set([obj.id]); pushHistory('Added Building Block');
    }
    if (drag.mode === 'boundary' && r.w > 30 && r.h > 30) {
      const obj = makeBoundaryFromRect(r);
      state.objects.push(obj); selectedIds = new Set([obj.id]); pushHistory('Added Map Boundary');
    }
    if (drag.mode === 'island' && r.w > 24 && r.h > 24) {
      const obj = makeIslandFromRect(r);
      state.objects.push(obj); selectedIds = new Set([obj.id]); pushHistory('Added Island');
    }
    if (drag.mode === 'zone' && r.w > 12 && r.h > 12) {
      const obj = makeZoneFromRect(r);
      state.objects.push(obj); selectedIds = new Set([obj.id]); pushHistory('Added Terrain Zone');
    }
    if (drag.mode === 'select' && r.w > 4 && r.h > 4) {
      selectedIds = new Set(state.objects.filter(o => layerVisible(o.layerId) && rectHit(r, boundsOf(o))).map(o => o.id));
    }
    if (drag.mode === 'deleteArea' && r.w > 4 && r.h > 4) {
      const ids = state.objects.filter(o => !layerLocked(o.layerId) && layerVisible(o.layerId) && rectHit(r, boundsOf(o))).map(o => o.id);
      deleteObjects(ids, `Deleted Area (${ids.length})`);
    }
    if (drag.mode === 'move') pushHistory('Moved Selection');
    if (drag.mode === 'scale') pushHistory('Scaled Selection');
    if (drag.mode === 'point') pushHistory('Reshaped Object Point');
    drag = null; render(); renderLayers();
  }


  function scaleObjectFromDrag(obj, dragState) {
    const b = dragState.bounds;
    const p = dragState.current;
    const minSize = 8;
    let nx = b.x, ny = b.y, nw = b.w, nh = b.h;
    if (dragState.corner.includes('w')) { nw = b.x + b.w - p.x; nx = p.x; }
    if (dragState.corner.includes('e')) { nw = p.x - b.x; }
    if (dragState.corner.includes('n')) { nh = b.y + b.h - p.y; ny = p.y; }
    if (dragState.corner.includes('s')) { nh = p.y - b.y; }
    if (nw < minSize) { nx = b.x; nw = minSize; }
    if (nh < minSize) { ny = b.y; nh = minSize; }
    const sx = nw / Math.max(1, b.w);
    const sy = nh / Math.max(1, b.h);
    const orig = dragState.original;
    if (orig.type === 'road' || orig.type === 'terrain') {
      obj.points = orig.points.map(pt => ({ x: nx + (pt.x - b.x) * sx, y: ny + (pt.y - b.y) * sy }));
    } else if (orig.type === 'building') {
      obj.x = nx + (orig.x - b.x) * sx;
      obj.y = ny + (orig.y - b.y) * sy;
      obj.w = Math.max(1, orig.w * sx);
      obj.h = Math.max(1, orig.h * sy);
    } else {
      obj.x = nx + (orig.x - b.x) * sx;
      obj.y = ny + (orig.y - b.y) * sy;
      if (obj.style) obj.style.size = Math.max(8, (orig.style?.size || obj.style.size || 34) * Math.min(sx, sy));
    }
  }

  function makeBoundaryFromRect(r) {
    const n = 18;
    const points = [];
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      const jitter = 0.88 + 0.16 * Math.sin(i * 1.73 + r.w * .01) + 0.08 * Math.cos(i * 2.31 + r.h * .01);
      points.push({ x: cx + Math.cos(a) * r.w * .50 * jitter, y: cy + Math.sin(a) * r.h * .50 * jitter });
    }
    return { id: uid('boundary'), type: 'terrain', isBoundary: true, layerId: targetLayer('terrain'), points, style: buildBoundaryStyle() };
  }

  function buildIslandStyle() {
    return {
      ...defaults.boundary,
      fill: $('islandFillLeft')?.value || '#676B70',
      stroke: $('islandStrokeLeft')?.value || '#FFFFFF',
      opacity: Number($('islandOpacityLeft')?.value || 62) / 100,
      outsideOpacity: 0,
      outlineWidth: 2,
      glow: Number($('islandGlowLeft')?.value || 18),
      smoothness: Number($('islandSmoothnessLeft')?.value || 42)
    };
  }

  function makeIslandFromRect(r) {
    const style = buildIslandStyle();
    const n = Math.max(12, Math.round(style.smoothness || 42));
    const points = [];
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      const jitter = 0.82 + 0.12 * Math.sin(i * 1.91 + r.w * .013) + 0.09 * Math.cos(i * 2.47 + r.h * .017);
      points.push({ x: cx + Math.cos(a) * r.w * .50 * jitter, y: cy + Math.sin(a) * r.h * .50 * jitter });
    }
    return { id: uid('island'), type: 'terrain', isIsland: true, layerId: targetLayer('islands'), points, style };
  }

  function makeZoneFromRect(r) {
    const pts = [
      {x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}
    ];
    return { id: uid('zone'), type: 'terrain', isBoundary: false, layerId: targetLayer('terrain'), points: pts, style: { ...buildBoundaryStyle(), outsideOpacity: 0, opacity: Math.max(.18, Number($('boundaryOpacity').value) / 100) } };
  }

  function addRoadPoint(p) {
    if (!currentRoadId) {
      const obj = { id: uid('road'), type: 'road', layerId: targetLayer('roads'), points: [], style: buildRoadStyle() };
      state.objects.push(obj); currentRoadId = obj.id; selectedIds = new Set([obj.id]);
    }
    const road = state.objects.find(o => o.id === currentRoadId);
    if (!road) return;
    road.points.push(p);
    pushHistory(road.points.length === 1 ? 'Started Road' : 'Added Road Point');
    render(); renderLayers();
  }

  function finishRoad() { currentRoadId = null; pushHistory('Finished Road'); render(); }

  function addMarker(p) {
    const label = $('markerLabel').value.trim() || nextMarkerLabel();
    const obj = { id: uid('marker'), type: 'marker', layerId: targetLayer('markers'), x: p.x, y: p.y, label, style: buildMarkerStyle() };
    state.objects.push(obj); selectedIds = new Set([obj.id]);
    pushHistory(`Placed Marker ${label}`); render(); renderLayers();
  }

  function addLabel(p) {
    const text = $('markerLabel').value.trim() || nextMarkerLabel();
    const obj = { id: uid('label'), type: 'label', layerId: targetLayer('labels'), x: p.x, y: p.y, text, label: text, style: buildMarkerStyle() };
    state.objects.push(obj); selectedIds = new Set([obj.id]);
    pushHistory(`Placed Label ${text}`); render(); renderLayers();
  }

  function createIconPlacementLayer(icon) {
    const baseName = icon?.name || 'Symbol';
    const count = state.layers.filter(l => l.kind === 'icons' && l.name.startsWith(baseName)).length + 1;
    return createObjectLayer('icons', `${baseName} ${count}`, `Symbol placement: ${baseName}`);
  }

  function addIcon(p, iconId = selectedIconId) {
    if (!iconId) { alert('Import or select an icon first.'); return; }
    const icon = state.icons.find(i => i.id === iconId);
    if (!icon) { alert('The selected icon could not be found.'); return; }
    selectedIconId = iconId;
    const layer = createIconPlacementLayer(icon);
    const obj = { id: uid('icon'), type: 'icon', layerId: layer.id, x: p.x, y: p.y, iconId, style: { ...defaults.icon, size: Number($('markerSize').value) || 48, glow: Number($('markerGlow').value) || 20 } };
    state.objects.push(obj);
    selectedIds = new Set([obj.id]);
    pushHistory(`Placed Symbol: ${icon.name}`);
    renderIconLibrary();
    render();
    renderLayers();
  }

  function stampBuilding(p) {
    const w = Number($('buildingStampWidth')?.value) || 54;
    const h = Number($('buildingStampHeight')?.value) || 42;
    const obj = {
      id: uid('building'),
      type: 'building',
      layerId: targetLayer('buildings'),
      x: p.x - w / 2,
      y: p.y - h / 2,
      w,
      h,
      style: buildBuildingStyle()
    };
    state.objects.push(obj);
    selectedIds = new Set([obj.id]);
    pushHistory('Stamped Building');
    render();
    renderLayers();
  }

  function selectAllBuildings() {
    const ids = state.objects.filter(o => o.type === 'building').map(o => o.id);
    selectedIds = new Set(ids);
    const first = state.objects.find(o => ids.includes(o.id));
    if (first) state.activeLayerId = first.layerId;
    setTool('select');
    render();
    renderLayers();
  }

  function clearBuildings() {
    const ids = state.objects.filter(o => o.type === 'building').map(o => o.id);
    deleteObjects(ids, `Cleared Buildings (${ids.length})`);
  }

  function nextMarkerLabel() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const count = state.objects.filter(o => o.type === 'marker').length;
    return letters[count % letters.length];
  }

  function deleteObjects(ids, label) {
    if (!ids.length) return;
    state.objects = state.objects.filter(o => !ids.includes(o.id));
    ids.forEach(id => selectedIds.delete(id));
    pushHistory(label); render(); renderLayers();
  }

  function buildRoadStyle() {
    return {
      ...defaults.roads,
      autoDesign: $('roadAutoDesign').classList.contains('on'),
      fill: $('roadFill').value,
      stroke: $('roadStroke').value,
      centerColor: $('roadCenterColor').value,
      width: Number($('roadWidth').value),
      glow: Number($('roadGlow').value),
      edgeSoftness: Number($('roadEdgeSoftness').value),
      roughness: Number($('roadRoughness').value),
      opacity: Number($('roadOpacity').value) / 100,
      solid: Number($('roadSolid').value) / 100,
      outlineStrength: Number($('roadOutlineStrength').value) / 100,
      outlineWidth: Number($('roadOutlineWidth').value),
      centerLine: $('roadCenterToggle').classList.contains('on'),
      outline: $('roadOutlineToggle').classList.contains('on'),
      centerStrength: Number($('roadCenterStrength').value) / 100,
      style: roadPreset,
      dashed: roadPreset === 'trail' || roadPreset === 'border'
    };
  }

  function buildBuildingStyle() {
    syncBuildingControlsFromLeft(false);
    return { ...defaults.buildings, fill: $('buildingFill').value, stroke: $('buildingStroke').value, outlineWidth: Number($('buildingOutlineWidth').value), glow: Number($('buildingGlow').value), radius: Number($('buildingRadius').value), shadow: Number($('buildingShadow').value), opacity: Number($('buildingOpacity').value) / 100, density: Number($('buildingDensity').value) };
  }

  function syncBuildingControlsFromLeft(updateRender = true) {
    if (!$('buildingFillLeft')) return;
    if ($('buildingFill')) $('buildingFill').value = $('buildingFillLeft').value;
    if ($('buildingStroke')) $('buildingStroke').value = $('buildingStrokeLeft').value;
    if ($('buildingRadius')) $('buildingRadius').value = $('buildingRadiusLeft').value;
    if ($('buildingGlow')) $('buildingGlow').value = $('buildingGlowLeft').value;
    updateRangeOutputs();
    if (updateRender) { liveApplySelectedStyles(); render(); }
  }

  function syncBuildingControlsToLeft() {
    if (!$('buildingFillLeft')) return;
    $('buildingFillLeft').value = $('buildingFill').value;
    $('buildingStrokeLeft').value = $('buildingStroke').value;
    $('buildingRadiusLeft').value = $('buildingRadius').value;
    $('buildingGlowLeft').value = $('buildingGlow').value;
    updateRangeOutputs();
  }

  function buildMarkerStyle() {
    return { ...defaults.marker, fill: $('markerFill').value, stroke: $('markerStroke').value, text: $('markerTextColor').value, size: Number($('markerSize').value), glow: Number($('markerGlow').value), borderWidth: Number($('markerBorderWidth').value), opacity: Number($('markerOpacity').value) / 100, shape: markerShape, label: $('markerLabel').value || 'A' };
  }

  function buildBoundaryStyle() {
    return { ...defaults.boundary, fill: $('boundaryFill').value, stroke: $('boundaryStroke').value, opacity: Number($('boundaryOpacity').value) / 100, outsideOpacity: Number($('boundaryOutside').value) / 100, outlineWidth: Number($('boundaryOutline').value), glow: Number($('boundaryGlow').value) };
  }

  function applyStyleToSelection(kind) {
    const ids = [...selectedIds];
    if (!ids.length) return;
    state.objects.forEach(o => {
      if (!selectedIds.has(o.id)) return;
      if (kind === 'road' && o.type === 'road') o.style = buildRoadStyle();
      if (kind === 'building' && o.type === 'building') o.style = buildBuildingStyle();
      if (kind === 'marker' && (o.type === 'marker' || o.type === 'label' || o.type === 'icon')) {
        if (o.type === 'marker') { o.style = buildMarkerStyle(); o.label = $('markerLabel').value || o.label; }
        if (o.type === 'label') { o.style = buildMarkerStyle(); o.text = $('markerLabel').value || o.text; o.label = o.text; }
        if (o.type === 'icon') o.style = { ...o.style, size: Number($('markerSize').value), glow: Number($('markerGlow').value), opacity: Number($('markerOpacity').value) / 100, stroke: $('markerStroke').value };
      }
      if (kind === 'boundary' && o.type === 'terrain') o.style = o.isIsland ? buildIslandStyle() : buildBoundaryStyle();
    });
    pushHistory(`Applied ${kind} style`); render();
  }

  function liveApplySelectedStyles() {
    const activeRoad = currentRoadId ? state.objects.find(o => o.id === currentRoadId) : null;
    const ids = new Set([...selectedIds]);
    if (activeRoad) ids.add(activeRoad.id);
    if (!ids.size) return;
    ids.forEach(id => {
      const o = state.objects.find(obj => obj.id === id);
      if (!o) return;
      if (o.type === 'road') o.style = buildRoadStyle();
      if (o.type === 'building') o.style = buildBuildingStyle();
      if (o.type === 'terrain') o.style = o.isIsland ? buildIslandStyle() : buildBoundaryStyle();
      if (o.type === 'marker') { o.style = buildMarkerStyle(); o.label = $('markerLabel').value || o.label; }
        if (o.type === 'label') { o.style = buildMarkerStyle(); o.text = $('markerLabel').value || o.text; o.label = o.text; }
      if (o.type === 'icon') o.style = { ...o.style, size: Number($('markerSize').value), glow: Number($('markerGlow').value), opacity: Number($('markerOpacity').value) / 100, stroke: $('markerStroke').value };
    });
  }

  function setRoadPreset(name) {
    roadPreset = name;
    const p = roadPresets[name];
    if (!p) return;
    $('roadFill').value = p.fill; $('roadStroke').value = p.stroke; $('roadCenterColor').value = p.centerColor;
    $('roadWidth').value = p.width; $('roadGlow').value = p.glow; $('roadEdgeSoftness').value = p.edgeSoftness; $('roadRoughness').value = p.roughness;
    $('roadSolid').value = Math.round((p.solid ?? 1) * 100); $('roadOutlineStrength').value = Math.round((p.outlineStrength ?? .65) * 100); $('roadOutlineWidth').value = p.outlineWidth ?? 8;
    $('roadCenterToggle').classList.toggle('on', !!p.centerLine); $('roadOutlineToggle').classList.toggle('on', !!p.outline);
    document.querySelectorAll('[data-road-preset]').forEach(b => b.classList.toggle('active', b.dataset.roadPreset === name));
    updateRangeOutputs();
    liveApplySelectedStyles();
    render();
  }

  function generateRoads() {
    const layerId = targetLayer('roads');
    const style = buildRoadStyle();
    const roads = [
      [{x:110,y:520},{x:290,y:430},{x:510,y:500},{x:760,y:420},{x:1030,y:500},{x:1460,y:450}],
      [{x:350,y:250},{x:490,y:360},{x:620,y:480},{x:710,y:645},{x:910,y:760},{x:1250,y:690}],
      [{x:210,y:735},{x:380,y:620},{x:540,y:585},{x:700,y:600},{x:820,y:510}],
      [{x:1030,y:210},{x:1130,y:320},{x:1280,y:360},{x:1430,y:330}]
    ];
    roads.forEach(points => state.objects.push({ id: uid('road'), type: 'road', layerId, points, style: clone(style) }));
    pushHistory('Generated Roads'); render(); renderLayers();
  }

  function generateBuildings() {
    const layerId = targetLayer('buildings');
    const density = Number($('buildingDensity').value) / 100;
    const style = buildBuildingStyle();
    const count = buildingMode === 'sparse' ? 18 : buildingMode === 'dense' ? 70 : Math.round(42 * density + 12);
    for (let i = 0; i < count; i++) {
      const x = 130 + Math.random() * 1320;
      const y = 120 + Math.random() * 760;
      const w = 18 + Math.random() * 48;
      const h = 14 + Math.random() * 38;
      state.objects.push({ id: uid('building'), type: 'building', layerId, x, y, w, h, style: clone(style) });
    }
    pushHistory('Generated Buildings'); render(); renderLayers();
  }

  function generateMarkers() {
    const layerId = targetLayer('markers');
    const labels = ['A','B','C','D','E'];
    const pos = [{x:430,y:520},{x:650,y:300},{x:810,y:590},{x:1120,y:690},{x:1320,y:450}];
    labels.forEach((label, i) => state.objects.push({ id: uid('marker'), type: 'marker', layerId, x: pos[i].x, y: pos[i].y, label, style: { ...buildMarkerStyle(), label } }));
    pushHistory('Generated Markers'); render(); renderLayers();
  }

  function selectBoundary() {
    const obj = state.objects.find(o => o.type === 'terrain' && o.isBoundary);
    if (obj) { selectedIds = new Set([obj.id]); state.activeLayerId = obj.layerId; setTool('select'); renderLayers(); render(); }
  }

  function clearBoundary() {
    const ids = state.objects.filter(o => o.type === 'terrain' && o.isBoundary).map(o => o.id);
    deleteObjects(ids, `Cleared Boundaries (${ids.length})`);
  }

  function generateBoundary() {
    const r = { x: 90, y: 105, w: 1420, h: 790 };
    const obj = makeBoundaryFromRect(r);
    state.objects.push(obj);
    selectedIds = new Set([obj.id]);
    pushHistory('Generated Map Boundary');
    render(); renderLayers();
  }



  function selectIslands() {
    const ids = state.objects.filter(o => o.type === 'terrain' && o.isIsland).map(o => o.id);
    selectedIds = new Set(ids);
    const first = state.objects.find(o => ids.includes(o.id));
    if (first) state.activeLayerId = first.layerId;
    setTool('select');
    render();
    renderLayers();
  }

  function clearIslands() {
    const ids = state.objects.filter(o => o.type === 'terrain' && o.isIsland).map(o => o.id);
    deleteObjects(ids, `Cleared Islands (${ids.length})`);
  }

  function generateIsland() {
    const r = { x: W * .18, y: H * .18, w: W * .64, h: H * .60 };
    const obj = makeIslandFromRect(r);
    state.objects.push(obj);
    selectedIds = new Set([obj.id]);
    pushHistory('Generated Island');
    render();
    renderLayers();
  }

  function generateRandomMap() {
    state.objects = [];
    selectedIds.clear(); currentRoadId = null;
    const boundary = { id: uid('boundary'), type: 'terrain', isBoundary: true, layerId: targetLayer('terrain'), points: [
      {x:85,y:190},{x:360,y:95},{x:550,y:210},{x:760,y:150},{x:945,y:230},{x:1220,y:175},{x:1510,y:285},{x:1450,y:820},{x:1095,y:790},{x:820,y:860},{x:535,y:785},{x:425,y:620},{x:150,y:710}
    ], style: buildBoundaryStyle() };
    state.objects.push(boundary);
    setRoadPreset('asphalt'); generateRoads();
    setRoadPreset('dirt');
    state.objects.push({ id: uid('road'), type:'road', layerId: targetLayer('roads'), points:[{x:200,y:270},{x:390,y:380},{x:575,y:360},{x:760,y:300},{x:920,y:355}], style: buildRoadStyle() });
    setRoadPreset('asphalt'); generateBuildings(); generateMarkers();
    ensurePatternLayer('scan', true);
    const rp = activePattern(); if (rp) { rp.enabled = true; rp.type = 'scan'; rp.opacity = 12; rp.scale = 14; rp.color = '#ffffff'; }
    syncActivePatternControls();
    pushHistory('Generated Random Map'); render(); renderLayers();
  }


  function positionResolutionMenu() {
    const btn = $('resolutionMenuBtn');
    const menu = $('resolutionMenu');
    if (!btn || !menu) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 304;
    const left = clamp(rect.left, 12, Math.max(12, window.innerWidth - menuWidth - 12));
    const top = Math.min(window.innerHeight - 24, rect.bottom + 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function openResolutionMenu() {
    positionResolutionMenu();
    $('resolutionMenu')?.classList.add('open');
  }

  function closeResolutionMenu() {
    $('resolutionMenu')?.classList.remove('open');
  }

  function toggleResolutionMenu() {
    const menu = $('resolutionMenu');
    if (!menu) return;
    if (menu.classList.contains('open')) closeResolutionMenu();
    else openResolutionMenu();
  }

  function updateResolutionUi() {
    const w = Math.round(W);
    const h = Math.round(H);
    if ($('canvasWidthInput')) $('canvasWidthInput').value = w;
    if ($('canvasHeightInput')) $('canvasHeightInput').value = h;
    if ($('resolutionReadout')) $('resolutionReadout').textContent = `Export size: ${w} × ${h} px`;
  }

  function setCanvasResolution(width, height, reason = 'Changed Map Resolution') {
    const nextW = clamp(Math.round(Number(width) || W), 256, 8192);
    const nextH = clamp(Math.round(Number(height) || H), 256, 8192);
    W = nextW;
    H = nextH;
    state.canvas.width = W;
    state.canvas.height = H;
    state.view.zoom = 1;
    state.view.panX = 0;
    state.view.panY = 0;
    updateResolutionUi();
    updateZoomUi();
    pushHistory(reason);
    resizeCanvasBackingStore();
    render();
  }

  function pushHistory(label) { history.push(serializeState(), label); renderHistory(); }
  function serializeState() {
    const s = clone(state);
    s.icons = s.icons.map(({ image, ...rest }) => rest);
    if (s.patterns) s.patterns = s.patterns.map(({ imageObj, ...rest }) => rest);
    return s;
  }

  function restoreState(s) {
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, clone(s));
    W = Math.max(256, Number(state.canvas?.width) || 1600);
    H = Math.max(256, Number(state.canvas?.height) || 1000);
    state.canvas.width = W;
    state.canvas.height = H;
    if (!state.patterns) state.patterns = state.pattern?.enabled ? [{ id: uid('pattern'), layerId: layerIdByKind('pattern'), ...state.pattern }] : [];
    if (!state.activePatternId) state.activePatternId = state.patterns[0]?.id || null;
    hydrateImages(); selectedIds.clear(); currentRoadId = null;
  }

  function hydrateImages() {
    bgImage = null; importedPatternImage = null;
    if (state.canvas.background) loadImage(state.canvas.background).then(img => { bgImage = img; render(); });
    (state.patterns || []).forEach(p => { if (p.image) loadImage(p.image).then(img => { p.imageObj = img; if (p.id === state.activePatternId) importedPatternImage = img; render(); }); });
    if (state.pattern?.image) loadImage(state.pattern.image).then(img => { importedPatternImage = img; render(); });
    state.icons.forEach(icon => {
      icon.image = null;
      if (icon.src) loadImage(icon.src).then(img => { icon.image = img; renderIconLibrary(); render(); });
    });
  }

  function loadImage(src) { return new Promise(resolve => { const img = new Image(); img.onload = () => resolve(img); img.src = src; }); }
  function fileToDataUrl(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); }); }
  function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }


  function svgDataUrl(markup) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
  }

  async function seedBuiltInSymbols() {
    if (builtInSymbolsLoaded) return;
    builtInSymbolsLoaded = true;

    const tile = (body, fill = '#2c2c2c', stroke = '#fff') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="3"/>${body}</svg>`;
    const textIcon = (label, category = 'objectives', fill = '#2c2c2c') => ({
      name: label,
      category,
      svg: tile(`<text x="32" y="41" text-anchor="middle" font-size="27" font-family="Segoe UI,Arial" font-weight="900" fill="#fff">${label}</text>`, fill)
    });

    const symbols = [
      textIcon('A'), textIcon('B'), textIcon('C'), textIcon('D'), textIcon('E'), textIcon('!', 'objectives', '#88304E'), textIcon('?', 'objectives', '#522546'),
      { name:'Target', category:'objectives', svg:tile('<circle cx="32" cy="32" r="20" fill="none" stroke="#fff" stroke-width="4"/><circle cx="32" cy="32" r="10" fill="none" stroke="#fff" stroke-width="4"/><circle cx="32" cy="32" r="3" fill="#fff"/>') },
      { name:'Flag', category:'objectives', svg:tile('<path d="M22 50V15" stroke="#fff" stroke-width="5"/><path d="M24 15h22l-5 9 5 9H24z" fill="#F7374F" stroke="#fff" stroke-width="3"/>') },
      { name:'Waypoint', category:'objectives', svg:tile('<path d="M32 55s17-18 17-31a17 17 0 1 0-34 0c0 13 17 31 17 31z" fill="#522546" stroke="#fff" stroke-width="4"/><circle cx="32" cy="24" r="6" fill="#fff"/>') },
      { name:'House', category:'buildings', svg:tile('<path d="M15 32 32 17l17 15v18H15z" fill="#522546" stroke="#fff" stroke-width="4"/><path d="M27 50V37h10v13" fill="none" stroke="#fff" stroke-width="4"/>') },
      { name:'Factory', category:'buildings', svg:tile('<path d="M12 50V30l11 8V28l11 9V21h10v29z" fill="#522546" stroke="#fff" stroke-width="4"/><path d="M18 44h8M32 44h8" stroke="#fff" stroke-width="3"/>') },
      { name:'Warehouse', category:'buildings', svg:tile('<path d="M12 52V25l20-12 20 12v27z" fill="#522546" stroke="#fff" stroke-width="4"/><path d="M22 52V35h20v17M22 35h20" stroke="#fff" stroke-width="4"/>') },
      { name:'Tower', category:'buildings', svg:tile('<path d="M24 52 30 13h4l6 39" fill="none" stroke="#fff" stroke-width="4"/><path d="M20 52h24M26 27h12M25 39h14" stroke="#fff" stroke-width="4"/>') },
      { name:'Hospital', category:'buildings', svg:tile('<path d="M14 52V18h36v34" fill="#522546" stroke="#fff" stroke-width="4"/><path d="M32 25v18M23 34h18" stroke="#fff" stroke-width="6"/>') },
      { name:'Car', category:'vehicles', svg:tile('<rect x="12" y="26" width="40" height="17" rx="5" fill="#522546" stroke="#fff" stroke-width="4"/><circle cx="22" cy="46" r="5" fill="#fff"/><circle cx="42" cy="46" r="5" fill="#fff"/>') },
      { name:'Truck', category:'vehicles', svg:tile('<path d="M10 25h28v18H10zM38 31h10l6 6v6H38z" fill="#522546" stroke="#fff" stroke-width="4"/><circle cx="21" cy="47" r="5" fill="#fff"/><circle cx="45" cy="47" r="5" fill="#fff"/>') },
      { name:'Tank', category:'vehicles', svg:tile('<rect x="13" y="31" width="32" height="14" rx="4" fill="#522546" stroke="#fff" stroke-width="4"/><path d="M32 31V20h20" stroke="#fff" stroke-width="4"/><path d="M16 47h31" stroke="#fff" stroke-width="4"/>') },
      { name:'Drone', category:'vehicles', svg:tile('<circle cx="20" cy="20" r="7" fill="none" stroke="#fff" stroke-width="4"/><circle cx="44" cy="20" r="7" fill="none" stroke="#fff" stroke-width="4"/><circle cx="20" cy="44" r="7" fill="none" stroke="#fff" stroke-width="4"/><circle cx="44" cy="44" r="7" fill="none" stroke="#fff" stroke-width="4"/><path d="M24 24l16 16M40 24 24 40" stroke="#fff" stroke-width="4"/>') },
      { name:'Jet', category:'vehicles', svg:tile('<path d="M32 8l8 24 14 8-12 3-4 13-6-13-12 3 4-13-14-8 14-2z" fill="#522546" stroke="#fff" stroke-width="3"/>') },
      textIcon('+', 'scifi', '#522546'), textIcon('-', 'scifi', '#522546'),
      { name:'Hex Node', category:'scifi', svg:tile('<path d="M32 10 51 21v22L32 54 13 43V21z" fill="#522546" stroke="#fff" stroke-width="4"/><circle cx="32" cy="32" r="6" fill="#fff"/>') },
      { name:'Triangle Node', category:'scifi', svg:tile('<path d="M32 10 55 52H9z" fill="#522546" stroke="#fff" stroke-width="4"/><circle cx="32" cy="36" r="5" fill="#fff"/>') },
      { name:'Power Core', category:'scifi', svg:tile('<path d="M34 9 18 34h12l-2 21 18-29H34z" fill="#F7374F" stroke="#fff" stroke-width="3"/>') },
      { name:'Portal', category:'scifi', svg:tile('<circle cx="32" cy="32" r="22" fill="none" stroke="#fff" stroke-width="4"/><path d="M20 32c5-12 19-12 24 0-5 12-19 12-24 0z" fill="#522546" stroke="#fff" stroke-width="3"/>') },
      { name:'Radar', category:'scifi', svg:tile('<circle cx="32" cy="32" r="22" fill="none" stroke="#fff" stroke-width="3"/><path d="M32 32 48 20" stroke="#F7374F" stroke-width="4"/><path d="M20 45a17 17 0 0 1 0-26" stroke="#fff" stroke-width="3"/>') }
    ];

    for (const item of symbols) {
      const src = svgDataUrl(item.svg);
      const image = await loadImage(src);
      state.icons.push({ id: uid('builtin'), name: item.name, src, image, source: 'builtin', category: item.category || 'objectives' });
    }
    await loadFolderSymbols();
    selectedIconId = state.icons[0]?.id || null;
    renderIconLibrary();
  }

  async function loadFolderSymbols() {
    const base = 'assets/imported_symbols/';
    const existing = new Set(state.icons.filter(i => i.source === 'folder').map(i => i.src));
    const candidates = new Set();
    try {
      const manifest = await fetch(base + 'manifest.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : []);
      (Array.isArray(manifest) ? manifest : manifest.files || []).forEach(f => candidates.add(base + f));
    } catch (_) {}
    try {
      const html = await fetch(base, { cache: 'no-store' }).then(r => r.ok ? r.text() : '');
      [...html.matchAll(/href="([^"]+\.(?:png|ico|webp|jpg|jpeg|svg))"/ig)].forEach(m => candidates.add(new URL(m[1], location.href + base).pathname.split('/').pop()));
    } catch (_) {}
    for (const f of candidates) {
      const src = f.startsWith('assets/') ? f : base + f.replace(/^.*\//, '');
      if (existing.has(src)) continue;
      try {
        const image = await loadImage(src);
        state.icons.push({ id: uid('foldersymbol'), name: src.split('/').pop().replace(/\.[^.]+$/, ''), src, image, source: 'folder' });
      } catch (_) {}
    }
  }

  async function importBackground(file) {
    if (!file) return;
    const src = await fileToDataUrl(file);
    state.canvas.background = src; state.canvas.backgroundName = file.name; bgImage = await loadImage(src);
    ensureLayer('background');
    pushHistory('Background Imported'); render(); renderLayers();
  }

  async function importIcons(files) {
    for (const file of files) {
      const src = await fileToDataUrl(file);
      const image = await loadImage(src);
      const icon = { id: uid('iconasset'), name: file.name.replace(/\.[^.]+$/, ''), src, image, source: 'user' };
      state.icons.push(icon); selectedIconId = icon.id;
    }
    pushHistory('Imported Icon PNG'); renderIconLibrary(); render();
  }

  async function importPattern(file) {
    if (!file) return;
    const src = await fileToDataUrl(file);
    const layer = ensurePatternLayer(state.pattern?.type || 'dots', !activePattern());
    const p = activePattern();
    p.image = src; p.imageName = file.name; p.imageObj = await loadImage(src); importedPatternImage = p.imageObj;
    p.enabled = true; syncActivePatternControls();
    pushHistory('Imported Pattern Overlay'); renderLayers(); render();
  }

  function renderIconLibrary() {
    const builtinWrap = $('builtinIconLibrary');
    const imported = $('iconLibrary');
    if (builtinWrap) builtinWrap.querySelectorAll('[data-symbol-category]').forEach(el => el.innerHTML = '');
    if (imported) imported.innerHTML = '';

    const renderBtn = (icon, target) => {
      if (!target) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.draggable = true;
      btn.className = `icon-thumb ${selectedIconId === icon.id ? 'active' : ''}`;
      btn.title = `${icon.name} (${icon.source || 'user'})`;
      btn.dataset.iconId = icon.id;
      btn.dataset.symbolSource = icon.source || 'user';
      const img = document.createElement('img');
      img.src = icon.src;
      img.alt = icon.name;
      btn.appendChild(img);
      btn.addEventListener('click', () => { selectedIconId = icon.id; setTool('icon'); renderIconLibrary(); });
      btn.addEventListener('dragstart', e => {
        selectedIconId = icon.id;
        e.dataTransfer.setData('text/mapit-icon-id', icon.id);
        e.dataTransfer.setData('text/plain', icon.name);
        e.dataTransfer.effectAllowed = 'copy';
      });
      target.appendChild(btn);
    };

    state.icons.filter(i => i.source === 'builtin').forEach(icon => {
      const category = icon.category || 'objectives';
      const target = builtinWrap?.querySelector(`[data-symbol-category="${category}"]`) || builtinWrap?.querySelector('[data-symbol-category="objectives"]');
      renderBtn(icon, target);
    });
    state.icons.filter(i => i.source !== 'builtin').forEach(icon => renderBtn(icon, imported));
    document.querySelectorAll('.symbol-group-head').forEach(head => {
      if (head.dataset.bound) return;
      head.dataset.bound = '1';
      head.addEventListener('click', () => head.closest('.symbol-group')?.classList.toggle('open'));
    });
  }

  let layerDragId = null;

  function renderLayers() {
    const list = $('layerList');
    list.innerHTML = '';
    if (!state.layers.length) {
      list.innerHTML = '<div class="layer-empty">No layers yet. Add a layer or create/generate objects.</div>';
      return;
    }
    state.layers.forEach(layer => {
      const row = document.createElement('div');
      row.className = `layer-row ${layer.id === state.activeLayerId ? 'active' : ''} ${state.patterns?.some(p => p.layerId === layer.id && p.id === state.activePatternId) ? 'pattern-active' : ''}`;
      row.dataset.layerId = layer.id;
      row.draggable = true;
      row.innerHTML = `
        <div class="drag-grip" title="Drag to reorder layer">⋮⋮</div>
        <div class="layer-meta">
          <input class="layer-name" value="${escapeHtml(layer.name)}" title="Layer export name" />
          <input class="layer-desc" value="${escapeHtml(layer.description || '')}" title="Layer export description" />
        </div>
        <div class="layer-actions">
          <button class="layer-action layer-kind-icon" title="Layer type">${layerIcon(layer.kind)}</button>
          <button class="layer-action ${layer.visible ? '' : 'off'}" data-action="visible" title="Toggle visibility">${svgEye()}</button>
          <button class="layer-action ${layer.locked ? '' : 'off'}" data-action="lock" title="Toggle lock">${svgLock()}</button>
          <button class="layer-action ${layer.export ? '' : 'off'}" data-action="export" title="Toggle export">${svgExport()}</button>
          <button class="layer-action danger" data-action="delete" title="Delete layer">${svgTrash()}</button>
        </div>`;
      row.addEventListener('click', e => {
        if (!e.target.closest('button') && !e.target.matches('input')) {
          state.activeLayerId = layer.id;
          const layerObjectIds = state.objects.filter(o => o.layerId === layer.id).map(o => o.id);
          selectedIds = new Set(layerObjectIds);
          const lp = state.patterns?.find(p => p.layerId === layer.id);
          if (lp) { state.activePatternId = lp.id; syncActivePatternControls(); }
          renderLayers();
          render();
        }
      });
      row.addEventListener('dragstart', e => {
        if (e.target.matches('input,button')) { e.preventDefault(); return; }
        layerDragId = layer.id;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/mapit-layer-id', layer.id);
      });
      row.addEventListener('dragover', e => {
        if (!layerDragId || layerDragId === layer.id) return;
        e.preventDefault();
        row.classList.add('drag-over');
      });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', e => {
        e.preventDefault();
        row.classList.remove('drag-over');
        reorderLayer(layerDragId, layer.id);
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        document.querySelectorAll('.layer-row.drag-over').forEach(x => x.classList.remove('drag-over'));
        layerDragId = null;
      });
      row.querySelector('.layer-name').addEventListener('input', e => { layer.name = e.target.value; });
      row.querySelector('.layer-desc').addEventListener('input', e => { layer.description = e.target.value; });
      row.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', e => handleLayerAction(layer, e.currentTarget.dataset.action)));
      list.appendChild(row);
    });
  }

  function reorderLayer(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const fromIndex = state.layers.findIndex(l => l.id === fromId);
    const toIndex = state.layers.findIndex(l => l.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [layer] = state.layers.splice(fromIndex, 1);
    state.layers.splice(toIndex, 0, layer);
    state.activeLayerId = layer.id;
    pushHistory(`Moved Layer: ${layer.name}`);
    renderLayers();
    render();
  }

  function handleLayerAction(layer, action) {
    if (action === 'visible') layer.visible = !layer.visible;
    if (action === 'lock') layer.locked = !layer.locked;
    if (action === 'export') layer.export = !layer.export;
    if (action === 'delete') {
      
      state.objects = state.objects.filter(o => o.layerId !== layer.id);
      if (state.patterns) state.patterns = state.patterns.filter(p => p.layerId !== layer.id);
      if (state.activePatternId && !state.patterns?.some(p => p.id === state.activePatternId)) state.activePatternId = state.patterns?.[0]?.id || null;
      state.layers = state.layers.filter(l => l.id !== layer.id);
      if (state.activeLayerId === layer.id) state.activeLayerId = state.layers[0]?.id || null;
    }
    pushHistory(`Layer ${action}`); renderLayers(); render();
  }

  function layerIcon(kind) {
    const icons = {
      markers:'<svg viewBox="0 0 24 24"><path d="M12 21s6-7 6-11a6 6 0 1 0-12 0c0 4 6 11 6 11z"/></svg>',
      labels:'<svg viewBox="0 0 24 24"><path d="M5 6h14v4H5z"/><path d="M8 18h8M10 14h4"/></svg>',
      icons:'<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M7 15l3-3 3 3 2-2 3 4"/></svg>',
      buildings:'<svg viewBox="0 0 24 24"><path d="M4 20V8l8-4 8 4v12"/><path d="M8 20v-9h8v9"/></svg>',
      roads:'<svg viewBox="0 0 24 24"><path d="M7 21 12 3l5 18"/><path d="M10 12h4"/></svg>',
      terrain:'<svg viewBox="0 0 24 24"><path d="M4 8l7-4 8 5-2 10-9 1-4-6z"/></svg>',
      islands:'<svg viewBox="0 0 24 24"><path d="M5 13c1-5 5-8 10-7 4 1 6 5 4 9-2 4-8 6-12 4-2-1-3-3-2-6z"/></svg>',
      pattern:'<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M8 4v16M4 8h16M12 4v16M4 12h16"/></svg>',
      background:'<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><circle cx="9" cy="10" r="2"/></svg>',
      custom:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/></svg>'
    };
    return icons[kind] || icons.custom;
  }
  const svgEye = () => '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const svgLock = () => '<svg viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2"/><rect x="5" y="10" width="14" height="10" rx="2"/></svg>';
  const svgExport = () => '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M5 20h14"/></svg>';
  const svgTrash = () => '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M8 10l1 10h6l1-10"/></svg>';
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  function renderHistory() {
    const list = $('historyList'); list.innerHTML = '';
    history.list().forEach(entry => {
      const row = document.createElement('div'); row.className = `history-row ${entry.active ? 'active' : ''}`;
      row.innerHTML = `<span>${escapeHtml(entry.label)}</span><small>${entry.at}</small>`;
      list.appendChild(row);
    });
  }

  function saveProject() {
    const out = serializeState(); out.meta.savedAt = new Date().toISOString();
    downloadBlob(new Blob([JSON.stringify(out, null, 2)], { type: 'application/MAPit+json' }), `MAPit_project_${nowStamp()}.MAPit`);
  }

  async function loadProject(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const loaded = JSON.parse(text);
      restoreState(loaded); pushHistory('Loaded Project'); syncControlsFromState(); renderLayers(); renderIconLibrary(); render();
    } catch (err) { alert('Could not load project. The .MAPit file is not valid.'); }
  }

  function exportImage(type = 'png', layerId = null) {
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const octx = out.getContext('2d');
    const old = ctx.getTransform();
    const oldCanvas = { canvas: ctx.canvas };
    // Render using helper with temporary context swap is avoided: duplicate simple pipeline.
    renderToContext(octx, layerId);
    const mime = type === 'jpg' ? 'image/jpeg' : type === 'webp' ? 'image/webp' : 'image/png';
    out.toBlob(blob => downloadBlob(blob, `MAPit_${layerId ? safeName(layerById(layerId)?.name) + '_' : ''}${nowStamp()}.${type === 'jpg' ? 'jpg' : type}`), mime, .92);
  }

  function renderToContext(target, layerId = null) {
    target.save(); target.fillStyle = state.canvas.color; target.fillRect(0, 0, W, H); target.restore();
    const original = window.__mapitRenderContext;
    const realCtx = ctx;
    window.__mapitRenderContext = target;
    const oldCtxProps = {};
    // Lightweight export path: call object drawing by temporarily copying methods through ctx variable is not possible.
    // Instead draw exported state with dedicated routines.
    exportDrawBackground(target);
    exportDrawPattern(target, layerId);
    exportDrawObjects(target, layerId);
    window.__mapitRenderContext = original;
  }

  function withExportContext(target, fn) {
    const props = Object.getOwnPropertyNames(CanvasRenderingContext2D.prototype);
    return fn(target, props);
  }

  function exportDrawBackground(target) {
    const bl = layerIdByKind('background');
    if (!bgImage || !bl || !layerVisible(bl)) return;
    target.save(); target.globalAlpha = state.canvas.bgOpacity / 100;
    const iw = bgImage.naturalWidth || bgImage.width, ih = bgImage.naturalHeight || bgImage.height;
    const fitScale = state.canvas.bgFit === 'contain' ? Math.min(W / iw, H / ih) : Math.max(W / iw, H / ih);
    const dw = iw * fitScale, dh = ih * fitScale;
    target.drawImage(bgImage, (W - dw) / 2, (H - dh) / 2, dw, dh); target.restore();
  }

  function exportDrawObjects(target, layerId = null) {
    const originalDrawCtx = ctx;
    // Export by rendering to screen-sized temp through transform-free custom mini routines.
    const saved = ctx;
    const list = layerId ? state.objects.filter(o => o.layerId === layerId) : state.objects;
    list.forEach(o => {
      if (!layerVisible(o.layerId)) return;
      target.save();
      if (o.type === 'road') exportRoad(target, o);
      if (o.type === 'building') exportBuilding(target, o);
      if (o.type === 'terrain') exportTerrain(target, o);
      if (o.type === 'marker') exportMarker(target, o);
      if (o.type === 'icon') exportIcon(target, o);
      if (o.type === 'label') exportMarker(target, { ...o, label: o.text || o.label });
      target.restore();
    });
  }

  function exportRoad(t, obj) {
    const s = obj.style || defaults.roads; const pts = buildSmooth(obj.points, s.roughness || 0); if (pts.length < 2) return;
    const stroke = (style, mod = 1, alpha = 1) => { t.save(); t.globalAlpha = clamp((style.opacity ?? 1) * (style.solid ?? 1) * alpha, 0, 1); t.strokeStyle = style.fill; t.lineWidth = style.width * mod; t.lineCap = 'round'; t.lineJoin = 'round'; if (style.dashed) t.setLineDash([Math.max(12, style.width), Math.max(10, style.width*.75)]); t.shadowColor = style.stroke || style.fill; t.shadowBlur = style.glow || 0; t.beginPath(); t.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach(p=>t.lineTo(p.x,p.y)); t.stroke(); t.restore(); };
    if (s.outline) stroke({ ...s, fill: s.stroke, width: s.width + (s.outlineWidth ?? 8), dashed:false, solid:1 }, 1, s.outlineStrength ?? .65);
    stroke(s);
    if (s.centerLine) { t.save(); t.globalAlpha = (s.opacity ?? 1) * (s.centerStrength ?? .8); t.strokeStyle = s.centerColor || '#fff'; t.lineWidth = Math.max(2, s.width*.075); t.setLineDash(s.stripeDash || [26,24]); t.beginPath(); t.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach(p=>t.lineTo(p.x,p.y)); t.stroke(); t.restore(); }
  }
  function exportBuilding(t,o){ const s=o.style||defaults.buildings; t.save(); t.globalAlpha=s.opacity??1; t.fillStyle=s.fill; t.strokeStyle=s.stroke; t.lineWidth=s.outlineWidth??2; t.shadowColor=s.stroke; t.shadowBlur=s.glow||0; t.beginPath(); const r=Math.min(s.radius||0,o.w/2,o.h/2); t.moveTo(o.x+r,o.y); t.lineTo(o.x+o.w-r,o.y); t.quadraticCurveTo(o.x+o.w,o.y,o.x+o.w,o.y+r); t.lineTo(o.x+o.w,o.y+o.h-r); t.quadraticCurveTo(o.x+o.w,o.y+o.h,o.x+o.w-r,o.y+o.h); t.lineTo(o.x+r,o.y+o.h); t.quadraticCurveTo(o.x,o.y+o.h,o.x,o.y+o.h-r); t.lineTo(o.x,o.y+r); t.quadraticCurveTo(o.x,o.y,o.x+r,o.y); t.closePath(); t.fill(); t.stroke(); t.restore(); }
  function exportTerrain(t,o){ const s={...defaults.boundary,...(o.style||{})}; t.save(); if(o.isBoundary){t.beginPath();t.rect(0,0,W,H);o.points.forEach((p,i)=>i?t.lineTo(p.x,p.y):t.moveTo(p.x,p.y));t.closePath();t.fillStyle=`rgba(0,0,0,${s.outsideOpacity??.55})`;try{t.fill('evenodd')}catch(e){t.fill()}} t.globalAlpha=s.opacity??.35; t.fillStyle=s.fill||'#6F7780'; t.strokeStyle=s.stroke||'#fff'; t.lineWidth=s.outlineWidth||2; t.shadowColor=s.stroke||'#fff'; t.shadowBlur=s.glow||0; t.beginPath(); o.points.forEach((p,i)=>i?t.lineTo(p.x,p.y):t.moveTo(p.x,p.y)); t.closePath(); t.fill(); t.globalAlpha=1; t.stroke(); t.restore(); }
  function exportMarker(t,o){ const s=o.style||defaults.marker; t.save(); t.globalAlpha=s.opacity??1; t.translate(o.x,o.y); t.rotate(s.shape==='diamond'?Math.PI/4:0); t.fillStyle=s.fill; t.strokeStyle=s.stroke; t.lineWidth=s.borderWidth||2; t.shadowColor=s.stroke; t.shadowBlur=s.glow||0; if(s.shape==='circle'){t.beginPath();t.arc(0,0,s.size/2,0,Math.PI*2)}else{t.beginPath();t.rect(-s.size/2,-s.size/2,s.size,s.size)} t.fill(); t.stroke(); t.rotate(s.shape==='diamond'?-Math.PI/4:0); t.fillStyle=s.text; t.font=`800 ${Math.max(11,s.size*.42)}px Segoe UI`; t.textAlign='center'; t.textBaseline='middle'; t.fillText(o.label||'',0,1); t.restore(); }
  function exportIcon(t,o){ const icon=state.icons.find(i=>i.id===o.iconId); if(!icon||!icon.image)return; const s=o.style||defaults.icon; t.save(); t.globalAlpha=s.opacity??1; t.shadowColor=s.stroke||'#fff'; t.shadowBlur=s.glow||0; t.drawImage(icon.image,o.x-s.size/2,o.y-s.size/2,s.size,s.size); t.restore(); }
  function exportDrawPattern(target, layerId = null) {
    const list = state.patterns || [];
    list.forEach(p => {
      if (!p.enabled) return;
      if (layerId && p.layerId !== layerId) return;
      if (!layerVisible(p.layerId)) return;
      drawPatternToContext(target, p);
    });
  }

  function drawPatternToContext(target, pattern) {
    target.save();
    target.globalAlpha = (pattern.opacity ?? 20) / 100;
    target.strokeStyle = pattern.color || '#fff';
    target.fillStyle = pattern.color || '#fff';
    target.lineWidth = pattern.lineWidth || 1;
    const s = Math.max(5, pattern.scale || 34);
    if (pattern.type === 'dots') { for (let x=0;x<W;x+=s) for (let y=0;y<H;y+=s){ target.beginPath(); target.arc(x,y,Math.max(1,(pattern.lineWidth||1)*1.2),0,Math.PI*2); target.fill(); } }
    else if (pattern.type === 'grid') { for (let x=0;x<=W;x+=s){ target.beginPath(); target.moveTo(x,0); target.lineTo(x,H); target.stroke(); } for (let y=0;y<=H;y+=s){ target.beginPath(); target.moveTo(0,y); target.lineTo(W,y); target.stroke(); } }
    else if (pattern.type === 'plus') { for(let x=0;x<=W;x+=s) for(let y=0;y<=H;y+=s){ target.beginPath(); target.moveTo(x-s*.16,y); target.lineTo(x+s*.16,y); target.moveTo(x,y-s*.16); target.lineTo(x,y+s*.16); target.stroke(); } }
    else if (pattern.type === 'triangles') { for(let x=-s;x<=W+s;x+=s) for(let y=-s;y<=H+s;y+=s){ target.beginPath(); target.moveTo(x,y+s*.35); target.lineTo(x+s*.35,y-s*.25); target.lineTo(x+s*.70,y+s*.35); target.closePath(); target.stroke(); } }
    else if (pattern.type === 'scan') { for(let y=0;y<=H;y+=s/2){ target.beginPath(); target.moveTo(0,y); target.lineTo(W,y); target.stroke(); } }
    else { for(let x=-H;x<W+H;x+=s){ target.beginPath(); target.moveTo(x,H); target.lineTo(x+H,0); target.stroke(); } }
    target.restore();
  }


  function exportLayersJson() {
    const payload = state.layers.filter(l => l.export).map(layer => ({ layer: clone(layer), pattern: layer.kind === 'pattern' ? clone((state.patterns || []).find(p => p.layerId === layer.id) || state.pattern) : null, objects: state.objects.filter(o => o.layerId === layer.id) }));
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `MAPit_layers_${nowStamp()}.json`);
  }

  function exportZip() {
    const files = [];
    const project = serializeState(); project.meta.savedAt = new Date().toISOString();
    files.push({ name: 'project.MAPit', content: JSON.stringify(project, null, 2) });
    files.push({ name: 'manifest.json', content: JSON.stringify({ app:'MAPit', version:VERSION, exportedAt:new Date().toISOString(), layers:state.layers.map(l=>({ name:l.name, description:l.description, export:l.export })) }, null, 2) });
    state.layers.filter(l => l.export).forEach(layer => files.push({ name: `layers/${safeName(layer.name)}.json`, content: JSON.stringify({ layer, pattern: layer.kind === 'pattern' ? ((state.patterns || []).find(p => p.layerId === layer.id) || state.pattern) : null, objects: state.objects.filter(o => o.layerId === layer.id) }, null, 2) }));
    state.icons.forEach(icon => files.push({ name: `icons/${safeName(icon.name)}.dataurl.txt`, content: icon.src }));
    downloadBlob(MAPitZip.create(files), `MAPit_layer_package_${nowStamp()}.zip`);
  }

  function syncControlsFromState() {
    W = Math.max(256, Number(state.canvas.width) || W);
    H = Math.max(256, Number(state.canvas.height) || H);
    state.canvas.width = W;
    state.canvas.height = H;
    updateResolutionUi();
    $('bgOpacity').value = state.canvas.bgOpacity; $('bgBrightness').value = state.canvas.bgBrightness; $('bgContrast').value = state.canvas.bgContrast; $('bgGrayscale').value = state.canvas.bgGrayscale;
    $('gridSize').value = state.canvas.gridSize; $('gridOpacity').value = state.canvas.gridOpacity; $('gridEnabled')?.classList.toggle('on', !!state.canvas.gridEnabled); $('canvasGlow').value = state.canvas.canvasGlow; $('canvasColor').value = state.canvas.color; $('gridColor').value = state.canvas.gridColor;
    syncActivePatternControls(); $('boundaryFill').value = defaults.boundary.fill; $('boundaryStroke').value = defaults.boundary.stroke; $('boundaryOpacity').value = Math.round(defaults.boundary.opacity*100); $('boundaryOutside').value = Math.round(defaults.boundary.outsideOpacity*100); $('boundaryOutline').value = defaults.boundary.outlineWidth; $('boundaryGlow').value = defaults.boundary.glow; $('boundaryOpacityLeft').value = $('boundaryOpacity').value; $('boundaryOutsideLeft').value = $('boundaryOutside').value; $('boundaryGlowLeft').value = $('boundaryGlow').value;
    updateRangeOutputs();
  }

  function updateRangeOutputs() {
    document.querySelectorAll('.range-row input[type=range], .toolbar-range input[type=range], .editor-zoom-control input[type=range]').forEach(input => {
      const out = input.parentElement.querySelector('output') || input.parentElement.querySelector('b');
      if (!out) return;
      const label = (input.parentElement.querySelector('label')?.textContent || '').toLowerCase();
      const pctIds = ['opacity','brightness','contrast','grayscale','softness','rough','solid','stripe','edge lines','density','outside','grid opacity'];
      const degIds = ['rotation'];
      let suffix = '';
      if (pctIds.some(k => label.includes(k)) || ['roadOpacity','roadSolid','roadCenterStrength','roadOutlineStrength','patternOpacity','boundaryOpacity','boundaryOutside','gridOpacity','bgOpacity'].includes(input.id)) suffix = '%';
      if (degIds.some(k => label.includes(k)) || input.id === 'patternRotation') suffix = '°';
      out.textContent = `${input.value}${suffix}`;
    });
  }

  function bindUi() {
    window.addEventListener('resize', resizeCanvasBackingStore);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('wheel', onWheelZoom, { passive: false });
    window.addEventListener('pointermove', onPointerMove); window.addEventListener('pointerup', onPointerUp);
    document.querySelectorAll('[data-tool]').forEach(btn => btn.addEventListener('click', () => setTool(btn.dataset.tool)));
    $('finishRoadBtn').addEventListener('click', finishRoad);
    $('newProjectBtn').addEventListener('click', openNewProjectDialog);
    $('saveProjectBtn').addEventListener('click', saveProject);
    $('loadProjectInput').addEventListener('change', e => loadProject(e.target.files[0]));
    $('backgroundInput').addEventListener('change', e => importBackground(e.target.files[0]));
    $('clearBackgroundBtn').addEventListener('click', () => { state.canvas.background = null; bgImage = null; pushHistory('Cleared Background'); render(); });
    $('iconInput').addEventListener('change', e => importIcons([...e.target.files]));
    $('patternInput').addEventListener('change', e => importPattern(e.target.files[0]));
    $('addPatternLayerBtn').addEventListener('click', () => createPatternLayer(state.pattern?.type || 'dots'));
    $('reloadSymbolFolderBtn').addEventListener('click', async () => { await loadFolderSymbols(); renderIconLibrary(); });
    $('clearPatternImageBtn').addEventListener('click', () => { const p = activePattern(); if (p) { p.image = null; p.imageName = ''; p.imageObj = null; } importedPatternImage = null; syncActivePatternControls(); pushHistory('Cleared Pattern Image'); render(); });
    $('renameIconBtn').addEventListener('click', renameSelectedIcon); $('deleteIconBtn').addEventListener('click', deleteSelectedIcon);
    document.querySelectorAll('[data-fit]').forEach(btn => btn.addEventListener('click', () => { state.canvas.bgFit = btn.dataset.fit; pushHistory(`Background fit ${btn.dataset.fit}`); render(); }));
    document.querySelectorAll('[data-collapse]').forEach(btn => btn.addEventListener('click', () => $(btn.dataset.collapse).closest('.side-card').classList.toggle('collapsed')));
    $('generateRoadsBtn').addEventListener('click', generateRoads); $('generateBuildingsBtn').addEventListener('click', generateBuildings); $('generateMarkersBtn').addEventListener('click', generateMarkers); $('generateBoundaryBtn').addEventListener('click', generateBoundary); $('generateBoundaryMiniBtn').addEventListener('click', generateBoundary); $('selectBoundaryBtn').addEventListener('click', selectBoundary); $('clearBoundaryBtn').addEventListener('click', clearBoundary); $('generateIslandMiniBtn')?.addEventListener('click', generateIsland); $('selectIslandBtn')?.addEventListener('click', selectIslands); $('clearIslandBtn')?.addEventListener('click', clearIslands); $('generateRandomBtn').addEventListener('click', generateRandomMap);
    $('placeBuildingToolBtn')?.addEventListener('click', () => setTool('buildingStamp')); $('generateBuildingsMiniBtn')?.addEventListener('click', generateBuildings); $('selectBuildingsBtn')?.addEventListener('click', selectAllBuildings); $('clearBuildingsBtn')?.addEventListener('click', clearBuildings);
    $('snapToggle').addEventListener('click', () => toggleButton('snapToggle', 'snap')); $('guidesToggle').addEventListener('click', () => toggleButton('guidesToggle', 'guides')); $('centerlineToggle').addEventListener('click', () => { state.toggles.centerline = !state.toggles.centerline; $('centerlineToggle').classList.toggle('active', state.toggles.centerline); $('roadCenterToggle').classList.toggle('on', state.toggles.centerline); liveApplySelectedStyles(); render(); });
    $('patternToggle').addEventListener('click', () => { const p = activePattern() || (ensurePatternLayer(state.pattern?.type || 'dots'), activePattern()); if (p) p.enabled = !p.enabled; state.pattern.enabled = !!(p && p.enabled); $('patternToggle').classList.toggle('active', state.patterns?.some(x => x.enabled)); $('patternEnabled').classList.toggle('on', state.pattern.enabled); pushHistory('Pattern Toggle'); renderLayers(); render(); });
    $('quickRoughness').addEventListener('input', e => { $('roadRoughness').value = e.target.value; updateRangeOutputs(); liveApplySelectedStyles(); render(); }); $('quickGlow').addEventListener('input', e => { $('roadGlow').value = e.target.value; updateRangeOutputs(); liveApplySelectedStyles(); render(); });
    $('projectMenuBtn').addEventListener('click', () => toggleMenu('projectMenu')); $('exportMenuBtn').addEventListener('click', () => toggleMenu('exportMenu')); $('historyMenuBtn').addEventListener('click', () => toggleMenu('historyMenu'));
    document.querySelectorAll('[data-export]').forEach(btn => btn.addEventListener('click', () => handleExport(btn.dataset.export)));
    $('undoTopBtn').addEventListener('click', undo); $('redoTopBtn').addEventListener('click', redo); $('clearHistoryBtn').addEventListener('click', () => { history.clear(serializeState()); renderHistory(); });
    document.querySelectorAll('[data-style-tab]').forEach(btn => btn.addEventListener('click', () => setStyleTab(btn.dataset.styleTab)));
    document.querySelectorAll('[data-road-preset]').forEach(btn => btn.addEventListener('click', () => setRoadPreset(btn.dataset.roadPreset)));
    document.querySelectorAll('[data-building-mode]').forEach(btn => btn.addEventListener('click', () => { buildingMode = btn.dataset.buildingMode; document.querySelectorAll('[data-building-mode]').forEach(b => b.classList.toggle('active', b === btn)); }));
    document.querySelectorAll('[data-marker-shape]').forEach(btn => btn.addEventListener('click', () => { markerShape = btn.dataset.markerShape; document.querySelectorAll('[data-marker-shape]').forEach(b => b.classList.toggle('active', b === btn)); liveApplySelectedStyles(); render(); }));
    document.querySelectorAll('[data-pattern]').forEach(btn => btn.addEventListener('click', () => { createPatternLayer(btn.dataset.pattern, `Added Pattern Layer: ${btn.dataset.pattern}`); }));
    document.querySelectorAll('.switch').forEach(btn => btn.addEventListener('click', () => { btn.classList.toggle('on'); if (btn.id === 'gridEnabled') { state.canvas.gridEnabled = btn.classList.contains('on'); if (state.canvas.gridEnabled && Number($('gridOpacity').value) <= 0) { $('gridOpacity').value = 20; state.canvas.gridOpacity = 20; updateRangeOutputs(); } }
      if (btn.id === 'patternEnabled') { const p = activePattern() || (ensurePatternLayer(state.pattern?.type || 'dots'), activePattern()); if (p) p.enabled = btn.classList.contains('on'); state.pattern.enabled = !!(p && p.enabled); $('patternToggle').classList.toggle('active', state.patterns?.some(x => x.enabled)); renderLayers(); } liveApplySelectedStyles(); render(); }));
    document.querySelectorAll('input[type=range]:not(#zoomSlider)').forEach(input => input.addEventListener('input', () => { updateRangeOutputs(); updateStateFromControls(); liveApplySelectedStyles(); render(); }));
    document.querySelectorAll('input[type=color], .text-input:not(.transform-input)').forEach(input => input.addEventListener('input', () => { updateStateFromControls(); liveApplySelectedStyles(); render(); }));
    $('applyRoadStyleBtn').addEventListener('click', () => applyStyleToSelection('road')); $('applyBuildingStyleBtn').addEventListener('click', () => applyStyleToSelection('building')); $('applyMarkerStyleBtn').addEventListener('click', () => applyStyleToSelection('marker')); $('applyBoundaryStyleBtn').addEventListener('click', () => applyStyleToSelection('boundary'));
    $('addLayerBtn').addEventListener('click', addCustomLayer);
    $('zoomInBtn').addEventListener('click', () => zoomBy(1));
    $('zoomOutBtn').addEventListener('click', () => zoomBy(-1));
    $('zoomSlider').addEventListener('input', e => setZoom(Number(e.target.value) / 100));
    $('zoomReset100Btn').addEventListener('click', () => { state.view.zoom = 1; state.view.panX = 0; state.view.panY = 0; updateZoomUi(); render(); });
    $('resetViewBtn').addEventListener('click', fitView);
    $('centerViewBtn').addEventListener('click', centerView);
    document.querySelectorAll('.transform-input').forEach(input => input.addEventListener('input', () => { transformPanelLock = true; applyTransformFromPanel(); transformPanelLock = false; }));
    $('helpBtn').addEventListener('click', openDocumentation); $('closeDocBtn').addEventListener('click', closeDocumentation); $('docModal').addEventListener('click', e => { if (e.target.id === 'docModal') closeDocumentation(); });
    document.querySelectorAll('.symbol-group-head').forEach(head => { if (head.dataset.bound) return; head.dataset.bound = '1'; head.addEventListener('click', () => head.closest('.symbol-group')?.classList.toggle('open')); });
    ['buildingFillLeft','buildingStrokeLeft','buildingRadiusLeft','buildingGlowLeft'].forEach(id => $(id)?.addEventListener('input', () => syncBuildingControlsFromLeft(true)));
    ['buildingStampWidth','buildingStampHeight'].forEach(id => $(id)?.addEventListener('input', () => updateRangeOutputs()));
    stage.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/mapit-icon-id')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    stage.addEventListener('drop', e => { const iconId = e.dataTransfer.getData('text/mapit-icon-id'); if (!iconId) return; e.preventDefault(); addIcon(snap(toCanvasPoint(e)), iconId); });
    $('resolutionMenuBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      toggleResolutionMenu();
    });
    document.querySelectorAll('[data-resolution]').forEach(btn => btn.addEventListener('click', () => {
      const [w, h] = btn.dataset.resolution.split('x').map(Number);
      if ($('canvasWidthInput')) $('canvasWidthInput').value = w;
      if ($('canvasHeightInput')) $('canvasHeightInput').value = h;
    }));
    $('applyResolutionBtn')?.addEventListener('click', () => {
      setCanvasResolution($('canvasWidthInput').value, $('canvasHeightInput').value);
      closeResolutionMenu();
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.resolution-host')) closeResolutionMenu();
    });
    window.addEventListener('resize', () => {
      if ($('resolutionMenu')?.classList.contains('open')) positionResolutionMenu();
      centerView();
    });
    $('closeNewProjectBtn')?.addEventListener('click', closeNewProjectDialog);
    $('cancelNewProjectBtn')?.addEventListener('click', closeNewProjectDialog);
    $('createNewProjectBtn')?.addEventListener('click', () => {
      newProject($('newProjectWidthInput')?.value, $('newProjectHeightInput')?.value);
      closeNewProjectDialog();
      $('projectMenu')?.classList.remove('open');
    });
    $('newProjectModal')?.addEventListener('click', e => { if (e.target.id === 'newProjectModal') closeNewProjectDialog(); });
    document.querySelectorAll('[data-new-resolution]').forEach(btn => btn.addEventListener('click', () => {
      const [w, h] = btn.dataset.newResolution.split('x').map(Number);
      if ($('newProjectWidthInput')) $('newProjectWidthInput').value = w;
      if ($('newProjectHeightInput')) $('newProjectHeightInput').value = h;
    }));
    ['islandOpacityLeft','islandSmoothnessLeft','islandGlowLeft','islandFillLeft','islandStrokeLeft'].forEach(id => $(id)?.addEventListener('input', () => { updateRangeOutputs(); liveApplySelectedStyles(); render(); }));
    document.addEventListener('keydown', handleKey);
    document.addEventListener('keyup', handleKeyUp);
  }

  function updateStateFromControls() {
    state.canvas.bgOpacity = Number($('bgOpacity').value); state.canvas.bgBrightness = Number($('bgBrightness').value); state.canvas.bgContrast = Number($('bgContrast').value); state.canvas.bgGrayscale = Number($('bgGrayscale').value);
    state.canvas.gridSize = Number($('gridSize').value); state.canvas.gridOpacity = Number($('gridOpacity').value); state.canvas.gridEnabled = $('gridEnabled')?.classList.contains('on') || false; state.canvas.canvasGlow = Number($('canvasGlow').value); state.canvas.color = $('canvasColor').value; state.canvas.gridColor = $('gridColor').value;
    const p = activePattern();
    if (p) { p.scale = Number($('patternScale').value); p.opacity = Number($('patternOpacity').value); p.rotation = Number($('patternRotation').value); p.lineWidth = Number($('patternLineWidth').value); p.color = $('patternColor').value; state.pattern = { ...state.pattern, ...p }; }
    if ($('boundaryOpacityLeft')) $('boundaryOpacity').value = $('boundaryOpacityLeft').value;
    if ($('boundaryOutsideLeft')) $('boundaryOutside').value = $('boundaryOutsideLeft').value;
    if ($('boundaryGlowLeft')) $('boundaryGlow').value = $('boundaryGlowLeft').value;
  }

  function handleExport(kind) {
    if (kind === 'png') exportImage('png');
    if (kind === 'jpg') exportImage('jpg');
    if (kind === 'webp') exportImage('webp');
    if (kind === 'layerPng') exportImage('png', state.activeLayerId);
    if (kind === 'layersJson') exportLayersJson();
    if (kind === 'zip') exportZip();
  }

  function setTool(next) {
    if (next === 'pattern') {
      tool = 'select';
      document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === 'pattern'));
      createPatternLayer(state.pattern?.type || 'dots', 'Added Pattern Layer');
      currentRoadId = null;
      return;
    }
    tool = next;
    document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === next));
    if (next !== 'road') currentRoadId = null;
  }
  function toggleButton(id, key) { state.toggles[key] = !state.toggles[key]; $(id).classList.toggle('active', state.toggles[key]); render(); }
  function toggleMenu(id) { document.querySelectorAll('.top-menu').forEach(m => { if (m.id !== id) m.classList.remove('open'); }); $(id).classList.toggle('open'); }
  function setStyleTab(tab) { document.querySelectorAll('[data-style-tab]').forEach(b => b.classList.toggle('active', b.dataset.styleTab === tab)); document.querySelectorAll('.style-section').forEach(s => s.classList.remove('active')); const section = $(`style${tab[0].toUpperCase()+tab.slice(1)}`); if (section) section.classList.add('active'); }

  function undo() { const s = history.undo(); if (s) { restoreState(s); syncControlsFromState(); renderLayers(); renderIconLibrary(); renderHistory(); render(); } }
  function redo() { const s = history.redo(); if (s) { restoreState(s); syncControlsFromState(); renderLayers(); renderIconLibrary(); renderHistory(); render(); } }

  function openNewProjectDialog() {
    if ($('newProjectWidthInput')) $('newProjectWidthInput').value = W;
    if ($('newProjectHeightInput')) $('newProjectHeightInput').value = H;
    $('newProjectModal')?.classList.add('open');
    $('newProjectModal')?.setAttribute('aria-hidden', 'false');
  }

  function closeNewProjectDialog() {
    $('newProjectModal')?.classList.remove('open');
    $('newProjectModal')?.setAttribute('aria-hidden', 'true');
  }

  function newProject(width = W, height = H) {
    W = clamp(Math.round(Number(width) || W), 256, 8192);
    H = clamp(Math.round(Number(height) || H), 256, 8192);
    state.canvas.width = W;
    state.canvas.height = H;
    state.canvas.background = null;
    state.canvas.backgroundName = '';
    bgImage = null;
    state.objects = [];
    state.icons = state.icons.filter(i => i.source === 'builtin' || i.source === 'folder');
    state.layers = [];
    state.activeLayerId = null;
    selectedIconId = state.icons[0]?.id || null;
    selectedIds.clear();
    currentRoadId = null;
    state.pattern.enabled = false;
    state.patterns = [];
    state.activePatternId = null;
    state.canvas.gridEnabled = false;
    state.view.zoom = 1;
    state.view.panX = 0;
    state.view.panY = 0;
    $('gridEnabled')?.classList.remove('on');
    $('patternEnabled')?.classList.remove('on');
    $('patternToggle')?.classList.remove('active');
    updateResolutionUi();
    updateZoomUi();
    resizeCanvasBackingStore();
    pushHistory(`New Empty Project ${W}x${H}`);
    renderIconLibrary();
    renderLayers();
    render();
  }

  function renameSelectedIcon() {
    const icon = state.icons.find(i => i.id === selectedIconId); if (!icon) return;
    const name = prompt('Icon name:', icon.name); if (name) { icon.name = name; pushHistory('Renamed Icon'); renderIconLibrary(); }
  }
  function deleteSelectedIcon() {
    if (!selectedIconId) return;
    state.icons = state.icons.filter(i => i.id !== selectedIconId); state.objects = state.objects.filter(o => o.iconId !== selectedIconId); selectedIconId = state.icons[0]?.id || null; pushHistory('Deleted Icon'); renderIconLibrary(); render();
  }
  function addCustomLayer() { const id = uid('layer'); state.layers.unshift({ id, kind: 'custom', name: 'Custom Layer', description: 'Custom export layer', visible: true, locked: false, export: true }); state.activeLayerId = id; pushHistory('Added Layer'); renderLayers(); }

  function selectionBounds() {
    const selected = state.objects.filter(o => selectedIds.has(o.id));
    if (!selected.length) return null;
    return selected.map(boundsOf).reduce((a, b) => {
      const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
      const x2 = Math.max(a.x + a.w, b.x + b.w), y2 = Math.max(a.y + a.h, b.y + b.h);
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    });
  }

  function updateTransformPanel() {
    if (transformPanelLock) return;
    const ids = ['selX','selY','selW','selH'];
    const b = selectionBounds();
    ids.forEach(id => { const el = $(id); if (el) el.disabled = !b; });
    const hint = $('transformHint');
    if (!b) {
      ids.forEach(id => { const el = $(id); if (el) el.value = ''; });
      if (hint) hint.textContent = 'Select an object to move, scale or reshape it. Road and boundary points can also be dragged directly.';
      return;
    }
    $('selX').value = Math.round(b.x); $('selY').value = Math.round(b.y); $('selW').value = Math.round(b.w); $('selH').value = Math.round(b.h);
    if (hint) hint.textContent = `${selectedIds.size} selected · edit X/Y/W/H live or drag road/boundary points.`;
  }

  function applyTransformFromPanel() {
    const oldB = selectionBounds();
    if (!oldB || oldB.w <= 0 || oldB.h <= 0) return;
    const nx = Number($('selX').value), ny = Number($('selY').value), nw = Math.max(1, Number($('selW').value)), nh = Math.max(1, Number($('selH').value));
    if (![nx, ny, nw, nh].every(Number.isFinite)) return;
    const sx = nw / oldB.w, sy = nh / oldB.h;
    state.objects.forEach(o => {
      if (!selectedIds.has(o.id) || layerLocked(o.layerId)) return;
      if (o.type === 'road' || o.type === 'terrain') {
        o.points = o.points.map(pt => ({ x: nx + (pt.x - oldB.x) * sx, y: ny + (pt.y - oldB.y) * sy }));
      } else if (o.type === 'building') {
        o.x = nx + (o.x - oldB.x) * sx;
        o.y = ny + (o.y - oldB.y) * sy;
        o.w = Math.max(1, o.w * sx);
        o.h = Math.max(1, o.h * sy);
      } else {
        o.x = nx + (o.x - oldB.x) * sx;
        o.y = ny + (o.y - oldB.y) * sy;
        if (o.style) o.style.size = Math.max(8, (o.style.size || 34) * Math.min(sx, sy));
      }
    });
    render();
  }

  function fitView() {
    state.view.zoom = 1;
    state.view.panX = 0;
    state.view.panY = 0;
    updateZoomUi();
    resizeCanvasBackingStore();
    render();
  }

  function onWheelZoom(evt) {
    evt.preventDefault();
    zoomBy(evt.deltaY < 0 ? 1 : -1, evt.clientX, evt.clientY);
  }

  function markdownToHtml(md) {
    const esc = md.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
    return esc
      .replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '<br><br>');
  }

  function fallbackDocumentation() {
    return `# MAPit User Guide\n\nMAPit is an offline 2D mini-map editor. Start it with start_MAPit.bat, open http://127.0.0.1:5501/, then create roads, buildings, boundaries, symbols, markers and layer-based exports.\n\n## Basic Workflow\nImport a background if you need a tracing reference, zoom into the editor, draw roads and buildings, organize objects in layers, then export the result.\n\n## Dependencies\nMAPit uses browser-native Canvas APIs and local runtime assets. Bootstrap placeholder files are stored in assets/vendor/bootstrap. No CDN is required.`;
  }

  async function openDocumentation() {
    const modal = $('docModal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    try {
      const res = await fetch('assets/documentation.md', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const md = await res.text();
      $('docContent').innerHTML = markdownToHtml(md && md.trim() ? md : fallbackDocumentation());
    } catch (err) {
      $('docContent').innerHTML = markdownToHtml(fallbackDocumentation());
    }
  }

  function closeDocumentation() {
    $('docModal').classList.remove('open');
    $('docModal').setAttribute('aria-hidden','true');
  }


  function delegatedRepairClick(evt) {
    const btn = evt.target.closest ? evt.target.closest('[data-tool],[data-style-tab],[data-road-preset],[data-building-mode],[data-marker-shape],[data-pattern],[data-export],#projectMenuBtn,#exportMenuBtn,#historyMenuBtn') : null;
    if (!btn) return;
    evt.preventDefault();
    evt.stopPropagation();
    if (evt.stopImmediatePropagation) evt.stopImmediatePropagation();
    if (btn.dataset?.tool) setTool(btn.dataset.tool);
    if (btn.dataset?.styleTab) setStyleTab(btn.dataset.styleTab);
    if (btn.dataset?.roadPreset) setRoadPreset(btn.dataset.roadPreset);
    if (btn.dataset?.buildingMode) { buildingMode = btn.dataset.buildingMode; document.querySelectorAll('[data-building-mode]').forEach(b => b.classList.toggle('active', b === btn)); }
    if (btn.dataset?.markerShape) { markerShape = btn.dataset.markerShape; document.querySelectorAll('[data-marker-shape]').forEach(b => b.classList.toggle('active', b === btn)); liveApplySelectedStyles(); render(); }
    if (btn.dataset?.pattern) { createPatternLayer(btn.dataset.pattern, `Added Pattern Layer: ${btn.dataset.pattern}`); }
    if (btn.dataset?.export) handleExport(btn.dataset.export);
    if (btn.id === 'projectMenuBtn') toggleMenu('projectMenu');
    if (btn.id === 'exportMenuBtn') toggleMenu('exportMenu');
    if (btn.id === 'historyMenuBtn') toggleMenu('historyMenu');
  }

  function handleKey(e) {
    if (e.code === 'Space' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName || '')) { spacePressed = true; canvas.style.cursor = 'grab'; e.preventDefault(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    if ((e.ctrlKey && e.key.toLowerCase() === 'y') || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z')) { e.preventDefault(); redo(); }
    if (e.key === 'Delete') { deleteObjects([...selectedIds], 'Deleted Selection'); }
    if (e.key.toLowerCase() === 'p') setTool('road');
    if (e.key.toLowerCase() === 'b') setTool('building');
    if (e.key.toLowerCase() === 'm') setTool('marker');
    if (e.key.toLowerCase() === 'v') setTool('select');
    if (e.key === 'Escape') { if ($('docModal').classList.contains('open')) closeDocumentation(); selectedIds.clear(); currentRoadId = null; drag = null; render(); }
  }


  function handleKeyUp(e) {
    if (e.code === 'Space') {
      spacePressed = false;
      if (!panDrag) canvas.style.cursor = '';
    }
  }

  function init() {
    bindUi(); syncControlsFromState(); syncBuildingControlsToLeft(); updateZoomUi(); updateResolutionUi(); setRoadPreset('asphalt'); seedBuiltInSymbols(); history.push(serializeState(), 'New Empty Project'); renderHistory(); renderLayers(); resizeCanvasBackingStore();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
