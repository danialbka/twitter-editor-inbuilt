import { Input, Output, Conversion, BlobSource, BufferTarget, Mp4OutputFormat, ALL_FORMATS, QUALITY_HIGH } from './vendor/mediabunny.min.mjs';

const MARKUP = `

<header class="top">
  <button id="newBtn" class="text-btn">Open</button>
  <div id="title" class="title"></div>
  <button id="exportBtn" class="pill" disabled>Export</button>
</header>

<main id="stage">
  <div id="empty">
    <label class="drop" for="file">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="14" height="14" rx="3"/><path d="M16.5 10l5-3v10l-5-3"/></svg>
      <h1>Choose a video</h1>
      <p>or drop it here</p>
    </label>
    <p>Trim and crop, then export an MP4 for X / Twitter.</p>
  </div>
  <div id="viewport">
    <canvas id="view"></canvas>
    <div id="cropBox">
      <div class="grid"><i></i><i></i><i></i><i></i></div>
      <div class="eh" data-h="t"></div><div class="eh" data-h="b"></div>
      <div class="eh" data-h="l"></div><div class="eh" data-h="r"></div>
      <div class="ch" data-h="tl"></div><div class="ch" data-h="tr"></div>
      <div class="ch" data-h="bl"></div><div class="ch" data-h="br"></div>
    </div>
  </div>
</main>

<section id="panel">
  <div id="trimPanel" class="tool">
    <div class="trimRow">
      <button id="playBtn" aria-label="Play"></button>
      <div id="strip">
        <canvas id="thumbs"></canvas>
        <div class="shade l"></div><div class="shade r"></div>
        <div id="win">
          <div class="th" data-h="l"><svg viewBox="0 0 8 14"><path d="M6 1L1.5 7 6 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <div class="th" data-h="r"><svg viewBox="0 0 8 14"><path d="M2 1l4.5 6L2 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        </div>
        <div id="playhead"></div>
      </div>
    </div>
    <div class="times"><span id="tStart"></span><span id="tLen" class="len"></span><span id="tEnd"></span></div>
  </div>

  <div id="cropPanel" class="tool">
    <div class="chips" id="chips"></div>
    <div class="cropFoot"><span id="cropInfo"></span><button id="resetBtn">Reset</button></div>
  </div>

  <nav class="tabs">
    <button class="tab on" data-mode="trim">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="14" height="14" rx="3"/><path d="M16.5 10l5-3v10l-5-3"/></svg>Video</button>
    <button class="tab" data-mode="crop">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>Crop</button>
    <button class="tab" id="muteBtn"></button>
  </nav>
</section>

<div id="modal"><div class="sheet" id="sheet"></div></div>
<div id="toast"></div>
<input type="file" id="file" accept="video/*" hidden>
<video id="src" playsinline preload="auto"></video>
`;

/**
 * Mounts the editor into `parent`. Standalone it fills the page; with `embed: true` it
 * edits `opts.file` and reports back through `onDone(file)` / `onCancel()`.
 */
