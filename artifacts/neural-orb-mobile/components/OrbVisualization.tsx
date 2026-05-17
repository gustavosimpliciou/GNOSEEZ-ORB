import React, { useEffect, useRef } from "react";
import { PanResponder, View } from "react-native";
import Svg, { Defs, RadialGradient, Stop } from "react-native-svg";
import { Circle as SvgCircle, Line as SvgLine } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useFrameCallback,
} from "react-native-reanimated";

const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);
const AnimatedLine = Animated.createAnimatedComponent(SvgLine);

const N = 52;
const RADIUS = 120;
const SPRING_K = 0.05;
const DAMPING = 0.88;
const AUTO_ROT_Y = 0.0008;
const CONNECT_DIST = 72;
const MAX_CONN = 3;
const FOV = 560;
const MAX_CONNECTIONS = 75;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m || m.length < 3) return { r: 249, g: 115, b: 22 };
  return {
    r: parseInt(m[0], 16),
    g: parseInt(m[1], 16),
    b: parseInt(m[2], 16),
  };
}

interface ParticleData {
  bx: number; by: number; bz: number;
  wx: number; wy: number; wz: number;
  vx: number; vy: number; vz: number;
  sx: number; sy: number; sz: number;
  energy: number; nt: number; band: number;
}

interface ConnData {
  x1: number; y1: number; x2: number; y2: number;
  opacity: number; active: boolean;
}

interface GlobalState {
  rotAngleY: number; rotAngleX: number; breathPhase: number;
  touchX: number; touchY: number; smoothAudio: number;
  cx: number; cy: number;
  accentR: number; accentG: number; accentB: number;
  fgVal: number; glowR: number;
}

function initParticles(): ParticleData[] {
  const pts: ParticleData[] = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = phi * i;
    const bx = Math.cos(theta) * r * RADIUS;
    const by = y * RADIUS;
    const bz = Math.sin(theta) * r * RADIUS;
    pts.push({
      bx, by, bz,
      wx: bx, wy: by, wz: bz,
      vx: 0, vy: 0, vz: 0,
      sx: 0, sy: 0, sz: 0,
      energy: 0,
      nt: Math.random() * 100,
      band: Math.floor(Math.random() * 4),
    });
  }
  return pts;
}

function initSortedIndices(): number[] {
  const arr: number[] = [];
  for (let i = 0; i < N; i++) arr.push(i);
  return arr;
}

interface Props {
  audioLevel: number;
  accentColor: string;
  darkMode: boolean;
  width: number;
  height: number;
}

type ParticlesSV = ReturnType<typeof useSharedValue<ParticleData[]>>;
type ConnsSV = ReturnType<typeof useSharedValue<ConnData[]>>;
type GlobalSV = ReturnType<typeof useSharedValue<GlobalState>>;
type SortedSV = ReturnType<typeof useSharedValue<number[]>>;

function ParticleCircle({
  renderSlot,
  particlesSV,
  sortedIndicesSV,
  globalSV,
}: {
  renderSlot: number;
  particlesSV: ParticlesSV;
  sortedIndicesSV: SortedSV;
  globalSV: GlobalSV;
}) {
  const animProps = useAnimatedProps(() => {
    "worklet";
    const sortedIdx = sortedIndicesSV.value[renderSlot];
    const particles = particlesSV.value;
    const p = particles[sortedIdx];
    const g = globalSV.value;
    if (!p) return { cx: 0, cy: 0, r: 0, fill: "transparent" };
    const depthFactor = (p.sz + RADIUS) / (2 * RADIUS);
    const size = Math.max(0.6, (1.3 + depthFactor * 1.8) * (1 + p.energy * 1.0));
    const baseOpacity = 0.22 + depthFactor * 0.72;
    const opacity = Math.min(1, baseOpacity + p.energy * 0.28);
    const isHighEnergy = p.energy > 0.22;
    const a = isHighEnergy ? Math.min(1, opacity * 1.35) : opacity;
    const fill = isHighEnergy
      ? "rgba(" + g.accentR + "," + g.accentG + "," + g.accentB + "," + a.toFixed(3) + ")"
      : "rgba(" + g.fgVal + "," + g.fgVal + "," + g.fgVal + "," + a.toFixed(3) + ")";
    return { cx: p.sx, cy: p.sy, r: size, fill };
  });
  return <AnimatedCircle animatedProps={animProps} />;
}

