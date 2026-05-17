import { useEffect, useRef, useState, useCallback } from "react";

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface Particle {
  bx: number; by: number; bz: number;
  wx: number; wy: number; wz: number;
  vx: number; vy: number; vz: number;
  sx: number; sy: number;
  baseSize: number;
  energy: number;
  dissolve: number;
  noiseT: number;
  band: number;
}

interface SphereWave {
  radius:    number;
  speed:     number;
  energy:    number;
  thickness: number;
}

interface WaveDot {
  x: number;
  y: number;
  alpha: number;
  targetAlpha: number;
  size: number;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const N             = 420;
const RADIUS        = 235;
const CONNECT_DIST  = 96;
const MAX_CONN      = 6;
const SPRING_K      = 0.038;
const DAMPING       = 0.905;
const MAX_DISP      = RADIUS * 0.07;
const AUTO_ROT_Y    = 0.00052;
const AUTO_ROT_X    = 0.00013;
const MOUSE_R       = 180;
const MOUSE_F       = 4.0;
const AUDIO_F_LOW   = 0.08;
const AUDIO_F_HIGH  = 1.5;
const THRESHOLD     = 0.42;   // only real speech crosses this bar
const NOISE_AMT     = 2.5;
const NOISE_SPD     = 0.00045;
const WAVE_DOTS     = 32;
const MIN_ZOOM      = 0.48;
const MAX_ZOOM      = 1.38;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const lerp  = (a: number, b: number, t: number) => {
  const r = a + (b - a) * t;
  return isFinite(r) ? r : a;
};
const clamp = (v: number, lo: number, hi: number) =>
  isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;

function snoise(x: number, y: number, t: number) {
  return (
    Math.sin(x * 2.3 + t) * 0.4 +
    Math.sin(y * 1.7 - t * 0.9) * 0.35 +
    Math.sin((x - y) * 1.1 + t * 1.3) * 0.25
  );
}
function rotY(x: number, y: number, z: number, a: number) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: x * c + z * s, y, z: -x * s + z * c };
}
function rotX(x: number, y: number, z: number, a: number) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x, y: y * c - z * s, z: y * s + z * c };
}
function hexToRgb(hex: string) {
  const m = hex.replace("#", "").match(/.{2}/g)!;
  return { r: parseInt(m[0], 16), g: parseInt(m[1], 16), b: parseInt(m[2], 16) };
}

