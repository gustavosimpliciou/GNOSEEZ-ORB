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
const SPRING_K      = 0.034;   // softer spring → particles travel further before returning
const DAMPING       = 0.868;   // less damping → motion lingers, feels organic
const MAX_DISP      = RADIUS * 0.30;  // 4× bigger expansion room
const AUTO_ROT_Y    = 0.00055;
const AUTO_ROT_X    = 0.00015;
const MOUSE_R       = 270;     // larger mouse influence area
const MOUSE_F       = 16.0;    // strong push-away — particles clearly part around cursor
const AUDIO_F_LOW   = 0.7;
const AUDIO_F_HIGH  = 3.8;    // dramatic audio force
const THRESHOLD     = 0.25;
const NOISE_AMT     = 4.5;
const NOISE_SPD     = 0.00065;
const WAVE_DOTS     = 32;
const MIN_SCALE     = 0.4;
const MAX_SCALE     = 2.5;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const lerp  = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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
    zoom:'ZOOM',
  },
  en: {
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
    zoom:'ZOOM',
  },
  es: {
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
    zoom:'ZOOM',
  },
} as const;
type Lang = keyof typeof TR;

export default function NeuralOrb() {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const orbScaleRef   = useRef(1.0);
  const pinchDistRef  = useRef(0);

  const liveBinsRef   = useRef<number[]>(new Array(WAVE_DOTS).fill(0));
  const waveDots      = useRef<WaveDot[]>(
    Array.from({ length: WAVE_DOTS }, (_, i) => ({
      x: i / (WAVE_DOTS - 1), y: 0.5, alpha: 0, targetAlpha: 0,
      size: 1.2 + Math.random() * 1.2,
    }))
  );
  const sensDots      = useRef<WaveDot[]>(
    Array.from({ length: WAVE_DOTS }, (_, i) => ({
      x: i / (WAVE_DOTS - 1), y: 0.5, alpha: 0, targetAlpha: 0,
      size: 1.0 + Math.random() * 1.0,
    }))
  );

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
    dataArray:    null as Uint8Array | null,
    raf:          0,
    cx:           0,
    cy:           0,
    ripples:      [] as { r: number; alpha: number; maxR: number }[],
    waves:        [] as SphereWave[],
    lastWaveTime: -999,
    orbitAngle:   0,
  });

  const [micActive,   setMicActive]   = useState(false);
  const [micDenied,   setMicDenied]   = useState(false);
  const [intensity,   setIntensity]   = useState(0);
  const [accentColor, setAccentColor] = useState("#f97316");
  const [showPicker,  setShowPicker]  = useState(false);
  const [breathKey,   setBreathKey]   = useState<'suave'|'inalando'|'exalando'>('suave');
  const [darkMode,    setDarkMode]    = useState(false);
  const [lang,        setLang]        = useState<Lang>('pt');
  const [orbZoom,     setOrbZoom]     = useState(100);
  const darkRef = useRef(false);
  const [uiTick,      setUiTick]      = useState(0);

  // ── init particles ────────────────────────────────────────────────────────
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
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx      = new AudioContext();
      const src      = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
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
    let firstResize = true;
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      if (firstResize) {
        firstResize = false;
        // Auto-fit orb to screen on first load
        const w = window.innerWidth;
        const scale = w < 480 ? 0.55 : w < 700 ? 0.72 : w < 1024 ? 0.88 : 1.0;
        orbScaleRef.current = scale;
        setOrbZoom(Math.round(scale * 100));
      }
      initParticles(canvas.width / 2, canvas.height / 2);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouse = (e: MouseEvent) => { S.current.mouseX = e.clientX; S.current.mouseY = e.clientY; };
    const onLeave = ()              => { S.current.mouseX = -9999;     S.current.mouseY = -9999; };
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("mouseleave", onLeave);

    // ── Ctrl+scroll zoom only (plain scroll does nothing) ────────────────
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;  // ignore plain scroll
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      orbScaleRef.current = clamp(orbScaleRef.current + delta, MIN_SCALE, MAX_SCALE);
      setOrbZoom(Math.round(orbScaleRef.current * 100));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // ── touch (single finger repulsion + pinch zoom) ──────────────────────
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (pinchDistRef.current > 0) {
          const ratio = dist / pinchDistRef.current;
          orbScaleRef.current = clamp(orbScaleRef.current * ratio, MIN_SCALE, MAX_SCALE);
          setOrbZoom(Math.round(orbScaleRef.current * 100));
        }
        pinchDistRef.current = dist;
        S.current.mouseX = -9999; S.current.mouseY = -9999;
      } else if (e.touches.length === 1) {
        S.current.mouseX = e.touches[0].clientX;
        S.current.mouseY = e.touches[0].clientY;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchDistRef.current = 0;
      if (e.touches.length === 0) { S.current.mouseX = -9999; S.current.mouseY = -9999; }
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove",  onTouchMove,  { passive: false });
    window.addEventListener("touchend",   onTouchEnd,   { passive: true });

    const ctx2d   = canvas.getContext("2d")!;
    let lastNow   = performance.now();
    let uiCounter = 0;

    const tick = (now: number) => {
      const dt = clamp((now - lastNow) / 16.667, 0.1, 3);
      lastNow  = now;
      const s  = S.current;
      if (!s.waves)        s.waves        = [];
      if (s.lastWaveTime === undefined) s.lastWaveTime = -999;
      const isDark = darkRef.current;
      const W  = canvas.width, H = canvas.height;
      const { cx, cy } = s;
      const t  = s.time;

      // ── audio ─────────────────────────────────────────────────────────────
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
          rawBands[b] = Math.pow((sum / ((hi - lo) * 255)) * 3.0, 0.6);
        }
        let sum = 0;
        for (let i = 0; i < len; i++) sum += s.dataArray[i];
        totalLvl = Math.pow((sum / (len * 255)) * 3.0, 0.6);
        for (let d = 0; d < WAVE_DOTS; d++) {
          const binIdx = Math.floor((d / WAVE_DOTS) * len);
          liveBinsRef.current[d] = s.dataArray[binIdx] / 255;
        }
      }

      const targetAudio = clamp(totalLvl, 0, 1);
      s.smoothAudio = lerp(s.smoothAudio, targetAudio, 0.09 * dt);
      for (let b = 0; b < 4; b++) {
        s.bands[b] = lerp(s.bands[b], clamp(rawBands[b], 0, 1), 0.1 * dt);
      }
      const sl = s.smoothAudio;

      // Noise gate at 25%: below that the orb stays perfectly still.
      // Remap 0.25→0 .. 1.0→1.0 so the response feels smooth, not sudden.
      const GATE_THRESH = 0.25;
      const ga = sl > GATE_THRESH ? (sl - GATE_THRESH) / (1 - GATE_THRESH) : 0;
      const aboveThreshold = ga > 0;
      const effectiveAudio = ga;

      // ── sphere waves ──────────────────────────────────────────────────────
      const ambientWaveInterval = 75 / (1 + sl * 2.2);
      if (t - s.lastWaveTime > ambientWaveInterval) {
        s.lastWaveTime = t;
        // Ambient wave energy tied to gated audio — silence = nearly invisible, sound = full
        s.waves.push({ radius:0, speed:2.8+sl*0.7, energy:0.03 + ga*0.45, thickness:RADIUS*0.18 });
      }
      // Audio waves — only fire when gate is open (ga > 0 means sl > 20%)
      if (ga > 0 && Math.random() < ga * 0.11 * dt) {
        s.waves.push({ radius:0, speed:3.2+ga*2.0, energy:clamp(ga*0.82,0.15,1.0), thickness:RADIUS*0.14 });
      }

      s.breathPhase += (0.0038 + effectiveAudio * 0.010) * dt;
      const breath = Math.sin(s.breathPhase) * 0.5 + 0.5;
      s.rotY += AUTO_ROT_Y * dt;
      s.rotX += AUTO_ROT_X * Math.sin(t * 0.0015) * dt;

      // ── subtle orbital drift: rotate the spring targets around Y axis ─────
      // Speed: ~0.00038 rad/frame × 60fps = 0.0228 rad/s → full orbit ≈ 4.6 min
      s.orbitAngle += 0.00038 * dt;
      const cosO = Math.cos(s.orbitAngle);
      const sinO = Math.sin(s.orbitAngle);

      // ── waveform dots ─────────────────────────────────────────────────────
      const bins = liveBinsRef.current;
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

      uiCounter += dt;
      if (uiCounter > 1.4) {
        uiCounter = 0;
        setIntensity(Math.round(sl * 100));
        setBreathKey(breath < 0.3 ? 'exalando' : breath > 0.7 ? 'inalando' : 'suave');
        setUiTick(v => v + 1);
      }

      // ── update particles ──────────────────────────────────────────────────
      const ps = s.particles;
      const fov = 860;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];

        const nt = t * NOISE_SPD + p.noiseT;
        const nx = snoise(p.bx * 0.003, p.by * 0.003, nt)        * NOISE_AMT;
        const ny = snoise(p.by * 0.003, p.bz * 0.003, nt + 7.3)  * NOISE_AMT;
        const nz = snoise(p.bz * 0.003, p.bx * 0.003, nt + 14.6) * NOISE_AMT;

        // Per-particle resonance phase — derived from the existing noiseT seed (no new fields).
        // Each particle has a unique slow oscillation, creating organic irregular response:
        // some lead, some lag, like a living machine where every part is interconnected.
        const pPhase = Math.sin(p.noiseT * 0.00314 + t * 0.00038);
        const pResp  = 0.08 + 0.92 * (pPhase * 0.5 + 0.5);  // 0.08..1.0 — much wider spread for dramatic irregularity

        const bandVal = s.bands[p.band];
        const rLen    = Math.sqrt(p.bx*p.bx + p.by*p.by + p.bz*p.bz) || 1;
        // Force driven by gated audio — zero below 20%, smooth ramp above
        const af = bandVal * ga * AUDIO_F_HIGH * pResp * 0.9 * dt;
        p.vx += (p.bx / rLen) * af; p.vy += (p.by / rLen) * af; p.vz += (p.bz / rLen) * af;

        // Spring target is base position rotated by orbitAngle → gentle orbital drift
        const breathScale = 1 + breath * 0.028 + effectiveAudio * 0.025;
        const tbx = p.bx * cosO + p.bz * sinO;
        const tbz = -p.bx * sinO + p.bz * cosO;
        p.vx += (tbx * breathScale + nx - p.wx) * SPRING_K * dt;
        p.vy += (p.by * breathScale + ny - p.wy) * SPRING_K * dt;
        p.vz += (tbz * breathScale + nz - p.wz) * SPRING_K * dt;

        const damp = Math.pow(DAMPING, dt);
        p.vx *= damp; p.vy *= damp; p.vz *= damp;
        p.wx += p.vx * dt; p.wy += p.vy * dt; p.wz += p.vz * dt;

        // Displacement cap: tight at silence/below gate, expands with gated audio
        const maxD = MAX_DISP * clamp(0.14 + ga * 1.3, 0.14, 1.0);
        const dispX = p.wx - p.bx, dispY = p.wy - p.by, dispZ = p.wz - p.bz;
        const dispLen = Math.sqrt(dispX*dispX + dispY*dispY + dispZ*dispZ);
        if (dispLen > maxD) {
          const sc = maxD / dispLen;
          p.wx = p.bx + dispX * sc; p.wy = p.by + dispY * sc; p.wz = p.bz + dispZ * sc;
          p.vx *= 0.4; p.vy *= 0.4; p.vz *= 0.4;
        }

        // Mouse repulsion (scale-aware)
        const sc0   = orbScaleRef.current;
        const ry1   = rotY(p.wx, p.wy, p.wz, s.rotY);
        const rx1   = rotX(ry1.x, ry1.y, ry1.z, s.rotX);
        const sxTmp = cx + rx1.x * (fov / Math.max(fov + rx1.z, 100)) * sc0;
        const syTmp = cy + rx1.y * (fov / Math.max(fov + rx1.z, 100)) * sc0;
        const mdx   = s.mouseX - sxTmp, mdy = s.mouseY - syTmp;
        const md    = Math.sqrt(mdx*mdx + mdy*mdy);
        if (md < MOUSE_R && md > 0.5 && rx1.z > -RADIUS * 0.5) {
          const fStr = MOUSE_F * Math.pow(1 - md / MOUSE_R, 1.4) * dt;
          p.vx -= (mdx / md) * fStr; p.vy -= (mdy / md) * fStr;
          p.vz += fStr * 0.3 * Math.sign(rx1.z);
        }

        const ry2  = rotY(p.wx, p.wy, p.wz, s.rotY);
        const rx2  = rotX(ry2.x, ry2.y, ry2.z, s.rotX);
        const sc2  = fov / Math.max(fov + rx2.z, 100);
        p.sx = cx + rx2.x * sc2;
        p.sy = cy + rx2.y * sc2;
        (p as Particle & { _wz: number })._wz = rx2.z;

        const speed = Math.sqrt(p.vx*p.vx + p.vy*p.vy + p.vz*p.vz);
        const pDist = Math.sqrt(p.bx*p.bx + p.by*p.by + p.bz*p.bz);
        let waveBoost = 0;
        for (let wi = 0; wi < s.waves.length; wi++) {
          const w = s.waves[wi];
          const diff = Math.abs(pDist - w.radius);
          if (diff < w.thickness) {
            const wf = (1 - diff / w.thickness) * w.energy;
            waveBoost = Math.max(waveBoost, wf);
            const rL = pDist || 1;
            p.vx += (p.bx / rL) * wf * 3.0 * dt;
            p.vy += (p.by / rL) * wf * 3.0 * dt;
            p.vz += (p.bz / rL) * wf * 3.0 * dt;
          }
        }

        // Reduce speed contribution so lingering inertia doesn't keep particles lit
        p.energy = lerp(p.energy,
          clamp(speed * 0.04 + bandVal * ga * 0.7 * pResp + waveBoost * 1.0, 0, 1),
          0.20 * dt);
        // Sharp on/off threshold per particle — only high-energy particles light up,
        // creating the irregular "some on, some off, switching" pattern
        const litFactor = clamp((p.energy - 0.22) / 0.55, 0, 1);
        const targetDissolve = clamp(litFactor * 0.85 * clamp(ga * 5.0, 0, 1), 0, 0.82);
        // 5× faster decay when gate is closed — particles turn off in seconds, not minutes
        const decayMul = ga < 0.05 ? 5.0 : 1.0;
        const dissolveLerp = p.energy > p.dissolve ? 0.18 : 0.10 * decayMul;
        p.dissolve = lerp(p.dissolve, targetDissolve, dissolveLerp * dt);
      }

      ps.sort((a, b) => ((a as never as { _wz:number })._wz) - ((b as never as { _wz:number })._wz));

      // ── render ────────────────────────────────────────────────────────────
      ctx2d.clearRect(0, 0, W, H);
      ctx2d.fillStyle = isDark ? '#080c12' : '#ffffff';
      ctx2d.fillRect(0, 0, W, H);

      const { r: cr, g: cg, b: cb } = s.rgb;

      for (let i = s.waves.length - 1; i >= 0; i--) {
        const w = s.waves[i];
        w.radius += w.speed * dt;
        if (w.radius > RADIUS * 1.08) s.waves.splice(i, 1);
      }
      s.ripples.length = 0;

      // ── apply orb scale transform around center ───────────────────────────
      const orbScale = orbScaleRef.current;
      ctx2d.save();
      ctx2d.translate(cx, cy);
      ctx2d.scale(orbScale, orbScale);
      ctx2d.translate(-cx, -cy);

      // energy nucleus
      const nPhase  = t * 0.011;
      const nPulse  = Math.sin(nPhase) * 0.5 + 0.5;
      const nBreath = Math.sin(nPhase * 0.57 + 1.2) * 0.5 + 0.5;
      const audioNudge = ga * 4.0;  // nucleus pulses only with gated audio
      const nBaseR  = (6.5 + nPulse * 2.2 + nBreath * 1.1 + audioNudge) * 1.69;  // 30% bigger (1.30×1.30)
      const nAlpha  = (0.62 + nPulse * 0.22) * (isDark ? 1.30 : 1.0);

      const blobDefs: [number, number, number][] = [
        [0, 0, 1.00],
        [Math.sin(t * 0.007)       * nBaseR * 0.40, Math.cos(t * 0.009 + 1.0) * nBaseR * 0.33, 0.76],
        [Math.cos(t * 0.011 + 2.0) * nBaseR * 0.30, Math.sin(t * 0.006 + 3.5) * nBaseR * 0.28, 0.65],
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
          const maxD2 = CONNECT_DIST * (1 + effectiveAudio * 0.15);
          if (d3 > maxD2) continue;
          const depthA = clamp(((pz+qz)/2 / RADIUS + 1) * 0.5, 0, 1);
          const prox   = 1 - d3 / maxD2;
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
        // Active particles shrink 5% — subtle tightening as they light up
        const sz  = Math.max(0.15, p.baseSize * (0.4 + dF * 0.85) * (1 + p.energy * 1.4) * (1 - p.dissolve * 0.05));
        const solidA = (0.3 + dF * 0.65) * (1 - p.dissolve * 0.85);
        if (p.energy > 0.08 && solidA > 0.01) {
          const glowR = Math.max(0.1, sz * (2.5 + p.energy * 4));
          const grd   = ctx2d.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, glowR);
          grd.addColorStop(0, `rgba(${cr},${cg},${cb},${(p.energy * 0.45 * (1 - p.dissolve * 0.5)).toFixed(3)})`);
          grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
          ctx2d.beginPath(); ctx2d.arc(p.sx, p.sy, glowR, 0, Math.PI * 2);
          ctx2d.fillStyle = grd; ctx2d.fill();
        }
        if (p.dissolve > 0.05) {
          const ghostR = Math.max(0.1, sz * (1 + p.dissolve * 3.5) * 1.8);
          ctx2d.beginPath(); ctx2d.arc(p.sx, p.sy, ghostR, 0, Math.PI * 2);
          ctx2d.strokeStyle = `rgba(${cr},${cg},${cb},${(p.dissolve * (0.14 + dF * 0.08)).toFixed(3)})`;
          ctx2d.lineWidth = 0.5; ctx2d.stroke();
        }
        const pBase = isDark ? 215 : 0;
        const er = Math.round(lerp(pBase, cr, p.energy));
        const eg = Math.round(lerp(pBase, cg, p.energy));
        const eb = Math.round(lerp(pBase, cb, p.energy));
        if (solidA > 0.01) {
          ctx2d.beginPath(); ctx2d.arc(p.sx, p.sy, Math.max(0.15, sz), 0, Math.PI * 2);
          ctx2d.fillStyle = `rgba(${er},${eg},${eb},${Math.min(solidA, 0.92).toFixed(3)})`;
          ctx2d.fill();
        }
      }

      // nucleus glow
      const nucR = Math.max(0.1, 12 * (0.6 + breath * 0.4 + effectiveAudio));
      const nucG = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, nucR * 5);
      nucG.addColorStop(0,   `rgba(${cr},${cg},${cb},${(0.04 + effectiveAudio * 0.10).toFixed(3)})`);
      nucG.addColorStop(0.5, `rgba(${cr},${cg},${cb},${(0.01 + effectiveAudio * 0.03).toFixed(3)})`);
      nucG.addColorStop(1,   "rgba(0,0,0,0)");
      ctx2d.beginPath(); ctx2d.arc(cx, cy, nucR * 5, 0, Math.PI * 2);
      ctx2d.fillStyle = nucG; ctx2d.fill();

      ctx2d.restore();

      s.time += dt;
      s.raf = requestAnimationFrame(tick);
    };

    S.current.raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(S.current.raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [initParticles]);

  const { r: cr, g: cg, b: cb } = S.current.rgb;
  const accent = accentColor;
  const tr  = TR[lang];
  const dm  = darkMode;
  const svgC  = dm ? 'rgba(255,255,255,0.90)' : '#000000';
  const fg42  = dm ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.42)';
  const fg40  = dm ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.40)';
  const fg38  = dm ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.38)';
  const fg35  = dm ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
  const fg32  = dm ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.32)';
  const fg27  = dm ? 'rgba(255,255,255,0.27)' : 'rgba(0,0,0,0.27)';
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
    <div style={{ position:"fixed", inset:0, width:"100%", height:"100%", background: dm ? '#080c12' : '#fff', color: dm ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)', overflow:"hidden", transition:"background 0.4s, color 0.4s" }}>
      <canvas ref={canvasRef} style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}/>

      {/* ── LOGO ──────────────────────────────────────────────────────────── */}
      <div className="ui-panel" style={{ position:"absolute", top:30, left:32, zIndex:10, display:"flex", alignItems:"center", gap:12, pointerEvents:"none" }}>
        <img
          src="/gnoseez-logo.jpg"
          alt="GNOSEEZ"
          style={{ width:42, height:42, borderRadius:"50%", objectFit:"cover", display:"block", flexShrink:0 }}
        />
        <div style={{ fontSize:13, fontWeight:700, letterSpacing:"0.20em", color: svgC }}>GNOSEEZ ORB</div>
      </div>

      {/* ── DESCRIPTION ─────────────────────────────────────────────────── */}
      <div className="ui-panel ui-desc" style={{ position:"absolute", top:110, left:32, zIndex:10, maxWidth:148, pointerEvents:"none" }}>
        <p style={{ fontSize:8.5, lineHeight:1.75, color: fg35, letterSpacing:"0.02em" }}>{tr.desc}</p>
      </div>

      {/* ── CURRENT STATE (top right) ────────────────────────────────────── */}
      <div className="ui-panel" style={{ position:"absolute", top:30, right:32, zIndex:10, textAlign:"right", minWidth:160, pointerEvents:"none" }}>
        <div style={{ fontSize:7.5, fontWeight:600, letterSpacing:"0.22em", color: fg42, borderBottom:`1px solid ${fg08}`, paddingBottom:5, marginBottom:8 }}>{tr.estado}</div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:8, marginBottom:10 }}>
          <span style={{ fontSize:9, letterSpacing:"0.18em", color: fg40 }}>
            {micActive ? tr.ouvindo : micDenied ? tr.semMic : tr.aguardando}
          </span>
          <span style={{ width:5, height:5, borderRadius:"50%", display:"inline-block",
            background: micActive ? accent : fg40,
            boxShadow:  micActive ? `0 0 0 3px rgba(${cr},${cg},${cb},0.18)` : "none",
            animation:  micActive ? "pulse-dot 2s infinite" : "none" }}/>
        </div>
        <svg viewBox="0 0 110 24" style={{ width:130, height:28, display:"block", marginLeft:"auto", overflow:"visible" }}>
          {renderWaveLines(waveDots.current, 110, 24, accent)}
          {renderWaveDots(waveDots.current, 110, 24, accent)}
        </svg>
      </div>

      {/* ── REACTIONS (left mid) ─────────────────────────────────────────── */}
      <div className="ui-panel ui-reactions" style={{ position:"absolute", top:"50%", left:32, transform:"translateY(-50%)", zIndex:10, minWidth:162, pointerEvents:"none" }}>
        <div style={{ fontSize:7.5, fontWeight:600, letterSpacing:"0.22em", color: fg42, borderBottom:`1px solid ${fg08}`, paddingBottom:5, marginBottom:9 }}>{tr.reacao}</div>
        {tr.reacoes.map(item => (
          <div key={item} style={{ display:"flex", alignItems:"center", gap:8, fontSize:8.5, letterSpacing:"0.1em", color: fg40, padding:"2.5px 0", textTransform:"uppercase" }}>
            <span style={{ width:3.5, height:3.5, borderRadius:"50%", background: fg42, flexShrink:0 }}/>
            {item}
          </div>
        ))}
      </div>

      {/* ── INTENSITY (right mid) ────────────────────────────────────────── */}
      <div className="ui-panel ui-intensity" style={{ position:"absolute", top:"50%", right:32, transform:"translateY(-50%)", zIndex:10, textAlign:"right", minWidth:100, pointerEvents:"none" }}>
        <div style={{ fontSize:7.5, fontWeight:600, letterSpacing:"0.22em", color: fg42, borderBottom:`1px solid ${fg08}`, paddingBottom:5, marginBottom:9 }}>{tr.intensidade}</div>
        <div style={{ fontSize:26, fontWeight:200, letterSpacing:"0.06em", color:`rgba(${cr},${cg},${cb},${Math.max(0.25, 0.28+intensity*0.007)})`, marginBottom:10, transition:"color 0.5s" }}>
          {intensity}%
        </div>
        <svg viewBox="0 0 60 60" style={{ width:60, height:60, display:"block", marginLeft:"auto" }}>
          <circle cx="30" cy="30" r="24" fill="none" stroke={fg08} strokeWidth="2.5"/>
          <circle cx="30" cy="30" r="24" fill="none" stroke={accent} strokeWidth="2.5"
            strokeDasharray={`${(intensity/100)*150.8} 150.8`}
            strokeLinecap="round" transform="rotate(-90 30 30)"
            style={{ transition:"stroke-dasharray 0.5s ease, stroke 0.4s" }}/>
        </svg>
      </div>

      {/* ── SENSITIVITY (bottom left) ───────────────────────────────────── */}
      <div className="ui-panel ui-sensitivity" style={{ position:"absolute", bottom:88, left:32, zIndex:10, pointerEvents:"none" }}>
        <div style={{ fontSize:7.5, fontWeight:600, letterSpacing:"0.22em", color: fg42, borderBottom:`1px solid ${fg08}`, paddingBottom:5, marginBottom:8 }}>{tr.sensibilidade}</div>
        <svg viewBox="0 0 160 20" style={{ width:160, height:20, display:"block", overflow:"visible" }}>
          {renderWaveLines(sensDots.current, 160, 20, dm ? 'rgba(200,215,230,0.55)' : 'rgba(0,0,0,0.55)')}
          {renderWaveDots(sensDots.current, 160, 20, dm ? 'rgba(200,215,230,0.70)' : 'rgba(0,0,0,0.70)')}
        </svg>
        <div style={{ fontSize:7, letterSpacing:"0.15em", color: fg32, marginTop:6 }}>{tr.capturaMicro}</div>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3, fontSize:8.5, color: fg38, letterSpacing:"0.1em" }}>
          <span style={{ width:3.5, height:3.5, borderRadius:"50%", background: fg38 }}/>
          {tr.nivelMin}
        </div>
      </div>

      {/* ── BREATHING (bottom right) ─────────────────────────────────────── */}
      <div className="ui-panel ui-breathing" style={{ position:"absolute", bottom:88, right:32, zIndex:10, textAlign:"right", pointerEvents:"none" }}>
        <div style={{ fontSize:7.5, fontWeight:600, letterSpacing:"0.22em", color: fg42, borderBottom:`1px solid ${fg08}`, paddingBottom:5, marginBottom:8 }}>{tr.respiracao}</div>
        <div style={{ fontSize:9.5, letterSpacing:"0.2em", color: fg38, marginBottom:8 }}>{tr[breathKey]}</div>
        <svg viewBox="0 0 120 22" style={{ width:110, height:18, display:"block", marginLeft:"auto" }}>
          <path d={`M0,11 ${Array.from({length:14},(_,i)=>{
            const progress = i/13;
            const y = 11 + Math.sin(progress * Math.PI * 2 * (breathKey==='inalando'?1.5:breathKey==='exalando'?0.8:1.2) + S.current.time * 0.03) * (3 + intensity * 0.05);
            return `L${progress*120},${clamp(y,2,20)}`;
          }).join(" ")}`}
            fill="none" stroke={`rgba(${cr},${cg},${cb},0.4)`} strokeWidth="0.8"/>
        </svg>
      </div>

      {/* ── ZOOM INDICATOR (bottom center left) ─────────────────────────── */}
      <div style={{ position:"absolute", bottom:50, left:"50%", transform:"translateX(-50%)", zIndex:10, textAlign:"center", pointerEvents:"none" }}>
        <div style={{ fontSize:7, letterSpacing:"0.18em", color: fg32 }}>{tr.zoom} {orbZoom}%</div>
      </div>

      {/* ── TECH BAR (bottom) ────────────────────────────────────────────── */}
      <div className="ui-panel ui-techbar" style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:10, display:"flex", alignItems:"flex-end", justifyContent:"center", gap:60, padding:"14px 40px 18px", borderTop:`1px solid ${fg05}`, pointerEvents:"none" }}>
        {[
          { label: tr.tech,   items: tr.techItems   },
          { label: tr.perf,   items: tr.perfItems   },
          { label: tr.compat, items: tr.compatItems },
        ].map(col => (
          <div key={col.label}>
            <div style={{ fontSize:7, fontWeight:600, letterSpacing:"0.2em", color: fg38, marginBottom:5 }}>{col.label}</div>
            {col.items.map(it => <div key={it} style={{ fontSize:7.5, letterSpacing:"0.1em", color: fg27, lineHeight:1.8 }}>{it}</div>)}
          </div>
        ))}
      </div>

      {/* ── CONTROLS: color · lang · dark ────────────────────────────────── */}
      <div style={{ position:"absolute", top:26, left:"50%", transform:"translateX(-50%)", zIndex:20, display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button onClick={() => setShowPicker(v => !v)} style={{
            background:"transparent", border:"none", cursor:"pointer",
            display:"flex", alignItems:"center", gap:7, padding:"5px 10px",
            borderRadius:20, transition:"background 0.2s",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ width:11, height:11, borderRadius:"50%", background:accent, display:"block", boxShadow:`0 0 0 2.5px rgba(${cr},${cg},${cb},0.22)` }}/>
            <span style={{ fontSize:7.5, letterSpacing:"0.18em", color: fg42, fontFamily:"inherit" }}>{tr.cor}</span>
          </button>

          <span style={{ width:1, height:14, background: fg08, display:"block" }}/>

          {(['pt','en','es'] as Lang[]).map(l => (
            <button key={l} onClick={() => setLang(l)} style={{
              background:"none", border:"none", cursor:"pointer", fontSize:15,
              opacity: lang===l ? 1 : 0.28, transition:"opacity 0.2s",
              padding:"2px 2px", lineHeight:1,
            }}>{l==='pt'?'🇧🇷':l==='en'?'🇺🇸':'🇪🇸'}</button>
          ))}

          <span style={{ width:1, height:14, background: fg08, display:"block" }}/>

          <button onClick={() => { const nd = !darkMode; darkRef.current = nd; setDarkMode(nd); }} style={{
            background:"none", border:`1px solid ${fg08}`, borderRadius:20, cursor:"pointer",
            padding:"3px 10px", fontSize:7.5, letterSpacing:"0.14em", color: fg40,
            fontFamily:"inherit", transition:"all 0.25s",
          }}>
            {dm ? `○ ${tr.light}` : `● ${tr.dark}`}
          </button>
        </div>

        {showPicker && (
          <div style={{ background: pBg, border:`1px solid ${fg08}`, borderRadius:12, padding:"14px 18px", backdropFilter:"blur(12px)", display:"flex", flexDirection:"column", gap:10, minWidth:160, boxShadow:"0 8px 32px rgba(0,0,0,0.18)" }}>
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
          position:"absolute", bottom:90, left:"50%", transform:"translateX(-50%)",
          zIndex:20, background:"transparent", border:`1px solid ${accent}`,
          color:accent, fontSize:8.5, fontFamily:"inherit",
          letterSpacing:"0.22em", padding:"10px 26px", cursor:"pointer",
          transition:"all 0.3s ease", textTransform:"uppercase", whiteSpace:"nowrap",
        }}
          onMouseEnter={e=>{ e.currentTarget.style.background=`rgba(${cr},${cg},${cb},0.06)`; }}
          onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; }}
        >{tr.ativarMic}</button>
      )}
      {micDenied && (
        <div style={{ position:"absolute", bottom:90, left:"50%", transform:"translateX(-50%)", zIndex:20, fontSize:8.5, letterSpacing:"0.12em", color: fg38, textTransform:"uppercase", whiteSpace:"nowrap" }}>
          {tr.acessoNegado}
        </div>
      )}

      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.25} }
        *{box-sizing:border-box;}
        body,html{margin:0;padding:0;overflow:hidden;font-family:'Inter','Helvetica Neue',Helvetica,Arial,sans-serif;}
        .ui-panel { flex-shrink: 0; }

        /* ── tablet (≤ 900px) ── */
        @media (max-width: 900px) {
          .ui-desc      { display: none !important; }
          .ui-reactions { display: none !important; }
        }

        /* ── mobile (≤ 600px) ── */
        @media (max-width: 600px) {
          .ui-sensitivity { display: none !important; }
          .ui-breathing   { display: none !important; }
          .ui-techbar     { gap: 18px !important; padding: 8px 14px 12px !important; }
          .ui-intensity {
            top: auto !important;
            bottom: 130px !important;
            right: 18px !important;
            transform: none !important;
            min-width: 80px !important;
          }
          .ui-top-right {
            top: 20px !important;
            right: 18px !important;
            min-width: 120px !important;
          }
          .ui-top-left-panel {
            top: 20px !important;
            left: 18px !important;
          }
        }

        /* ── small mobile (≤ 390px) ── */
        @media (max-width: 390px) {
          .ui-techbar { display: none !important; }
          .ui-intensity { display: none !important; }
        }

        /* prevent text size adjustment on mobile */
        * { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
        /* pinch-zoom and touch handled in JS; disable native browser zoom */
        canvas { touch-action: none; }
      `}</style>
    </div>
  );
}