function ConnLine({
  index,
  connsSV,
  globalSV,
}: {
  index: number;
  connsSV: ConnsSV;
  globalSV: GlobalSV;
}) {
  const animProps = useAnimatedProps(() => {
    "worklet";
    const c = connsSV.value[index];
    const g = globalSV.value;
    if (!c || !c.active) {
      return { x1: 0, y1: 0, x2: 0, y2: 0, stroke: "transparent", strokeWidth: 0, strokeOpacity: 0 };
    }
    const stroke =
      "rgba(" + g.fgVal + "," + g.fgVal + "," + g.fgVal + "," + c.opacity.toFixed(3) + ")";
    return { x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, stroke, strokeWidth: 0.7, strokeOpacity: 1 };
  });
  return <AnimatedLine animatedProps={animProps} />;
}

function GlowOuter({ globalSV, cx, cy }: { globalSV: GlobalSV; cx: number; cy: number }) {
  const animProps = useAnimatedProps(() => {
    "worklet";
    const g = globalSV.value;
    // Gradient stops baked at sa=1 max (0.87 centre, 0.32 at 40%).
    // fillOpacity scales from 0.483 (sa=0) to 1.0 (sa=1) so effective
    // centre opacity ranges 0.42→0.87, matching main's 0.42 + sa*0.45.
    // fillOpacity 0.483→1.0 scales with sa; effective centre = 0.42→0.87
    const fillOpacity = 0.483 + g.smoothAudio * 0.517;
    return { r: g.glowR * 3.2, cx, cy, fillOpacity };
  });
  return <AnimatedCircle animatedProps={animProps} fill="url(#coreGlow)" />;
}

function GlowInner({ globalSV, cx, cy }: { globalSV: GlobalSV; cx: number; cy: number }) {
  const animProps = useAnimatedProps(() => {
    "worklet";
    const g = globalSV.value;
    const a = (0.28 + g.smoothAudio * 0.38).toFixed(3);
    const fill = "rgba(" + g.accentR + "," + g.accentG + "," + g.accentB + "," + a + ")";
    return { r: g.glowR * 0.52, cx, cy, fill };
  });
  return <AnimatedCircle animatedProps={animProps} />;
}