export function mountEditor(parent, opts = {}) {

  const el = document.createElement('div');
  el.className = 'ce mode-trim';
  el.innerHTML = MARKUP;
  parent.appendChild(el);
  const $ = s => el.querySelector(s);
  const EMBED = !!opts.embed;
  if (EMBED) el.classList.add('embed');

  // Window listeners and loops, torn down by destroy().
  const cleanups = [];
  const listen = (target, type, fn, options) => { target.addEventListener(type, fn, options); cleanups.push(() => target.removeEventListener(type, fn, options)); };
  let alive = true;
  const video = $('#src'), view = $('#view'), vctx = view.getContext('2d');
  const viewport = $('#viewport'), stage = $('#stage'), cropBox = $('#cropBox');
  const strip = $('#strip'), thumbs = $('#thumbs'), win = $('#win'), playhead = $('#playhead');
  const fileInput = $('#file');

  const TWITTER_MAX = 140;       // 2:20 for standard accounts
  const MIN_LEN = 0.3;           // shortest trim, seconds
  const MIN_CROP = 0.06;         // smallest crop side, fraction of frame
  const MAX_SIDE = 1920;         // longest exported side

  const ICON = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="14" y="4" width="4.5" height="16" rx="1.2"/></svg>',
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>',
  };

  const ASPECTS = [
    { id: 'free', label: 'Freeform', value: null },
    { id: 'orig', label: 'Original', value: 'orig' },
    { id: '16:9', label: '16:9', value: 16/9 },
    { id: '1:1',  label: 'Square', value: 1 },
    { id: '4:5',  label: '4:5', value: 4/5 },
    { id: '9:16', label: '9:16', value: 9/16 },
  ];

  let state = null;   // { file, url, vw, vh, duration, start, end, crop:{x,y,w,h}, aspectId, aspect }
  let mode = 'trim';
  let muted = false;
  let exporting = null;

  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const fmt = t => {
    if (!isFinite(t)) t = 0;
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  };
  const once = (el, ev, ms = 4000) => new Promise(res => {
    const done = () => { el.removeEventListener(ev, done); clearTimeout(t); res(); };
    const t = setTimeout(done, ms);
    el.addEventListener(ev, done);
  });
  function toast(msg, ms = 2600) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* ---------- Loading ---------- */
  $('#newBtn').onclick = () => fileInput.click();
  fileInput.onchange = () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); fileInput.value = ''; };
  if (!EMBED) {
  listen(window, 'dragover', e => { e.preventDefault(); el.classList.add('dragging'); });
  listen(window, 'dragleave', e => { if (!e.relatedTarget) el.classList.remove('dragging'); });
  listen(window, 'drop', e => {
    e.preventDefault(); el.classList.remove('dragging');
    const f = [...e.dataTransfer.files].find(f => f.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(f.name));
    if (f) loadFile(f); else toast('That doesn’t look like a video');
  });
  }

  function loadFile(file) {
    if (exporting) return;
    if (state) URL.revokeObjectURL(state.url);
    const url = URL.createObjectURL(file);
    video.pause();
    video.src = url;
    video.onerror = () => toast('This browser can’t play that video format.', 5000);
    video.onloadedmetadata = async () => {
      // Some files report Infinity until the end is probed.
      if (!isFinite(video.duration)) { video.currentTime = 1e9; await once(video, 'durationchange', 3000); video.currentTime = 0; }
      state = {
        file, url, vw: video.videoWidth, vh: video.videoHeight, duration: video.duration,
        start: 0, end: video.duration, crop: { x: 0, y: 0, w: 1, h: 1 }, aspectId: 'free', aspect: null,
      };
      el.classList.add('loaded');
      $('#exportBtn').disabled = false;
      setMode('trim');
      renderChips(); applyCrop(); updateTrimUI();
      genThumbs();
    };
  }

  /* ---------- Layout & drawing ---------- */
  function layout() {
    if (!state) return;
    const { vw, vh, crop } = state;
    const r = stage.getBoundingClientRect();
    const pad = mode === 'crop' ? 28 : 12;
    const sw = mode === 'crop' ? vw : crop.w * vw, sh = mode === 'crop' ? vh : crop.h * vh;
    const s = Math.min((r.width - pad * 2) / sw, (r.height - pad * 2) / sh);
    const w = Math.max(1, Math.round(sw * s)), h = Math.max(1, Math.round(sh * s));
    viewport.style.width = w + 'px'; viewport.style.height = h + 'px';
    const dpr = devicePixelRatio || 1;
    view.width = Math.round(w * dpr); view.height = Math.round(h * dpr);
    draw();
  }
  const resizer = new ResizeObserver(() => { layout(); genThumbsDebounced(); });
  resizer.observe(stage);
  cleanups.push(() => resizer.disconnect());

  function draw() {
    if (!state || video.readyState < 2) return;
    const { vw, vh, crop } = state;
    if (mode === 'crop') vctx.drawImage(video, 0, 0, vw, vh, 0, 0, view.width, view.height);
    else vctx.drawImage(video, crop.x * vw, crop.y * vh, crop.w * vw, crop.h * vh, 0, 0, view.width, view.height);
  }

  function tick() {
    if (!alive) return;
    if (state) {
      if (!exporting && !video.paused && video.currentTime >= state.end) {
        video.pause(); video.currentTime = state.end;
      }
      draw();
      playhead.style.left = (video.currentTime / state.duration * 100) + '%';
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ---------- Modes ---------- */
  el.querySelectorAll('.tab[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  function setMode(m) {
    mode = m;
    el.classList.toggle('mode-trim', m === 'trim');
    el.classList.toggle('mode-crop', m === 'crop');
    el.querySelectorAll('.tab[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    layout();
  }

  /* ---------- Playback & sound ---------- */
  const playBtn = $('#playBtn');
  function syncPlayBtn() { playBtn.innerHTML = video.paused ? ICON.play : ICON.pause; }
  video.addEventListener('play', syncPlayBtn);
  video.addEventListener('pause', syncPlayBtn);
  syncPlayBtn();

  function togglePlay() {
    if (!state || exporting) return;
    if (video.paused) {
      if (video.currentTime >= state.end - 0.05 || video.currentTime < state.start) video.currentTime = state.start;
      video.play();
    } else video.pause();
  }
  playBtn.onclick = togglePlay;
  // Embedded, the editor owns the keyboard so X's shortcuts (like "l" to like) don't fire underneath it.
  listen(window, 'keydown', e => {
    if (EMBED) e.stopImmediatePropagation();
    if (e.code === 'Space' && !e.target.closest?.('input, textarea')) { e.preventDefault(); togglePlay(); }
    else if (EMBED && e.key === 'Escape' && !exporting) opts.onCancel?.();
  }, true);
  if (EMBED) for (const type of ['keyup', 'keypress']) listen(window, type, e => e.stopImmediatePropagation(), true);

  const muteBtn = $('#muteBtn');
  function syncMute() {
    muteBtn.innerHTML = (muted ? ICON.mute : ICON.sound) + (muted ? 'Muted' : 'Sound');
    muteBtn.classList.toggle('on', muted);
    video.muted = muted;
  }
  muteBtn.onclick = () => { muted = !muted; syncMute(); toast(muted ? 'Export will have no sound' : 'Sound on'); };
  syncMute();

  /* ---------- Trim ---------- */
  function updateTrimUI() {
    const { start, end, duration } = state;
    const l = start / duration * 100, r = (1 - end / duration) * 100;
    win.style.left = l + '%'; win.style.right = r + '%';
    $('.shade.l').style.width = l + '%'; $('.shade.r').style.width = r + '%';
    const len = end - start, over = len > TWITTER_MAX + 0.05;
    $('#tStart').textContent = fmt(start);
    $('#tEnd').textContent = fmt(end);
    $('#tLen').textContent = fmt(len) + (over ? ' · over 2:20' : '');
    $('#tLen').classList.toggle('over', over);
    const title = $('#title');
    title.innerHTML = `<b>${fmt(len)}</b>${Math.round(state.crop.w * state.vw)}×${Math.round(state.crop.h * state.vh)}`;
    title.classList.toggle('over', over);
  }

  let trimDrag = null;
  strip.addEventListener('pointerdown', e => {
    if (!state || exporting) return;
    const r = strip.getBoundingClientRect();
    const x = e.clientX - r.left;
    const toX = t => t / state.duration * r.width;
    let h = e.target.closest('.th')?.dataset.h;
    if (!h) {
      const onPlayhead = Math.abs(x - toX(video.currentTime)) <= 10;
      const inWindow = x > toX(state.start) && x < toX(state.end);
      h = inWindow && !onPlayhead ? 'window' : 'scrub';
    }
    trimDrag = { h, id: e.pointerId, x0: e.clientX, start0: state.start, end0: state.end, moved: false };
    strip.setPointerCapture(e.pointerId);
    if (h === 'l' || h === 'r') { video.pause(); strip.classList.add('edge-drag'); }
    if (h !== 'window') moveTrim(e);
  });
  strip.addEventListener('pointermove', e => { if (trimDrag && e.pointerId === trimDrag.id) moveTrim(e); });
  const endTrim = e => {
    if (!trimDrag) return;
    if (trimDrag.h === 'window' && !trimDrag.moved) { trimDrag.h = 'scrub'; moveTrim(e); }   // a tap seeks
    else if (trimDrag.h !== 'scrub') video.currentTime = state.start;
    trimDrag = null; strip.classList.remove('edge-drag', 'moving');
  };
  strip.addEventListener('pointerup', endTrim);
  strip.addEventListener('pointercancel', endTrim);

  function moveTrim(e) {
    const r = strip.getBoundingClientRect();
    const t = clamp((e.clientX - r.left) / r.width, 0, 1) * state.duration;
    const minLen = Math.min(MIN_LEN, state.duration);
    if (trimDrag.h === 'window') {
      const dx = e.clientX - trimDrag.x0;
      if (!trimDrag.moved && Math.abs(dx) < 4) return;
      if (!trimDrag.moved) { trimDrag.moved = true; video.pause(); strip.classList.add('edge-drag', 'moving'); }
      const len = trimDrag.end0 - trimDrag.start0;
      state.start = clamp(trimDrag.start0 + dx / r.width * state.duration, 0, state.duration - len);
      state.end = state.start + len;
      video.currentTime = state.start;
    }
    else if (trimDrag.h === 'l') { state.start = clamp(t, 0, state.end - minLen); video.currentTime = state.start; }
    else if (trimDrag.h === 'r') { state.end = clamp(t, state.start + minLen, state.duration); video.currentTime = state.end; }
    else video.currentTime = clamp(t, state.start, state.end);
    updateTrimUI();
  }

  let thumbToken = 0;
  async function genThumbs() {
    if (!state) return;
    const token = ++thumbToken;
    const dpr = devicePixelRatio || 1, r = strip.getBoundingClientRect();
    if (!r.width) return;
    const c = document.createElement('canvas');
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const g = c.getContext('2d');
    const th = c.height, tw = Math.max(8, th * state.vw / state.vh), n = Math.ceil(c.width / tw);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = state.url;
    await once(v, 'loadeddata');
    for (let i = 0; i < n; i++) {
      if (token !== thumbToken) break;
      v.currentTime = clamp((i + 0.5) * tw / c.width * state.duration, 0, state.duration - 0.05);
      await once(v, 'seeked', 3000);
      g.drawImage(v, i * tw, 0, tw, th);
      if (i % 4 === 3 || i === n - 1) { thumbs.width = c.width; thumbs.height = c.height; thumbs.getContext('2d').drawImage(c, 0, 0); }
    }
    v.removeAttribute('src'); v.load();
  }
  let thumbTimer;
  function genThumbsDebounced() { clearTimeout(thumbTimer); thumbTimer = setTimeout(genThumbs, 250); }

  /* ---------- Crop ---------- */
  function renderChips() {
    const el = $('#chips'); el.innerHTML = '';
    for (const a of ASPECTS) {
      const b = document.createElement('button');
      b.className = 'chip' + (state.aspectId === a.id ? ' on' : '');
      const ratio = a.value === 'orig' ? state.vw / state.vh : a.value;
      const shape = ratio ? `<span class="shape" style="width:${ratio >= 1 ? 16 : 16 * ratio}px;height:${ratio >= 1 ? 16 / ratio : 16}px"></span>` : '';
      b.innerHTML = shape + a.label;
      b.onclick = () => setAspect(a);
      el.appendChild(b);
    }
  }

  function setAspect(a) {
    const { vw, vh } = state;
    state.aspectId = a.id;
    state.aspect = a.value === 'orig' ? vw / vh : a.value;
    if (state.aspect) {
      const an = state.aspect * vh / vw;   // aspect in normalized units
      let w = 1, h = 1 / an;
      if (h > 1) { h = 1; w = an; }
      state.crop = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
    }
    renderChips(); applyCrop();
  }

  $('#resetBtn').onclick = () => {
    state.crop = { x: 0, y: 0, w: 1, h: 1 };
    setAspect(ASPECTS[0]);
  };

  function applyCrop() {
    const c = state.crop;
    Object.assign(cropBox.style, { left: c.x * 100 + '%', top: c.y * 100 + '%', width: c.w * 100 + '%', height: c.h * 100 + '%' });
    el.classList.toggle('locked', !!state.aspect);
    const [w, h] = outputSize();
    $('#cropInfo').textContent = `Export ${w}×${h}`;
    updateTrimUI();
  }

  function outputSize() {
    const sw = state.crop.w * state.vw, sh = state.crop.h * state.vh;
    const s = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    const even = n => Math.max(2, Math.round(n / 2) * 2);   // H.264 needs even dimensions
    return [even(sw * s), even(sh * s)];
  }

  function resizeCrop(s, h, dx, dy) {
    if (h === 'move') return { ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) };
    let l = s.x, t = s.y, r = s.x + s.w, b = s.y + s.h;
    const L = h.includes('l'), R = h.includes('r'), T = h.includes('t'), B = h.includes('b');
    if (!state.aspect) {
      if (L) l = clamp(l + dx, 0, r - MIN_CROP);
      if (R) r = clamp(r + dx, l + MIN_CROP, 1);
      if (T) t = clamp(t + dy, 0, b - MIN_CROP);
      if (B) b = clamp(b + dy, t + MIN_CROP, 1);
      return { x: l, y: t, w: r - l, h: b - t };
    }
    // Locked aspect: resize from a corner, anchored at the opposite corner.
    const an = state.aspect * state.vh / state.vw;
    const ax = L ? r : l, ay = T ? b : t;
    let w = Math.max(L ? s.w - dx : s.w + dx, (T ? s.h - dy : s.h + dy) * an);
    const maxW = Math.min(L ? ax : 1 - ax, (T ? ay : 1 - ay) * an);
    w = Math.min(Math.max(w, MIN_CROP, MIN_CROP * an), maxW);
    const hh = w / an;
    return { x: L ? ax - w : ax, y: T ? ay - hh : ay, w, h: hh };
  }

  let cropDrag = null;
  cropBox.addEventListener('pointerdown', e => {
    if (exporting) return;
    const r = viewport.getBoundingClientRect();
    cropDrag = { h: e.target.dataset.h || 'move', x: e.clientX, y: e.clientY, W: r.width, H: r.height, start: { ...state.crop }, id: e.pointerId };
    cropBox.setPointerCapture(e.pointerId);
    cropBox.classList.add('active');
  });
  cropBox.addEventListener('pointermove', e => {
    if (!cropDrag || e.pointerId !== cropDrag.id) return;
    state.crop = resizeCrop(cropDrag.start, cropDrag.h, (e.clientX - cropDrag.x) / cropDrag.W, (e.clientY - cropDrag.y) / cropDrag.H);
    applyCrop();
  });
  const endCrop = () => { cropDrag = null; cropBox.classList.remove('active'); };
  cropBox.addEventListener('pointerup', endCrop);
  cropBox.addEventListener('pointercancel', endCrop);

  /* ---------- Export ---------- */
  // Converts the file directly with WebCodecs (much faster than real time). Packets are
  // copied untouched when nothing needs re-encoding.
  const modal = $('#modal'), sheet = $('#sheet');
  $('#exportBtn').onclick = startExport;

  function isUnedited() {
    const c = state.crop;
    return state.start === 0 && state.end === state.duration && !muted &&
      c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1;
  }

  async function renderClip(onProgress) {
    const { vw, vh, crop, start, end } = state;
    const [ow, oh] = outputSize();
    const full = crop.x === 0 && crop.y === 0 && crop.w === 1 && crop.h === 1;
    const rect = { left: Math.round(crop.x * vw), top: Math.round(crop.y * vh), width: Math.round(crop.w * vw), height: Math.round(crop.h * vh) };
    const scaled = ow !== rect.width || oh !== rect.height;

    const input = new Input({ source: new BlobSource(state.file), formats: ALL_FORMATS });
    const audioTracks = await input.getAudioTracks();
    let soundTrack = null;
    for (const t of audioTracks) if (await t.canDecode()) { soundTrack = t; break; }
    if (!muted && audioTracks.length && !soundTrack &&
        !confirm('This browser can’t read this video’s sound. Continue without sound?')) throw new Error('cancelled');
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input, output,
      trim: { start, end },
      video: {
        codec: 'avc', quality: QUALITY_HIGH,
        ...(full ? {} : { crop: rect }),
        ...(scaled ? { width: ow, height: oh, fit: 'fill' } : {}),
      },
      audio: track => muted || track !== soundTrack
        ? { discard: true }
        : { codec: 'aac', numberOfChannels: Math.min(track.numberOfChannels, 2) },
      showWarnings: false,
    });
    const lostAudio = soundTrack && conversion.discardedTracks.some(t => t.track === soundTrack);
    const lostVideo = conversion.discardedTracks.some(t => t.track.type === 'video');
    if (!conversion.isValid || lostVideo) throw new Error('This video can’t be converted here: ' + conversion.discardedTracks.map(t => t.reason).join(', '));
    if (lostAudio && !confirm('The sound couldn’t be converted in this browser. Continue without sound?')) throw new Error('cancelled');
    exporting.conversion = conversion;
    conversion.onProgress = onProgress;
    await conversion.execute();

    const base = state.file.name.replace(/\.[^.]+$/, '');
    return new File([output.target.buffer], `${base}-edited.mp4`, { type: 'video/mp4' });
  }

  async function startExport() {
    if (!state || exporting) return;
    video.pause();
    if (EMBED && isUnedited()) return opts.onDone?.(state.file);
    if (!('VideoEncoder' in window)) { toast('This browser can’t export video. Use Chrome, Helium or another Chromium browser.'); return; }

    exporting = { cancelled: false };
    showProgress();
    try {
      const file = await renderClip(p => setProgress(p));
      if (exporting.cancelled) return;
      if (EMBED) opts.onDone?.(file);
      else showResult(file);
    } catch (err) {
      if (!exporting.cancelled) {
        modal.classList.remove('show');
        if (err.message !== 'cancelled') { console.error(err); toast(err.message || 'Export failed', 5000); }
      }
    } finally {
      if (exporting?.cancelled) modal.classList.remove('show');
      exporting = null;
    }
  }

  function showProgress() {
    sheet.innerHTML = `
      <h2>${EMBED ? 'Preparing clip…' : 'Exporting…'}</h2>
      <div class="bar"><i id="barFill"></i></div>
      <div class="pct" id="pct">0%</div>
      <div class="actions"><button class="btn plain" id="cancelExport">Cancel</button></div>`;
    $('#cancelExport').onclick = () => {
      if (!exporting) return;
      exporting.cancelled = true;
      exporting.conversion?.cancel();
      modal.classList.remove('show');
    };
    modal.classList.add('show');
  }
  function setProgress(p) {
    p = clamp(p, 0, 1);
    const fill = $('#barFill'); if (fill) fill.style.width = p * 100 + '%';
    const pct = $('#pct'); if (pct) pct.textContent = Math.round(p * 100) + '%';
  }

  function showResult(file) {
    const url = URL.createObjectURL(file);
    const mb = (file.size / 1048576).toFixed(1);
    const len = state.end - state.start;
    const notes = [];
    if (len > TWITTER_MAX + 0.05) notes.push('<p class="note warn">Longer than 2:20 — only X Premium accounts can post this.</p>');
    if (file.size > 512 * 1048576) notes.push('<p class="note warn">Over 512 MB — X will reject it.</p>');

    sheet.innerHTML = `
      <h2>Ready</h2>
      <p>${file.name} · ${mb} MB · ${fmt(len)}</p>
      <video src="${url}" controls playsinline></video>
      ${notes.join('')}
      <div class="actions">
        <a class="btn primary" id="dlBtn" href="${url}" download="${file.name}" style="text-decoration:none">Download</a>
        <button class="btn plain" id="doneBtn">Back to editing</button>
      </div>`;
    $('#doneBtn').onclick = () => { modal.classList.remove('show'); sheet.innerHTML = ''; URL.revokeObjectURL(url); };
  }

  /* ---------- Embedded in X's composer ---------- */
  if (EMBED) {
    $('#newBtn').textContent = 'Cancel';
    $('#newBtn').onclick = () => opts.onCancel?.();
    $('#exportBtn').textContent = 'Done';
  }
  if (opts.file) loadFile(opts.file);

  return {
    destroy() {
      alive = false;
      exporting?.conversion?.cancel();
      thumbToken++;
      video.pause();
      video.removeAttribute('src'); video.load();
      if (state) URL.revokeObjectURL(state.url);
      cleanups.forEach(fn => fn());
      el.remove();
    },
  };
}