// ─── TRANSLATIONS ─────────────────────────────────────────────────────────────
const TR = {
  pt: {
    subtitle:'SOUND REACTIVE SPHERE',
    desc:'Esfera neural interativa que reage em tempo real ao som do ambiente, traduzindo nuances sonoras em movimentos orgânicos e conexões vivas.',
    estado:'ESTADO ATUAL', ouvindo:'OUVINDO...', semMic:'SEM MICROFONE', aguardando:'AGUARDANDO',
    reacao:'REAÇÃO AO SOM',
    reacoes:['Expansão da esfera','Aumento de conexões','Vibração interna','Ondas de energia','Pulsações do núcleo','Partículas orbitais','Distorção sutil'],
    intensidade:'INTENSIDADE', sensibilidade:'SENSIBILIDADE',
    capturaMicro:'CAPTURA DE MICRO SOM', nivelMin:'NÍVEL MÍNIMO DETECTADO',
    respiracao:'RESPIRAÇÃO', suave:'SUAVE', inalando:'INALANDO', exalando:'EXALANDO',
    tech:'TECNOLOGIA', perf:'PERFORMANCE', compat:'COMPATÍVEL COM',
    techItems:['WEB AUDIO API','HTML5 + CSS3 + REACT','SEM BIBLIOTECAS EXTERNAS'],
    perfItems:['60 FPS','ANIMAÇÃO SUAVE','RESPONSIVO'],
    compatItems:['OBS STUDIO','BROWSER SOURCE','FUNDO TRANSPARENTE'],
    cor:'COR', selecionarCor:'SELECIONAR COR', hex:'HEX',
    ativarMic:'ATIVAR MICROFONE', acessoNegado:'Acesso negado — recarregue e permita o microfone',
    dark:'ESCURO', light:'CLARO',
  },
  en: {
    subtitle:'SOUND REACTIVE SPHERE',
    desc:'Interactive neural sphere that reacts in real time to ambient sound, translating sonic nuances into organic movements and living connections.',
    estado:'CURRENT STATE', ouvindo:'LISTENING...', semMic:'NO MICROPHONE', aguardando:'WAITING',
    reacao:'SOUND REACTIONS',
    reacoes:['Sphere expansion','Connection growth','Internal vibration','Energy waves','Core pulsations','Orbital particles','Subtle distortion'],
    intensidade:'INTENSITY', sensibilidade:'SENSITIVITY',
    capturaMicro:'MICROPHONE CAPTURE', nivelMin:'MIN LEVEL DETECTED',
    respiracao:'BREATHING', suave:'GENTLE', inalando:'INHALING', exalando:'EXHALING',
    tech:'TECHNOLOGY', perf:'PERFORMANCE', compat:'COMPATIBLE WITH',
    techItems:['WEB AUDIO API','HTML5 + CSS3 + REACT','NO EXTERNAL LIBRARIES'],
    perfItems:['60 FPS','SMOOTH ANIMATION','RESPONSIVE'],
    compatItems:['OBS STUDIO','BROWSER SOURCE','TRANSPARENT BG'],
    cor:'COLOR', selecionarCor:'SELECT COLOR', hex:'HEX',
    ativarMic:'ENABLE MICROPHONE', acessoNegado:'Access denied — reload and allow microphone',
    dark:'DARK', light:'LIGHT',
  },
  es: {
    subtitle:'ESFERA REACTIVA AL SONIDO',
    desc:'Esfera neural interactiva que reacciona en tiempo real al sonido ambiente, traduciendo matices sonoros en movimientos orgánicos y conexiones vivas.',
    estado:'ESTADO ACTUAL', ouvindo:'ESCUCHANDO...', semMic:'SIN MICRÓFONO', aguardando:'ESPERANDO',
    reacao:'REACCIONES AL SONIDO',
    reacoes:['Expansión de esfera','Aumento de conexiones','Vibración interna','Ondas de energía','Pulsaciones del núcleo','Partículas orbitales','Distorsión sutil'],
    intensidade:'INTENSIDAD', sensibilidade:'SENSIBILIDAD',
    capturaMicro:'CAPTURA DE MICRÓFONO', nivelMin:'NIVEL MÍNIMO DETECTADO',
    respiracao:'RESPIRACIÓN', suave:'SUAVE', inalando:'INHALANDO', exalando:'EXHALANDO',
    tech:'TECNOLOGÍA', perf:'RENDIMIENTO', compat:'COMPATIBLE CON',
    techItems:['WEB AUDIO API','HTML5 + CSS3 + REACT','SIN BIBLIOTECAS EXTERNAS'],
    perfItems:['60 FPS','ANIMACIÓN SUAVE','RESPONSIVO'],
    compatItems:['OBS STUDIO','BROWSER SOURCE','FONDO TRANSPARENTE'],
    cor:'COLOR', selecionarCor:'SELECCIONAR COLOR', hex:'HEX',
    ativarMic:'ACTIVAR MICRÓFONO', acessoNegado:'Acceso denegado — recarga y permite el micrófono',
    dark:'OSCURO', light:'CLARO',
  },
} as const;
type Lang = keyof typeof TR;

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function NeuralOrb() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const liveBinsRef = useRef<number[]>(new Array(WAVE_DOTS).fill(0));
  const waveDots    = useRef<WaveDot[]>(
    Array.from({ length: WAVE_DOTS }, (_, i) => ({
      x: i / (WAVE_DOTS - 1), y: 0.5, alpha: 0, targetAlpha: 0, size: 1.2 + Math.random() * 1.2,
    }))
  );
  const sensDots = useRef<WaveDot[]>(
    Array.from({ length: WAVE_DOTS }, (_, i) => ({
      x: i / (WAVE_DOTS - 1), y: 0.5, alpha: 0, targetAlpha: 0, size: 1.0 + Math.random() * 1.0,
    }))
  );

  // Zoom
  const zoomRef          = useRef(1.0);
  const pinchStartDist   = useRef<number | null>(null);
  const pinchStartZoom   = useRef(1.0);

  const S = useRef({
    particles:    [] as Particle[],
    rotY:         0,
    rotX:         0,
    mouseX:       -9999,
    mouseY:       -9999,
    smoothAudio:  0,
    bands:        [0, 0, 0, 0] as number[],
    time:         0,
    breathPhase:  0,
    accentColor:  "#f97316",
    rgb:          { r: 249, g: 115, b: 22 },
    analyser:     null as AnalyserNode | null,
    dataArray:    null as Uint8Array<ArrayBuffer> | null,
    raf:          0,
    cx:           0,
    cy:           0,
    ripples:      [] as { r: number; alpha: number; maxR: number }[],
    waves:        [] as SphereWave[],
    lastWaveTime: -999,
    noiseFloor:   0,
  });

  const [micActive,   setMicActive]   = useState(false);
  const [micDenied,   setMicDenied]   = useState(false);
  const [intensity,   setIntensity]   = useState(0);
  const [accentColor, setAccentColor] = useState("#f97316");
  const [showPicker,  setShowPicker]  = useState(false);
  const [breathKey,   setBreathKey]   = useState<'suave'|'inalando'|'exalando'>('suave');
  const [darkMode,    setDarkMode]    = useState(false);
  const [lang,        setLang]        = useState<Lang>('pt');
  const [isMobile,    setIsMobile]    = useState(() => window.innerWidth < 680);
  const darkRef = useRef(false);
  const [uiTick, setUiTick] = useState(0);

  // ── init particles ─────────────────────────────────────────────────────────
  const initParticles = useCallback((cx: number, cy: number) => {
    const s = S.current;
    s.cx = cx; s.cy = cy;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const pts: Particle[] = [];
    for (let i = 0; i < N; i++) {
      const y    = 1 - (i / (N - 1)) * 2;
      const rAt  = Math.sqrt(Math.max(0, 1 - y * y));
      const th   = golden * i + (Math.random() - 0.5) * 0.05;
      const rVar = RADIUS * (0.82 + Math.random() * 0.22);
      const bx   = Math.cos(th) * rAt * rVar;
      const by   = y * rVar;
      const bz   = Math.sin(th) * rAt * rVar;
      const lf   = rVar / RADIUS;
      const band = lf < 0.88 ? 3 : lf < 0.94 ? 2 : lf < 0.98 ? 1 : 0;
      pts.push({ bx, by, bz, wx: bx, wy: by, wz: bz, vx:0, vy:0, vz:0,
        sx: cx+bx, sy: cy+by, baseSize: 0.7 + Math.random() * 1.9,
        energy:0, dissolve:0, noiseT: Math.random()*1000, band });
    }
    s.particles = pts;
  }, []);

  // ── mic ───────────────────────────────────────────────────────────────────
  const startMic = useCallback(async () => {
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl:  false,
      } });
      const ctx      = new AudioContext();
      const src      = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      src.connect(analyser);
      S.current.analyser  = analyser;
      S.current.dataArray = new Uint8Array(analyser.frequencyBinCount);
      setMicActive(true);
    } catch { setMicDenied(true); }
  }, []);

  const updateColor = useCallback((hex: string) => {
    setAccentColor(hex);
    S.current.accentColor = hex;
    S.current.rgb = hexToRgb(hex);
  }, []);

  // ── main loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;

    const getFitZoom = (W: number, H: number) => {
      const minDim = Math.min(W, H);
      if (minDim < 500) return MIN_ZOOM; // start fully zoomed-out on mobile
      return 1.0;
    };

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles(canvas.width / 2, canvas.height / 2);
      setIsMobile(window.innerWidth < 680);
      const fit = getFitZoom(canvas.width, canvas.height);
      // Always apply fit on resize (user can still pinch-zoom after)
      zoomRef.current = fit;
    };
    resize();
    window.addEventListener("resize", resize);

    // Mouse / touch interaction
    const onMouse = (e: MouseEvent) => { S.current.mouseX = e.clientX; S.current.mouseY = e.clientY; };
    const onLeave = ()              => { S.current.mouseX = -9999;     S.current.mouseY = -9999; };
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        S.current.mouseX = e.touches[0].clientX;
        S.current.mouseY = e.touches[0].clientY;
      }
    };
    const onTouchEnd2 = () => {
      pinchStartDist.current = null;
      S.current.mouseX = -9999;
      S.current.mouseY = -9999;
    };

    // Zoom — wheel
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * -0.0012;
      zoomRef.current = clamp(zoomRef.current + delta, MIN_ZOOM, MAX_ZOOM);
    };

    // Zoom — pinch
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchStartDist.current = Math.sqrt(dx*dx + dy*dy);
        pinchStartZoom.current = zoomRef.current;
      }
    };
    const onPinchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDist.current !== null) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const scale = dist / pinchStartDist.current;
        zoomRef.current = clamp(pinchStartZoom.current * scale, MIN_ZOOM, MAX_ZOOM);
      }
    };

    window.addEventListener("mousemove", onMouse);
    window.addEventListener("mouseleave", onLeave);
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("touchmove", onPinchMove, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd2);
    window.addEventListener("wheel", onWheel, { passive: false });

    const ctx2d   = canvas.getContext("2d")!;
    let lastNow   = performance.now();
    let uiCounter = 0;

    const tick = (now: number) => {
      try {
      const dt = clamp((now - lastNow) / 16.667, 0.1, 3);
      lastNow  = now;
      const s  = S.current;
      if (!s.waves)        s.waves        = [];
      if (s.lastWaveTime === undefined) s.lastWaveTime = -999;

      // ── sanitize accumulated state that could have gone NaN ─────────────
      if (!isFinite(s.smoothAudio))  s.smoothAudio  = 0;
      if (!isFinite(s.breathPhase))  s.breathPhase  = 0;
      if (!isFinite(s.time))         s.time         = 0;
      if (!isFinite(s.rotX))         s.rotX         = 0;
      if (!isFinite(s.rotY))         s.rotY         = 0;
      for (let b = 0; b < 4; b++) {
        if (!isFinite(s.bands?.[b])) s.bands[b] = 0;
      }

      const isDark = darkRef.current;
      const W  = canvas.width, H = canvas.height;
      const { cx, cy } = s;
      const t  = s.time;
      const zoom = zoomRef.current;

      // ── audio read ──────────────────────────────────────────────────────
      let totalLvl = 0;
      const rawBands = [0, 0, 0, 0];
      if (s.analyser && s.dataArray) {
        s.analyser.getByteFrequencyData(s.dataArray);
        const len  = s.dataArray.length;
        const cuts = [0, 0.06, 0.15, 0.35, 1.0];
        for (let b = 0; b < 4; b++) {
          const lo = Math.floor(cuts[b] * len);
          const hi = Math.floor(cuts[b + 1] * len);
          let sum  = 0;
          for (let i = lo; i < hi; i++) sum += s.dataArray[i];
          rawBands[b] = Math.pow((sum / ((hi - lo) * 255)) * 2.2, 0.65);
        }
        // Voice frequency window: ~300 Hz – 3.5 kHz (bins 4%–45%)
        // Ignores sub-bass rumble and high-frequency hiss
        const voiceLo = Math.floor(len * 0.04);
        const voiceHi = Math.floor(len * 0.45);
        let sum = 0;
        for (let i = voiceLo; i < voiceHi; i++) sum += s.dataArray[i];
        const binRange = (voiceHi - voiceLo) * 255;
        const rawLvlRaw = binRange > 0
          ? Math.pow(clamp((sum / binRange) * 1.4, 0, 10), 0.75)
          : 0;
        const rawLvl = isFinite(rawLvlRaw) ? clamp(rawLvlRaw, 0, 1) : 0;

        // ── Adaptive noise gate ──────────────────────────────────────────
        // The floor slowly rises to match ambient silence, then subtracts
        // itself out so only sounds *above* the mic's own noise register.
        if (!isFinite(s.noiseFloor) || s.noiseFloor < 0) s.noiseFloor = 0;
        const overFloor = rawLvl > s.noiseFloor + 0.22;  // must be clearly above noise
        if (overFloor) {
          // Sound detected — floor decays very slowly (don't count speech as noise)
          s.noiseFloor = lerp(s.noiseFloor, s.noiseFloor * 0.995, 0.05 * dt);
        } else {
          // Quiet — learn ambient level quickly so it gets subtracted out
          s.noiseFloor = lerp(s.noiseFloor, rawLvl, 0.055 * dt);
        }
        if (!isFinite(s.noiseFloor)) s.noiseFloor = 0;
        // Subtract floor with aggressive 2.2× headroom margin
        const floor    = clamp(s.noiseFloor * 2.20, 0, 0.95);
        const cleaned  = clamp(rawLvl - floor, 0, 1);
        const ceiling  = clamp(1 - floor, 0.05, 1);
        const lvlRaw   = cleaned / ceiling;
        totalLvl       = isFinite(lvlRaw) ? clamp(lvlRaw, 0, 1) : 0;

        for (let d = 0; d < WAVE_DOTS; d++) {
          const binIdx = Math.floor((d / WAVE_DOTS) * len);
          liveBinsRef.current[d] = s.dataArray[binIdx] / 255;
        }
      }

      const targetAudio = clamp(totalLvl, 0, 1);
      // Moderate attack — requires sustained sound, not just a quick tap
      const audioAttack  = targetAudio > s.smoothAudio ? 0.38 : 0.06;
      s.smoothAudio = clamp(lerp(s.smoothAudio, targetAudio, audioAttack * dt), 0, 1);
      for (let b = 0; b < 4; b++) {
        const raw = clamp(rawBands[b], 0, 1);
        const bandAttack = raw > s.bands[b] ? 0.55 : 0.08;
        s.bands[b] = clamp(lerp(s.bands[b], raw, bandAttack * dt), 0, 1);
      }
      const sl = isFinite(s.smoothAudio) ? s.smoothAudio : 0;

      // ── threshold gate — only react to medium-high sound ────────────────
      const aboveThreshold = sl > THRESHOLD;
      // Below threshold: nearly dead. Above: full, smooth reactivity.
      const effectiveAudioRaw = aboveThreshold
        ? sl
        : sl * (sl / THRESHOLD) * 0.08;
      const effectiveAudio = isFinite(effectiveAudioRaw) ? clamp(effectiveAudioRaw, 0, 1) : 0;
      const audioForce = aboveThreshold ? AUDIO_F_HIGH : AUDIO_F_LOW;

      // ── sphere waves ─────────────────────────────────────────────────────
      // Quiet: one very slow, faint heartbeat every ~8 seconds
      // Active: more frequent energetic waves
      const ambientInterval = aboveThreshold
        ? 55 / (1 + sl * 3.0)   // fast when loud
        : 280;                   // very slow when quiet
      if (t - s.lastWaveTime > ambientInterval) {
        s.lastWaveTime = t;
        s.waves.push({
          radius:    0,
          speed:     aboveThreshold ? (3.2 + sl * 1.8) : 1.6,
          energy:    aboveThreshold ? clamp(0.22 + sl * 0.38, 0.22, 0.90) : 0.05,
          thickness: RADIUS * (aboveThreshold ? 0.17 : 0.22),
        });
      }
      // Extra reactive bursts on loud sound peaks — fire eagerly to stay in sync
      if (aboveThreshold && sl > 0.44 && Math.random() < (sl - 0.30) * 0.22 * dt) {
        s.waves.push({
          radius:    0,
          speed:     5.0 + sl * 2.5,
          energy:    clamp(sl * 0.85, 0.4, 1.0),
          thickness: RADIUS * 0.10,
        });
      }

      // breath — very subtle idle, more alive with sound
      s.breathPhase += (0.0032 + effectiveAudio * 0.012) * dt;
      const breath = Math.sin(s.breathPhase) * 0.5 + 0.5;

      s.rotY += AUTO_ROT_Y * dt;
      s.rotX += AUTO_ROT_X * Math.sin(t * 0.0013) * dt;

      // ── waveform dots ────────────────────────────────────────────────────
      const bins  = liveBinsRef.current;
      const wDots = waveDots.current;
      const sDots = sensDots.current;
      for (let d = 0; d < WAVE_DOTS; d++) {
        const binVal = bins[d];
        const wd = wDots[d];
        wd.targetAlpha = clamp(binVal * 2.2, 0, 1);
        wd.alpha = lerp(wd.alpha, wd.targetAlpha, (wd.targetAlpha > wd.alpha ? 0.25 : 0.06) * dt);
        wd.y = lerp(wd.y, 0.5 - binVal * 0.38 + Math.sin(t * 0.003 + d * 0.8) * 0.08, 0.08 * dt);
        const sd = sDots[d];
        const sensIdx = Math.floor((d / WAVE_DOTS) * (bins.length * 0.5));
        const sensVal = bins[Math.min(sensIdx, bins.length - 1)];
        sd.targetAlpha = clamp(sensVal * 1.8, 0.05, 0.85);
        sd.alpha = lerp(sd.alpha, sd.targetAlpha, (sd.targetAlpha > sd.alpha ? 0.2 : 0.04) * dt);
        sd.y = lerp(sd.y, 0.5 - sensVal * 0.3 + Math.sin(t * 0.002 + d * 1.1) * 0.06, 0.06 * dt);
      }

      // ── UI tick (~12fps) ─────────────────────────────────────────────────
      uiCounter += dt;
      if (uiCounter > 1.4) {
        uiCounter = 0;
        setIntensity(Math.min(100, Math.round(sl * 150)));
        setBreathKey(breath < 0.3 ? 'exalando' : breath > 0.7 ? 'inalando' : 'suave');
        setUiTick(v => v + 1);
      }

      // ── update particles ─────────────────────────────────────────────────
      const ps = s.particles;
      // Noise is nearly silent below threshold — only adds very gentle organic drift
      const noiseScale = aboveThreshold ? NOISE_AMT : NOISE_AMT * 0.10;

      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];

        const nt = t * NOISE_SPD + p.noiseT;
        const nx = snoise(p.bx * 0.003, p.by * 0.003, nt)        * noiseScale;
        const ny = snoise(p.by * 0.003, p.bz * 0.003, nt + 7.3)  * noiseScale;
        const nz = snoise(p.bz * 0.003, p.bx * 0.003, nt + 14.6) * noiseScale;

        // Sanitize any NaN that crept into position/velocity from previous frames
        if (!isFinite(p.wx)) { p.wx = p.bx; p.vx = 0; }
        if (!isFinite(p.wy)) { p.wy = p.by; p.vy = 0; }
        if (!isFinite(p.wz)) { p.wz = p.bz; p.vz = 0; }
        if (!isFinite(p.vx)) p.vx = 0;
        if (!isFinite(p.vy)) p.vy = 0;
        if (!isFinite(p.vz)) p.vz = 0;

        const bandVal = s.bands[p.band];
        const rLen    = Math.sqrt(p.bx*p.bx + p.by*p.by + p.bz*p.bz) || 1;
        const af      = (aboveThreshold ? bandVal : bandVal * 0.10) * audioForce * dt;
        p.vx += (p.bx / rLen) * af;
        p.vy += (p.by / rLen) * af;
        p.vz += (p.bz / rLen) * af;

        // Spring — softer, more fluid
        const breathScale = 1 + breath * 0.022 + effectiveAudio * 0.022;
        p.vx += (p.bx * breathScale + nx - p.wx) * SPRING_K * dt;
        p.vy += (p.by * breathScale + ny - p.wy) * SPRING_K * dt;
        p.vz += (p.bz * breathScale + nz - p.wz) * SPRING_K * dt;

        const damp = Math.pow(DAMPING, dt);
        p.vx *= damp; p.vy *= damp; p.vz *= damp;
        p.wx += p.vx * dt;
        p.wy += p.vy * dt;
        p.wz += p.vz * dt;

        // Irregular random impulses — always active, chaotic above threshold
        const impulseChance = aboveThreshold ? 0.004 + sl * 0.018 : 0.0012;
        if (Math.random() < impulseChance * dt) {
          const theta = Math.random() * Math.PI * 2;
          const phi   = Math.acos(2 * Math.random() - 1);
          const str   = aboveThreshold
            ? (1.0 + Math.random() * 3.0) * (0.5 + sl)
            : 0.4 + Math.random() * 0.8;
          p.vx += Math.sin(phi) * Math.cos(theta) * str;
          p.vy += Math.sin(phi) * Math.sin(theta) * str;
          p.vz += Math.cos(phi) * str;
        }
        // Occasional burst spike — creates sudden irregular group pops
        if (aboveThreshold && sl > 0.25 && Math.random() < 0.0006 * dt * sl) {
          const theta = Math.random() * Math.PI * 2;
          const phi   = Math.acos(2 * Math.random() - 1);
          const str   = 4.0 + Math.random() * 5.0;
          p.vx += Math.sin(phi) * Math.cos(theta) * str;
          p.vy += Math.sin(phi) * Math.sin(theta) * str;
          p.vz += Math.cos(phi) * str;
        }

        // Clamp displacement — very tight below threshold
        const maxD = aboveThreshold ? MAX_DISP : MAX_DISP * 0.22;
        const dispX = p.wx - p.bx, dispY = p.wy - p.by, dispZ = p.wz - p.bz;
        const dispLen = Math.sqrt(dispX*dispX + dispY*dispY + dispZ*dispZ);
        if (dispLen > maxD) {
          const sc = maxD / dispLen;
          p.wx = p.bx + dispX * sc;
          p.wy = p.by + dispY * sc;
          p.wz = p.bz + dispZ * sc;
          p.vx *= 0.35; p.vy *= 0.35; p.vz *= 0.35;
        }

        // Mouse repulsion
        const ry1   = rotY(p.wx, p.wy, p.wz, s.rotY);
        const rx1   = rotX(ry1.x, ry1.y, ry1.z, s.rotX);
        const fov   = 860;
        const sc1   = (fov / Math.max(fov + rx1.z, 100)) * zoom;
        const sxTmp = cx + rx1.x * sc1;
        const syTmp = cy + rx1.y * sc1;
        const mdx   = s.mouseX - sxTmp, mdy = s.mouseY - syTmp;
        const md    = Math.sqrt(mdx*mdx + mdy*mdy);
        if (md < MOUSE_R && md > 0.5 && rx1.z > -RADIUS * 0.5) {
          const fStr = MOUSE_F * Math.pow(1 - md / MOUSE_R, 1.4) * dt;
          p.vx -= (mdx / md) * fStr;
          p.vy -= (mdy / md) * fStr;
          p.vz += fStr * 0.3 * Math.sign(rx1.z);
        }

        // Final rotation, project with zoom
        const ry2  = rotY(p.wx, p.wy, p.wz, s.rotY);
        const rx2  = rotX(ry2.x, ry2.y, ry2.z, s.rotX);
        const sc2  = (fov / Math.max(fov + rx2.z, 100)) * zoom;
        p.sx = cx + rx2.x * sc2;
        p.sy = cy + rx2.y * sc2;
        (p as Particle & { _wz: number })._wz = rx2.z;

        const speed = Math.sqrt(p.vx*p.vx + p.vy*p.vy + p.vz*p.vz);

        // Wave-particle interaction
        const pDist = Math.sqrt(p.bx*p.bx + p.by*p.by + p.bz*p.bz);
        let waveBoost = 0;
        for (let wi = 0; wi < s.waves.length; wi++) {
          const w = s.waves[wi];
          const diff = Math.abs(pDist - w.radius);
          if (diff < w.thickness) {
            const wf = (1 - diff / w.thickness) * w.energy;
            waveBoost = Math.max(waveBoost, wf);
            const rL = pDist || 1;
            p.vx += (p.bx / rL) * wf * 3.2 * dt;
            p.vy += (p.by / rL) * wf * 3.2 * dt;
            p.vz += (p.bz / rL) * wf * 3.2 * dt;
          }
        }

        p.energy = lerp(p.energy,
          clamp(speed * 0.11 + (aboveThreshold ? bandVal * 0.55 : 0) + waveBoost * 1.0, 0, 1),
          0.11 * dt);

        const targetDissolve = (aboveThreshold || waveBoost > 0.25)
          ? clamp(p.energy * 0.88, 0, 0.82)
          : 0;
        const dissolveLerp = p.energy > p.dissolve ? 0.15 : 0.022;
        p.dissolve = lerp(p.dissolve, targetDissolve, dissolveLerp * dt);
      }

      // ── sort by z ──────────────────────────────────────────────────────
      ps.sort((a, b) => ((a as never as { _wz:number })._wz) - ((b as never as { _wz:number })._wz));

      // ── render ─────────────────────────────────────────────────────────
      ctx2d.clearRect(0, 0, W, H);
      ctx2d.fillStyle = isDark ? '#080c12' : '#ffffff';
      ctx2d.fillRect(0, 0, W, H);

      const { r: cr, g: cg, b: cb } = s.rgb;

      // ── advance waves ───────────────────────────────────────────────────
      for (let i = s.waves.length - 1; i >= 0; i--) {
        const w = s.waves[i];
        w.radius += w.speed * dt;
        if (w.radius > RADIUS * 1.08) s.waves.splice(i, 1);
      }
      s.ripples.length = 0;

      // ── energy nucleus — grows up to 50% with loud sound ────────────────
      const nPhase   = t * 0.010;
      const nPulse   = Math.sin(nPhase) * 0.5 + 0.5;
      const nBreath  = Math.sin(nPhase * 0.56 + 1.2) * 0.5 + 0.5;
      // audioNudge allows nucleus to grow ~50% at peak volume
      const audioNudge = isFinite(sl) ? (aboveThreshold ? sl * 6.5 : sl * 0.22) : 0;
      const nBaseRRaw = (12.7 + nPulse * 4.29 + nBreath * 2.14 + audioNudge) * zoom;
      const nBaseR    = isFinite(nBaseRRaw) && nBaseRRaw > 0 ? nBaseRRaw : 12.7;
      const nAlpha   = (0.60 + nPulse * 0.22) * (isDark ? 1.28 : 1.0);

      // Irregular drifting blobs — organic light-source
      const blobDefs: [number, number, number][] = [
        [0, 0, 1.00],
        [Math.sin(t * 0.007)       * nBaseR * 0.42, Math.cos(t * 0.009 + 1.0) * nBaseR * 0.35, 0.76],
        [Math.cos(t * 0.011 + 2.0) * nBaseR * 0.31, Math.sin(t * 0.006 + 3.5) * nBaseR * 0.28, 0.65],
        [Math.sin(t * 0.013 + 4.2) * nBaseR * 0.22, Math.cos(t * 0.008 + 0.8) * nBaseR * 0.20, 0.52],
      ];

      const brightMul = isDark ? 1.9 : 0.85;
      for (const [ox, oy, sc] of blobDefs) {
        const bR = nBaseR * sc;
        const coroSteps: [number, number][] = [
          [bR * 6.2, 0.008], [bR * 3.8, 0.019], [bR * 2.4, 0.042], [bR * 1.55, 0.088],
        ];
        for (const [gr, ga] of coroSteps) {
          ctx2d.beginPath();
          ctx2d.arc(cx + ox, cy + oy, gr, 0, Math.PI * 2);
          ctx2d.fillStyle = `rgba(80,200,255,${(ga * nAlpha * brightMul).toFixed(3)})`;
          ctx2d.fill();
        }
      }
      for (const [ox, oy, sc] of blobDefs) {
        const bR = Math.max(0.5, nBaseR * sc);
        const nGrd = ctx2d.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, bR);
        nGrd.addColorStop(0,    `rgba(240,252,255,${(nAlpha * sc).toFixed(3)})`);
        nGrd.addColorStop(0.30, `rgba(140,225,255,${(nAlpha * sc * 0.88).toFixed(3)})`);
        nGrd.addColorStop(0.65, `rgba(50,175,255,${(nAlpha * sc * 0.60).toFixed(3)})`);
        nGrd.addColorStop(1,    `rgba(10,110,220,0)`);
        ctx2d.beginPath();
        ctx2d.arc(cx + ox, cy + oy, bR, 0, Math.PI * 2);
        ctx2d.fillStyle = nGrd;
        ctx2d.fill();
      }

      // ── lightning arcs around nucleus ───────────────────────────────────
      const boltCount = aboveThreshold ? Math.round(2 + sl * 10) : (Math.random() < 0.18 ? 1 : 0);
      const boltAlpha = aboveThreshold ? clamp(0.25 + sl * 0.75, 0.25, 1.0) : 0.12;
      const boltLen   = nBaseR * (2.2 + sl * 2.8);
      ctx2d.save();
      ctx2d.globalCompositeOperation = "screen";
      for (let bi = 0; bi < boltCount; bi++) {
        const angle    = Math.random() * Math.PI * 2;
        const len      = boltLen * (0.5 + Math.random() * 0.9);
        const alpha    = boltAlpha * (0.4 + Math.random() * 0.6);
        const startR   = nBaseR * (0.7 + Math.random() * 0.3);
        const startX   = cx + Math.cos(angle) * startR;
        const startY   = cy + Math.sin(angle) * startR;
        const segs     = 3 + Math.floor(Math.random() * 5);
        const jitter   = len * (0.28 + Math.random() * 0.2);

        // Main bolt
        ctx2d.beginPath();
        ctx2d.moveTo(startX, startY);
        let bx = startX, by = startY;
        for (let seg = 1; seg <= segs; seg++) {
          const prog = seg / segs;
          const fade = 1 - prog * 0.5;
          bx = startX + Math.cos(angle) * len * prog + (Math.random() - 0.5) * jitter * fade;
          by = startY + Math.sin(angle) * len * prog + (Math.random() - 0.5) * jitter * fade;
          ctx2d.lineTo(bx, by);
        }
        ctx2d.strokeStyle = `rgba(160,230,255,${alpha.toFixed(3)})`;
        ctx2d.lineWidth   = 0.5 + Math.random() * 1.0;
        ctx2d.stroke();

        // Bright core on the bolt
        ctx2d.beginPath();
        ctx2d.moveTo(startX, startY);
        let bx2 = startX, by2 = startY;
        for (let seg = 1; seg <= segs; seg++) {
          const prog = seg / segs;
          const fade = 1 - prog * 0.6;
          bx2 = startX + Math.cos(angle) * len * 0.6 * prog + (Math.random() - 0.5) * jitter * 0.3 * fade;
          by2 = startY + Math.sin(angle) * len * 0.6 * prog + (Math.random() - 0.5) * jitter * 0.3 * fade;
          ctx2d.lineTo(bx2, by2);
        }
        ctx2d.strokeStyle = `rgba(230,248,255,${(alpha * 0.7).toFixed(3)})`;
        ctx2d.lineWidth   = 0.3;
        ctx2d.stroke();
      }
      ctx2d.restore();

      // connections
      for (let i = 0; i < ps.length; i++) {
        const p  = ps[i];
        const pz = (p as never as { _wz:number })._wz;
        let conn = 0;
        for (let j = i+1; j < ps.length && conn < MAX_CONN; j++) {
          const q   = ps[j];
          const qz  = (q as never as { _wz:number })._wz;
          const ddx = p.wx-q.wx, ddy = p.wy-q.wy, ddz = p.wz-q.wz;
          const d3  = Math.sqrt(ddx*ddx + ddy*ddy + ddz*ddz);
          const maxD = CONNECT_DIST * (1 + effectiveAudio * 0.15);
          if (d3 > maxD) continue;
          const depthA = clamp(((pz+qz)/2 / RADIUS + 1) * 0.5, 0, 1);
          const prox   = 1 - d3 / maxD;
          const avgE   = (p.energy + q.energy) * 0.5;
          const avgD   = (p.dissolve + q.dissolve) * 0.5;
          const solidA = prox * prox * (0.07 + depthA * 0.18) * (1 - avgD * 0.6);
          const colorA = avgE * prox * 0.6 * (1 - avgD * 0.4);
          const lw     = Math.max(0.15, 0.2 + prox * 0.5 + avgE * 1.1);
          if (colorA > 0.015) {
            ctx2d.beginPath();
            ctx2d.strokeStyle = `rgba(${cr},${cg},${cb},${Math.min(colorA, 0.75).toFixed(3)})`;
            ctx2d.lineWidth = lw;
            ctx2d.moveTo(p.sx, p.sy); ctx2d.lineTo(q.sx, q.sy);
            ctx2d.stroke();
          }
          if (solidA > 0.004) {
            ctx2d.beginPath();
            ctx2d.strokeStyle = isDark
              ? `rgba(200,215,230,${Math.min(solidA, 0.18).toFixed(3)})`
              : `rgba(0,0,0,${Math.min(solidA, 0.28).toFixed(3)})`;
            ctx2d.lineWidth = lw * 0.65;
            ctx2d.moveTo(p.sx, p.sy); ctx2d.lineTo(q.sx, q.sy);
            ctx2d.stroke();
          }
          conn++;
        }
      }

      // particles
      for (let i = 0; i < ps.length; i++) {
        const p   = ps[i];
        const pz  = (p as never as { _wz:number })._wz;
        const dF  = clamp((pz / RADIUS + 1) * 0.5, 0, 1);
        const sz  = Math.max(0.15, p.baseSize * (0.4 + dF * 0.85) * (1 + p.energy * 1.4) * zoom);
        const solidA = (0.3 + dF * 0.65) * (1 - p.dissolve * 0.85);

        if (!isFinite(p.sx) || !isFinite(p.sy)) continue;
        if (p.energy > 0.08 && solidA > 0.01) {
          const glowR = Math.max(0.1, sz * (2.5 + p.energy * 4));
          const grd   = ctx2d.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, glowR);
          grd.addColorStop(0, `rgba(${cr},${cg},${cb},${(p.energy * 0.45 * (1 - p.dissolve * 0.5)).toFixed(3)})`);
          grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
          ctx2d.beginPath();
          ctx2d.arc(p.sx, p.sy, glowR, 0, Math.PI * 2);
          ctx2d.fillStyle = grd;
          ctx2d.fill();
        }
        if (p.dissolve > 0.05) {
          const ghostR = Math.max(0.1, sz * (1 + p.dissolve * 3.5) * 1.8);
          ctx2d.beginPath();
          ctx2d.arc(p.sx, p.sy, ghostR, 0, Math.PI * 2);
          ctx2d.strokeStyle = `rgba(${cr},${cg},${cb},${(p.dissolve * (0.14 + dF * 0.08)).toFixed(3)})`;
          ctx2d.lineWidth   = 0.5;
          ctx2d.stroke();
        }
        const pBase = isDark ? 215 : 0;
        const er = Math.round(lerp(pBase, cr, p.energy));
        const eg = Math.round(lerp(pBase, cg, p.energy));
        const eb = Math.round(lerp(pBase, cb, p.energy));
        if (solidA > 0.01) {
          ctx2d.beginPath();
          ctx2d.arc(p.sx, p.sy, Math.max(0.15, sz), 0, Math.PI * 2);
          ctx2d.fillStyle = `rgba(${er},${eg},${eb},${Math.min(solidA, 0.92).toFixed(3)})`;
          ctx2d.fill();
        }
      }

      // nucleus glow
      const safeBreath = isFinite(breath) ? breath : 0.5;
      const nucR = clamp(19.0 * (0.6 + safeBreath * 0.4 + effectiveAudio) * zoom, 0.1, 2000);
      const nucG = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, nucR * 5);
      nucG.addColorStop(0,   `rgba(${cr},${cg},${cb},${(0.04 + effectiveAudio * 0.10).toFixed(3)})`);
      nucG.addColorStop(0.5, `rgba(${cr},${cg},${cb},${(0.01 + effectiveAudio * 0.03).toFixed(3)})`);
      nucG.addColorStop(1,   "rgba(0,0,0,0)");
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, nucR * 5, 0, Math.PI * 2);
      ctx2d.fillStyle = nucG;
      ctx2d.fill();

      s.time += dt;
      s.raf = requestAnimationFrame(tick);
      } catch (e) {
        // If any rendering step throws (e.g. non-finite gradient), recover silently
        // and sanitize state so the next frame starts clean.
        if (S.current) {
          S.current.smoothAudio = 0;
          S.current.breathPhase = 0;
          if (S.current.bands) S.current.bands.fill(0);
          S.current.raf = requestAnimationFrame(tick);
        }
        console.warn("Neural Orb tick error (recovered):", e);
      }
    };

    S.current.raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(S.current.raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchmove", onPinchMove);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd2);
      window.removeEventListener("wheel", onWheel);
    };
  }, [initParticles]);

  const { r: cr, g: cg, b: cb } = S.current.rgb;
  const accent = accentColor;
  const tr  = TR[lang];
  const dm  = darkMode;
  const svgC  = dm ? '#ffffff' : '#000000';
  const fg42  = dm ? 'rgba(255,255,255,0.90)' : 'rgba(0,0,0,0.90)';
  const fg40  = dm ? 'rgba(255,255,255,0.84)' : 'rgba(0,0,0,0.84)';
  const fg38  = dm ? 'rgba(255,255,255,0.76)' : 'rgba(0,0,0,0.76)';
  const fg35  = dm ? 'rgba(255,255,255,0.68)' : 'rgba(0,0,0,0.68)';
  const fg32  = dm ? 'rgba(255,255,255,0.60)' : 'rgba(0,0,0,0.60)';
  const fg27  = dm ? 'rgba(255,255,255,0.52)' : 'rgba(0,0,0,0.52)';
  const fg08  = dm ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const fg05  = dm ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const pBg   = dm ? 'rgba(12,18,28,0.97)'   : 'rgba(255,255,255,0.97)';

  const renderWaveDots = (dots: WaveDot[], w: number, h: number, color: string) =>
    dots.map((d, i) => {
      const x = d.x * w;
      const y = clamp(d.y * h, 1, h - 1);
      return <circle key={i} cx={x} cy={y} r={d.size} fill={color} opacity={d.alpha.toFixed(3)}/>;
    });

  const renderWaveLines = (dots: WaveDot[], w: number, h: number, color: string) => {
    const lines = [];
    for (let i = 0; i < dots.length - 1; i++) {
      const a = dots[i], b = dots[i+1];
      const avgA = (a.alpha + b.alpha) * 0.5 * 0.4;
      if (avgA < 0.04) continue;
      lines.push(<line key={i} x1={a.x*w} y1={clamp(a.y*h,1,h-1)} x2={b.x*w} y2={clamp(b.y*h,1,h-1)} stroke={color} strokeWidth="0.5" opacity={avgA.toFixed(3)}/>);
    }
    return lines;
  };

  void uiTick;

  return (
    <div onContextMenu={e => e.preventDefault()} style={{ position:"relative", width:"100vw", height:"100vh", background: dm ? '#080c12' : '#fff', overflow:"hidden", transition:"background 0.4s" }}>
      <canvas ref={canvasRef} style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}/>

      {/* ── LOGO ──────────────────────────────────────────────────────────── */}
      <div style={{ position:"absolute", top: isMobile ? 16 : 28, left: isMobile ? 16 : 30, zIndex:10, display:"flex", alignItems:"center", gap:10, pointerEvents:"none" }}>
        <img
          src={dm ? '/logo-light.png' : '/logo-dark.png'}
          alt="Gnoseez logo"
          style={{ width: isMobile ? 28 : 34, height: isMobile ? 28 : 34, objectFit:"contain", display:"block" }}
        />
        <div>
          <div style={{ fontSize: isMobile ? 10 : 12, fontWeight:700, letterSpacing:"0.20em", color: svgC }}>GNOSEEZ ORB</div>
          {!isMobile && <div style={{ fontSize:7, letterSpacing:"0.22em", color: fg40, marginTop:2 }}>{tr.subtitle}</div>}
        </div>
      </div>

      {/* ── DESCRIPTION — desktop only ────────────────────────────────────── */}
      {!isMobile && (
        <div style={{ position:"absolute", top:104, left:30, zIndex:10, maxWidth:142, pointerEvents:"none" }}>
          <p style={{ fontSize:8, lineHeight:1.8, color: fg35, letterSpacing:"0.02em" }}>{tr.desc}</p>
        </div>
      )}

      {/* ── CURRENT STATE (top right) ─────────────────────────────────────── */}
      <div style={{ position:"absolute", top: isMobile ? 16 : 28, right: isMobile ? 16 : 30, zIndex:10, textAlign:"right", minWidth: isMobile ? 100 : 150, pointerEvents:"none" }}>
        <div style={{ fontSize:7, fontWeight:600, letterSpacing:"0.20em", color: fg42, borderBottom:`1px solid ${fg08}`, paddingBottom:4, marginBottom:6 }}>{tr.estado}</div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:7, marginBottom: isMobile ? 0 : 8 }}>
          <span style={{ fontSize:8.5, letterSpacing:"0.16em", color: fg40 }}>
            {micActive ? tr.ouvindo : micDenied ? tr.semMic : tr.aguardando}
          </span>
          <span style={{ width:5, height:5, borderRadius:"50%", display:"inline-block",
            background: micActive ? accent : fg40,
            boxShadow:  micActive ? `0 0 0 3px rgba(${cr},${cg},${cb},0.18)` : "none",
            animation:  micActive ? "pulse-dot 2s infinite" : "none" }}/>
        </div>
        {!isMobile && (
          <svg viewBox="0 0 110 24" style={{ width:120, height:26, display:"block", marginLeft:"auto", overflow:"visible" }}>
            {renderWaveLines(waveDots.current, 110, 24, accent)}
            {renderWaveDots(waveDots.current, 110, 24, accent)}
          </svg>
        )}
      </div>

      {/* ── REACTIONS (left mid) — desktop only ──────────────────────────── */}
      {!isMobile && (
        <div style={{ position:"absolute", top:"50%", left:30, transform:"translateY(-50%)", zIndex:10, minWidth:155, pointerEvents:"none" }}>
          <div style={{ fontSize:7, fontWeight:600, letterSpacing:"0.22em", color: fg42, borderBottom:`1px solid ${fg08}`, paddingBottom:5, marginBottom:9 }}>{tr.reacao}</div>
          {tr.reacoes.map(item => (
            <div key={item} style={{ display:"flex", alignItems:"center", gap:8, fontSize:8, letterSpacing:"0.1em", color: fg40, padding:"2.5px 0", textTransform:"uppercase" }}>
              <span style={{ width:3, height:3, borderRadius:"50%", background: fg42, flexShrink:0 }}/>
              {item}
            </div>
          ))}
        </div>
      )}

      {/* ── INTENSITY (right mid) ─────────────────────────────────────────── */}
      <div style={{ position:"absolute", top:"18%", right: isMobile ? 14 : 30, zIndex:10, textAlign:"right", minWidth: isMobile ? 70 : 100, pointerEvents:"none" }}>
        <div style={{ fontSize:7, fontWeight:600, letterSpacing:"0.20em", color: fg42, borderBottom:`1px solid ${fg08}`, paddingBottom:4, marginBottom:8 }}>{tr.intensidade}</div>
        <div style={{ fontSize: isMobile ? 20 : 26, fontWeight:200, letterSpacing:"0.06em", color:`rgba(${cr},${cg},${cb},${Math.max(0.25, 0.28+intensity*0.007)})`, marginBottom:10, transition:"color 0.5s" }}>
          {intensity}%
        </div>
        <svg viewBox="0 0 60 60" style={{ width: isMobile ? 46 : 58, height: isMobile ? 46 : 58, display:"block", marginLeft:"auto" }}>
          <circle cx="30" cy="30" r="24" fill="none" stroke={fg08} strokeWidth="2.5"/>
          <circle cx="30" cy="30" r="24" fill="none" stroke={accent} strokeWidth="2.5"
            strokeDasharray={`${(intensity/100)*150.8} 150.8`}
            strokeLinecap="round" transform="rotate(-90 30 30)"
            style={{ transition:"stroke-dasharray 0.5s ease, stroke 0.4s" }}/>
        </svg>
      </div>

      {/* ── SENSITIVITY (bottom left) — desktop only ─────────────────────── */}
      {!isMobile && (
        <div style={{ position:"absolute", bottom:86, left:30, zIndex:10, pointerEvents:"none" }}>
          <div style={{ fontSize:7, fontWeight:600, letterSpacing:"0.22em", color: fg42, borderBottom:`1px solid ${fg08}`, paddingBottom:4, marginBottom:7 }}>{tr.sensibilidade}</div>
          <svg viewBox="0 0 160 20" style={{ width:155, height:20, display:"block", overflow:"visible" }}>
            {renderWaveLines(sensDots.current, 160, 20, dm ? 'rgba(200,215,230,0.55)' : 'rgba(0,0,0,0.55)')}
            {renderWaveDots(sensDots.current, 160, 20, dm ? 'rgba(200,215,230,0.70)' : 'rgba(0,0,0,0.70)')}
          </svg>
          <div style={{ fontSize:7, letterSpacing:"0.15em", color: fg32, marginTop:5 }}>{tr.capturaMicro}</div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3, fontSize:8, color: fg38, letterSpacing:"0.10em" }}>
            <span style={{ width:3, height:3, borderRadius:"50%", background: fg38 }}/>
            {tr.nivelMin}
          </div>
        </div>
      )}

      {/* ── BREATHING (bottom right) — desktop only ───────────────────────── */}
      {!isMobile && (
        <div style={{ position:"absolute", bottom:86, right:30, zIndex:10, textAlign:"right", pointerEvents:"none" }}>
          <div style={{ fontSize:7, fontWeight:600, letterSpacing:"0.22em", color: fg42, borderBottom:`1px solid ${fg08}`, paddingBottom:4, marginBottom:7 }}>{tr.respiracao}</div>
          <div style={{ fontSize:9, letterSpacing:"0.20em", color: fg38, marginBottom:7 }}>{tr[breathKey]}</div>
          <svg viewBox="0 0 120 22" style={{ width:108, height:18, display:"block", marginLeft:"auto" }}>
            <path d={`M0,11 ${Array.from({length:14},(_,i)=>{
              const progress = i/13;
              const y = 11 + Math.sin(progress * Math.PI * 2 * (breathKey==='inalando'?1.5:breathKey==='exalando'?0.8:1.2) + S.current.time * 0.03) * (3 + intensity * 0.05);
              return `L${progress*120},${clamp(y,2,20)}`;
            }).join(" ")}`}
              fill="none" stroke={`rgba(${cr},${cg},${cb},0.4)`} strokeWidth="0.8"/>
          </svg>
        </div>
      )}

      {/* ── TECH BAR (bottom) — desktop only ─────────────────────────────── */}
      {!isMobile && (
        <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:10, display:"flex", alignItems:"flex-end", justifyContent:"center", gap:56, padding:"12px 40px 16px", borderTop:`1px solid ${fg05}`, pointerEvents:"none" }}>
          {[
            { label: tr.tech,   items: tr.techItems   },
            { label: tr.perf,   items: tr.perfItems   },
            { label: tr.compat, items: tr.compatItems },
          ].map(col => (
            <div key={col.label}>
              <div style={{ fontSize:6.5, fontWeight:600, letterSpacing:"0.2em", color: fg38, marginBottom:5 }}>{col.label}</div>
              {col.items.map(it => <div key={it} style={{ fontSize:7, letterSpacing:"0.10em", color: fg27, lineHeight:1.8 }}>{it}</div>)}
            </div>
          ))}
        </div>
      )}

      {/* Click-outside overlay to close color picker */}
      {showPicker && (
        <div onClick={() => setShowPicker(false)} style={{ position:"fixed", inset:0, zIndex:18 }}/>
      )}

      {/* ── CONTROLS: color · lang · dark ────────────────────────────────── */}
      <div style={{
        position:"absolute",
        top: isMobile ? 52 : 24,
        left:"50%",
        transform:"translateX(-50%)",
        zIndex:20,
        display:"flex",
        flexDirection:"column",
        alignItems:"center",
        gap:6,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap: isMobile ? 6 : 8, background: dm ? 'rgba(8,12,18,0.55)' : 'rgba(255,255,255,0.55)', borderRadius:24, padding: isMobile ? "4px 10px" : "4px 12px", backdropFilter:"blur(10px)", border:`1px solid ${fg08}` }}>
          {/* Color dot */}
          <button onClick={() => setShowPicker(v => !v)} style={{
            background:"transparent", border:"none", cursor:"pointer",
            display:"flex", alignItems:"center", gap:6, padding: isMobile ? "4px 6px" : "4px 8px",
            borderRadius:16, transition:"background 0.2s",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ width:10, height:10, borderRadius:"50%", background:accent, display:"block", boxShadow:`0 0 0 2.5px rgba(${cr},${cg},${cb},0.22)`, flexShrink:0 }}/>
            {!isMobile && <span style={{ fontSize:7, letterSpacing:"0.18em", color: fg42, fontFamily:"inherit" }}>{tr.cor}</span>}
          </button>

          <span style={{ width:1, height:12, background: fg08, display:"block" }}/>

          {/* Language flags */}
          {(['pt','en','es'] as Lang[]).map(l => (
            <button key={l} onClick={() => setLang(l)} style={{
              background:"none", border:"none", cursor:"pointer",
              fontSize: isMobile ? 9 : 9, letterSpacing:"0.14em", fontWeight: lang===l ? 700 : 400,
              color: lang===l ? svgC : fg38,
              transition:"color 0.2s, font-weight 0.2s",
              padding:"2px 3px", lineHeight:1, fontFamily:"inherit",
            }}>{l==='pt'?'PT':l==='en'?'EN':'ES'}</button>
          ))}

          <span style={{ width:1, height:12, background: fg08, display:"block" }}/>

          {/* Dark mode toggle */}
          <button onClick={() => { const nd = !darkMode; darkRef.current = nd; setDarkMode(nd); }} style={{
            background:"none", border:`1px solid ${fg08}`, borderRadius:16, cursor:"pointer",
            padding: isMobile ? "3px 8px" : "3px 9px", fontSize:7, letterSpacing:"0.12em", color: fg40,
            fontFamily:"inherit", transition:"all 0.25s",
          }}>
            {dm ? `○ ${tr.light}` : `● ${tr.dark}`}
          </button>
        </div>

        {/* Color picker dropdown */}
        {showPicker && (
          <div style={{ background: pBg, border:`1px solid ${fg08}`, borderRadius:12, padding:"14px 16px", backdropFilter:"blur(12px)", display:"flex", flexDirection:"column", gap:10, minWidth:155, boxShadow:"0 8px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ fontSize:7.5, letterSpacing:"0.18em", color: fg38, fontWeight:600, textAlign:"center" }}>{tr.selecionarCor}</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center" }}>
              {["#f97316","#00f5ff","#00ff88","#3b82f6","#a855f7","#ec4899","#10b981","#ef4444","#facc15","#06b6d4","#cbd5e1"].map(c => (
                <button key={c} onClick={() => updateColor(c)} style={{
                  width:22, height:22, borderRadius:"50%",
                  border:`2px solid ${c===accentColor ? (dm?"#fff":"#000") : "transparent"}`,
                  background:c, cursor:"pointer", transition:"transform 0.15s, border 0.15s",
                  transform:c===accentColor?"scale(1.2)":"scale(1)",
                }}/>
              ))}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:7.5, color: fg38, letterSpacing:"0.12em" }}>{tr.hex}</span>
              <input type="color" value={accentColor} onChange={e => updateColor(e.target.value)}
                style={{ width:30, height:22, border:"none", background:"none", cursor:"pointer", padding:0 }}/>
              <span style={{ fontSize:8, color: fg38, fontFamily:"monospace" }}>{accentColor}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── MIC BUTTON ───────────────────────────────────────────────────── */}
      {!micActive && !micDenied && (
        <button onClick={startMic} style={{
          position:"absolute",
          bottom: isMobile ? 32 : 86,
          left:"50%",
          transform:"translateX(-50%)",
          zIndex:20,
          background:"transparent",
          border:`1px solid ${accent}`,
          color:accent,
          fontSize: isMobile ? 9 : 8.5,
          fontFamily:"inherit",
          letterSpacing:"0.22em",
          padding: isMobile ? "11px 28px" : "10px 26px",
          cursor:"pointer",
          transition:"all 0.3s ease",
          textTransform:"uppercase",
          whiteSpace:"nowrap",
        }}
          onMouseEnter={e=>{ e.currentTarget.style.background=`rgba(${cr},${cg},${cb},0.06)`; }}
          onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; }}
        >{tr.ativarMic}</button>
      )}
      {micDenied && (
        <div style={{ position:"absolute", bottom: isMobile ? 32 : 86, left:"50%", transform:"translateX(-50%)", zIndex:20, fontSize:8.5, letterSpacing:"0.12em", color: fg38, textTransform:"uppercase", whiteSpace:"nowrap" }}>
          {tr.acessoNegado}
        </div>
      )}

      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.25} }
        *{box-sizing:border-box;}
        body{margin:0;font-family:'Inter','Helvetica Neue',Helvetica,Arial,sans-serif;}
        canvas{touch-action:none;}
      `}</style>
    </div>
  );
}