export default function OrbVisualization({
  audioLevel,
  accentColor,
  darkMode,
  width,
  height,
}: Props) {
  const rgb = hexToRgb(accentColor);
  const cx = width / 2;
  const cy = height / 2;

  const globalSV = useSharedValue<GlobalState>({
    rotAngleY: 0,
    rotAngleX: 0,
    breathPhase: 0,
    touchX: -9999,
    touchY: -9999,
    smoothAudio: 0,
    cx,
    cy,
    accentR: rgb.r,
    accentG: rgb.g,
    accentB: rgb.b,
    fgVal: darkMode ? 255 : 0,
    glowR: RADIUS * 0.32,
  });

  const particlesSV = useSharedValue<ParticleData[]>(initParticles());
  const sortedIndicesSV = useSharedValue<number[]>(initSortedIndices());

  const connsSV = useSharedValue<ConnData[]>(
    Array.from({ length: MAX_CONNECTIONS }, () => ({
      x1: 0, y1: 0, x2: 0, y2: 0, opacity: 0, active: false,
    }))
  );

  const audioSV = useSharedValue(audioLevel);

  useEffect(() => {
    audioSV.value = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    const newRgb = hexToRgb(accentColor);
    const g = globalSV.value;
    globalSV.value = {
      ...g,
      accentR: newRgb.r,
      accentG: newRgb.g,
      accentB: newRgb.b,
      fgVal: darkMode ? 255 : 0,
      cx: width / 2,
      cy: height / 2,
    };
  }, [accentColor, darkMode, width, height]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const g = globalSV.value;
        globalSV.value = {
          ...g,
          touchX: e.nativeEvent.locationX,
          touchY: e.nativeEvent.locationY,
        };
      },
      onPanResponderMove: (e) => {
        const g = globalSV.value;
        globalSV.value = {
          ...g,
          touchX: e.nativeEvent.locationX,
          touchY: e.nativeEvent.locationY,
        };
      },
      onPanResponderRelease: () => {
        const g = globalSV.value;
        globalSV.value = { ...g, touchX: -9999, touchY: -9999 };
      },
    })
  ).current;

  useFrameCallback(() => {
    "worklet";
    const MOUSE_R = 110;
    const MOUSE_F = 2.8;

    const g = globalSV.value;
    const al = audioSV.value;

    const newRotAngleY = g.rotAngleY + AUTO_ROT_Y;
    const newBreathPhase = g.breathPhase + 0.003;

    const targetAudio = al < 0 ? 0 : al > 1 ? 1 : al;
    // Fast attack (0.5) for tight sync with voice, moderate decay (0.12)
    // so the orb settles clearly within ~200ms of silence
    const attack = targetAudio > g.smoothAudio ? 0.5 : 0.12;
    let newSmoothAudio = g.smoothAudio + (targetAudio - g.smoothAudio) * attack;
    newSmoothAudio = newSmoothAudio < 0 ? 0 : newSmoothAudio > 1 ? 1 : newSmoothAudio;

    const sa = newSmoothAudio;
    const breath = Math.sin(newBreathPhase) * 0.5 + 0.5;
    const gcx = g.cx;
    const gcy = g.cy;
    const touchX = g.touchX;
    const touchY = g.touchY;
    const rotAngleY = newRotAngleY;
    const rotAngleX = g.rotAngleX;
    // Tuned breath/audio scale from main branch
    const breathScale = 1 + breath * 0.025 + sa * 0.02;

    const cosY = Math.cos(rotAngleY);
    const sinY = Math.sin(rotAngleY);
    const cosX = Math.cos(rotAngleX);
    const sinX = Math.sin(rotAngleX);

    const particles = particlesSV.value;
    const newParticles: ParticleData[] = [];

    for (let i = 0; i < N; i++) {
      const p = particles[i];

      let wx = isFinite(p.wx) ? p.wx : p.bx;
      let wy = isFinite(p.wy) ? p.wy : p.by;
      let wz = isFinite(p.wz) ? p.wz : p.bz;
      let vx = p.vx;
      let vy = p.vy;
      let vz = p.vz;

      // Organic micro-jitter: probability and strength scale with audio
      // so silence is calm, voice makes things feel alive everywhere
      const jitterProb = 0.004 + sa * 0.018;
      if (Math.random() < jitterProb) {
        const angle = Math.random() * Math.PI * 2;
        const tilt = (Math.random() - 0.5) * Math.PI;
        const str = 0.04 + sa * 0.1 + Math.random() * 0.06;
        vx += Math.cos(angle) * Math.cos(tilt) * str;
        vy += Math.sin(tilt) * str;
        vz += Math.sin(angle) * Math.cos(tilt) * str;
      }

      // Continuous proportional radial force — no binary on/off gate.
      // Quadratic ramp so soft speech gives gentle push, loud speech
      // gives strong expansion, and silence gives nothing.
      if (sa > 0.05) {
        const rLen = Math.sqrt(p.bx * p.bx + p.by * p.by + p.bz * p.bz) || 1;
        const t = (sa - 0.05) / 0.95;
        const af = t * t * 2.8;
        vx += (p.bx / rLen) * af;
        vy += (p.by / rLen) * af;
        vz += (p.bz / rLen) * af;
      }

      vx += (p.bx * breathScale - wx) * SPRING_K;
      vy += (p.by * breathScale - wy) * SPRING_K;
      vz += (p.bz * breathScale - wz) * SPRING_K;

      vx *= DAMPING;
      vy *= DAMPING;
      vz *= DAMPING;
      wx += vx;
      wy += vy;
      wz += vz;

      // Displacement cap grows continuously with audio level
      const maxDisp = RADIUS * (0.04 + sa * 0.12);
      const ddx = wx - p.bx;
      const ddy = wy - p.by;
      const ddz = wz - p.bz;
      const dl = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
      if (dl > maxDisp) {
        const sc = maxDisp / dl;
        wx = p.bx + ddx * sc;
        wy = p.by + ddy * sc;
        wz = p.bz + ddz * sc;
      }

      const ry1x = wx * cosY + wz * sinY;
      const ry1y = wy;
      const ry1z = -wx * sinY + wz * cosY;
      const rx1y = ry1y * cosX - ry1z * sinX;
      const rx1z = ry1y * sinX + ry1z * cosX;
      const sc1 = FOV / Math.max(FOV + rx1z, 80);
      const sxT = gcx + ry1x * sc1;
      const syT = gcy + rx1y * sc1;

      const mdx = touchX - sxT;
      const mdy = touchY - syT;
      const md = Math.sqrt(mdx * mdx + mdy * mdy);
      if (md < MOUSE_R && md > 0.5) {
        const fStr = MOUSE_F * Math.pow(1 - md / MOUSE_R, 1.5);
        vx -= (mdx / md) * fStr * 0.55;
        vy -= (mdy / md) * fStr * 0.55;
      }

      const ry2x = wx * cosY + wz * sinY;
      const ry2y = wy;
      const ry2z = -wx * sinY + wz * cosY;
      const rx2x = ry2x;
      const rx2y = ry2y * cosX - ry2z * sinX;
      const rx2z = ry2y * sinX + ry2z * cosX;
      const sc2 = FOV / Math.max(FOV + rx2z, 80);
      const psx = gcx + rx2x * sc2;
      const psy = gcy + rx2y * sc2;
      const psz = rx2z;

      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      // Energy tracks speed directly + audio boost — faster lerp for tighter sync
      const eTarget = speed * 0.18 + sa * 0.5;
      const eClamp = eTarget < 0 ? 0 : eTarget > 1 ? 1 : eTarget;
      const newEnergy = p.energy + (eClamp - p.energy) * 0.22;

      newParticles.push({
        bx: p.bx, by: p.by, bz: p.bz,
        wx, wy, wz,
        vx, vy, vz,
        sx: psx, sy: psy, sz: psz,
        energy: newEnergy,
        nt: p.nt, band: p.band,
      });
    }

    particlesSV.value = newParticles;

    // Depth-sort: build sorted index list (back-to-front, ascending sz)
    const sortedIdxs: number[] = [];
    for (let k = 0; k < N; k++) sortedIdxs.push(k);
    sortedIdxs.sort((a, b) => newParticles[a].sz - newParticles[b].sz);
    sortedIndicesSV.value = sortedIdxs;

    const perCount: number[] = [];
    for (let k = 0; k < N; k++) perCount.push(0);

    let connCount = 0;
    const newConns: ConnData[] = [];
    for (let k = 0; k < MAX_CONNECTIONS; k++) {
      newConns.push({ x1: 0, y1: 0, x2: 0, y2: 0, opacity: 0, active: false });
    }

    for (let ii = 0; ii < N && connCount < MAX_CONNECTIONS; ii++) {
      const i = sortedIdxs[ii];
      const pi = newParticles[i];
      if (pi.sz < -RADIUS * 0.25) continue;
      for (let jj = ii + 1; jj < N && connCount < MAX_CONNECTIONS; jj++) {
        const j = sortedIdxs[jj];
        const pj = newParticles[j];
        if (pj.sz < -RADIUS * 0.25) continue;
        if (perCount[i] >= MAX_CONN) break;
        if (perCount[j] >= MAX_CONN) continue;
        const dx = pi.sx - pj.sx;
        const dy = pi.sy - pj.sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONNECT_DIST) {
          const depthFactor = Math.max(0, (pi.sz + RADIUS) / (2 * RADIUS));
          // Higher connection opacity from main branch
          const opacity = (1 - dist / CONNECT_DIST) * 0.42 * depthFactor;
          newConns[connCount] = {
            x1: pi.sx, y1: pi.sy, x2: pj.sx, y2: pj.sy,
            opacity, active: true,
          };
          connCount++;
          perCount[i]++;
          perCount[j]++;
        }
      }
    }

    connsSV.value = newConns;

    // Larger, more reactive glow from main branch
    const glowR = RADIUS * 0.32 * (1 + sa * 0.65 + breath * 0.06);

    globalSV.value = {
      rotAngleY: newRotAngleY,
      rotAngleX,
      breathPhase: newBreathPhase,
      touchX: g.touchX,
      touchY: g.touchY,
      smoothAudio: newSmoothAudio,
      cx: gcx,
      cy: gcy,
      accentR: g.accentR,
      accentG: g.accentG,
      accentB: g.accentB,
      fgVal: g.fgVal,
      glowR,
    };
  });

  const renderSlots = Array.from({ length: N }, (_, i) => i);
  const connIndices = Array.from({ length: MAX_CONNECTIONS }, (_, i) => i);

  return (
    <View style={{ width, height }} {...panResponder.panHandlers}>
      <Svg width={width} height={height}>
        <Defs>
          {/* Stop colours baked at sa=1 max (0.87 centre, 0.32 at 40%).
              GlowOuter.fillOpacity = 0.483 + sa*0.517 (ranges 0.483→1.0)
              so effective centre opacity = 0.87 × fillOpacity → 0.42–0.87,
              matching main's 0.42 + sa*0.45 range. */}
          <RadialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={`rgba(${rgb.r},${rgb.g},${rgb.b},0.87)`} stopOpacity="1" />
            <Stop offset="40%" stopColor={`rgba(${rgb.r},${rgb.g},${rgb.b},0.32)`} stopOpacity="1" />
            <Stop offset="100%" stopColor={`rgba(${rgb.r},${rgb.g},${rgb.b},0)`} stopOpacity="1" />
          </RadialGradient>
        </Defs>

        <GlowOuter globalSV={globalSV} cx={cx} cy={cy} />
        <GlowInner globalSV={globalSV} cx={cx} cy={cy} />

        {connIndices.map((i) => (
          <ConnLine key={"c" + i} index={i} connsSV={connsSV} globalSV={globalSV} />
        ))}

        {renderSlots.map((slot) => (
          <ParticleCircle
            key={"p" + slot}
            renderSlot={slot}
            particlesSV={particlesSV}
            sortedIndicesSV={sortedIndicesSV}
            globalSV={globalSV}
          />
        ))}
      </Svg>
    </View>
  );
}
