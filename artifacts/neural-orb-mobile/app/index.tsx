import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

import OrbVisualization from "@/components/OrbVisualization";
import ReactionsPanel from "@/components/ReactionsPanel";
import { useAudio } from "@/hooks/useAudio";

const { width: SW, height: SH } = Dimensions.get("window");

type Lang = "pt" | "en" | "es";

const TR = {
  pt: {
    ativarMic: "ATIVAR MICROFONE",
    acessoNegado: "ACESSO NEGADO",
    intensidade: "INTENSIDADE",
    suave: "SUAVE",
    inalando: "INALANDO",
    exalando: "EXALANDO",
    ouvindo: "OUVINDO",
    selecionarCor: "COR DE ACENTO",
    dark: "ESCURO",
    light: "CLARO",
    reacao: "REAÇÃO AO SOM",
    reacoes: [
      "Expansão da esfera",
      "Aumento de conexões",
      "Vibração interna",
      "Ondas de energia",
      "Pulsações do núcleo",
      "Partículas orbitais",
      "Distorção sutil",
    ] as const,
  },
  en: {
    ativarMic: "ACTIVATE MIC",
    acessoNegado: "ACCESS DENIED",
    intensidade: "INTENSITY",
    suave: "GENTLE",
    inalando: "INHALING",
    exalando: "EXHALING",
    ouvindo: "LISTENING",
    selecionarCor: "ACCENT COLOR",
    dark: "DARK",
    light: "LIGHT",
    reacao: "SOUND REACTIONS",
    reacoes: [
      "Sphere expansion",
      "Connection growth",
      "Internal vibration",
      "Energy waves",
      "Core pulsations",
      "Orbital particles",
      "Subtle distortion",
    ] as const,
  },
  es: {
    ativarMic: "ACTIVAR MIC",
    acessoNegado: "ACCESO DENEGADO",
    intensidade: "INTENSIDAD",
    suave: "SUAVE",
    inalando: "INHALANDO",
    exalando: "EXHALANDO",
    ouvindo: "ESCUCHANDO",
    selecionarCor: "COLOR DE ACENTO",
    dark: "OSCURO",
    light: "CLARO",
    reacao: "REACCIONES AL SONIDO",
    reacoes: [
      "Expansión de esfera",
      "Aumento de conexiones",
      "Vibración interna",
      "Ondas de energía",
      "Pulsaciones del núcleo",
      "Partículas orbitales",
      "Distorsión sutil",
    ] as const,
  },
} as const;

const PRESET_COLORS = [
  "#f97316",
  "#00f5ff",
  "#00ff88",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#10b981",
  "#ef4444",
  "#facc15",
  "#06b6d4",
];

const CIRCUMFERENCE = 2 * Math.PI * 22;

export default function NeuralOrbScreen() {
  const systemScheme = useColorScheme();
  const [darkMode, setDarkMode] = useState(systemScheme === "dark");
  const [lang, setLang] = useState<Lang>("en");
  const [accentColor, setAccentColor] = useState("#f97316");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [intensity, setIntensity] = useState(0);
  const [breathState, setBreathState] = useState<
    "suave" | "inalando" | "exalando"
  >("suave");

  const insets = useSafeAreaInsets();
  const { audioLevel, isActive, isDenied, startMic, stopMic } = useAudio();
  const breathRef = useRef(0);
  const tickRef = useRef(0);

  const tr = TR[lang];

  useEffect(() => {
    tickRef.current++;
    const newIntensity = Math.min(100, Math.round(audioLevel * 100));
    if (tickRef.current % 3 === 0) {
      setIntensity(newIntensity);
      breathRef.current += 0.003;
      const b = Math.sin(breathRef.current) * 0.5 + 0.5;
      setBreathState(b < 0.3 ? "exalando" : b > 0.7 ? "inalando" : "suave");
    }
  }, [audioLevel]);

  const bg = darkMode ? "#060a10" : "#ffffff";
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const ORB_SIZE = Math.min(SW, SH * 0.65);

  const fgA = (a: number) =>
    darkMode
      ? `rgba(255,255,255,${a})`
      : `rgba(0,0,0,${a})`;

  const handleMicPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isActive) {
      stopMic();
    } else {
      startMic();
    }
  };

  const handleColorSelect = (c: string) => {
    setAccentColor(c);
    setShowColorPicker(false);
    Haptics.selectionAsync();
  };

  const dashOffset = CIRCUMFERENCE - (intensity / 100) * CIRCUMFERENCE;

  const accentRgbStr = (() => {
    const m = accentColor.replace("#", "").match(/.{2}/g);
    if (!m) return "249,115,22";
    return `${parseInt(m[0], 16)},${parseInt(m[1], 16)},${parseInt(m[2], 16)}`;
  })();

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar hidden />

      <View style={styles.orbContainer}>
        <OrbVisualization
          audioLevel={audioLevel}
          accentColor={accentColor}
          darkMode={darkMode}
          width={ORB_SIZE}
          height={ORB_SIZE}
        />
      </View>

      <View style={[styles.topBar, { top: topPad + 10 }]}>
        <TouchableOpacity
          onPress={() => setShowColorPicker(true)}
          style={[styles.colorDot, { backgroundColor: accentColor }]}
          testID="color-picker-btn"
        />
        {(["pt", "en", "es"] as Lang[]).map((l) => (
          <TouchableOpacity
            key={l}
            onPress={() => setLang(l)}
            style={styles.langBtn}
          >
            <Text
              style={[
                styles.langText,
                {
                  color: l === lang ? accentColor : fgA(0.35),
                  fontWeight: l === lang ? "700" : "400",
                },
              ]}
            >
              {l.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={() => setDarkMode((d) => !d)}
          style={[styles.modeBtn, { borderColor: fgA(0.13) }]}
        >
          <Text style={[styles.modeBtnText, { color: fgA(0.45) }]}>
            {darkMode ? tr.light : tr.dark}
          </Text>
        </TouchableOpacity>
      </View>

      <ReactionsPanel
        reacoes={tr.reacoes}
        reacaoLabel={tr.reacao}
        intensity={intensity}
        isActive={isActive}
        accentColor={accentColor}
        darkMode={darkMode}
        topOffset={SH * 0.5 - 110}
      />

      <View style={[styles.rightPanel, { top: topPad + 62 }]}>
        <Text style={[styles.panelLabel, { color: fgA(0.38) }]}>
          {tr.intensidade}
        </Text>
        <Text
          style={[
            styles.intensityNum,
            {
              color: `rgba(${accentRgbStr},${Math.max(0.22, 0.26 + intensity * 0.007)})`,
            },
          ]}
        >
          {intensity}%
        </Text>
        <Svg width={52} height={52} viewBox="0 0 52 52">
          <Circle
            cx="26"
            cy="26"
            r="22"
            fill="none"
            stroke={fgA(0.07)}
            strokeWidth="2"
          />
          <Circle
            cx="26"
            cy="26"
            r="22"
            fill="none"
            stroke={accentColor}
            strokeWidth="2"
            strokeDasharray={`${CIRCUMFERENCE}`}
            strokeDashoffset={`${dashOffset}`}
            strokeLinecap="round"
            transform="rotate(-90 26 26)"
            opacity={Math.max(0.2, intensity / 100)}
          />
        </Svg>
      </View>

      <View style={[styles.bottomArea, { bottom: bottomPad + 28 }]}>
        <Text style={[styles.breathText, { color: fgA(0.35) }]}>
          {tr[breathState]}
        </Text>

        {isActive ? (
          <TouchableOpacity
            onPress={handleMicPress}
            style={[styles.listeningBadge, { borderColor: fgA(0.1) }]}
          >
            <View
              style={[styles.listeningDot, { backgroundColor: accentColor }]}
            />
            <Text style={[styles.listeningText, { color: fgA(0.5) }]}>
              {tr.ouvindo}
            </Text>
          </TouchableOpacity>
        ) : isDenied ? (
          <Text style={[styles.deniedText, { color: fgA(0.38) }]}>
            {tr.acessoNegado}
          </Text>
        ) : (
          <TouchableOpacity
            onPress={handleMicPress}
            style={[styles.micBtn, { borderColor: accentColor }]}
            testID="mic-button"
          >
            <Text style={[styles.micBtnText, { color: accentColor }]}>
              {tr.ativarMic}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={showColorPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowColorPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowColorPicker(false)}
        >
          <View
            style={[
              styles.colorPickerBox,
              { backgroundColor: darkMode ? "#111820" : "#f0f0f0" },
            ]}
          >
            <Text style={[styles.pickerTitle, { color: fgA(0.65) }]}>
              {tr.selecionarCor}
            </Text>
            <View style={styles.colorGrid}>
              {PRESET_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => handleColorSelect(c)}
                  style={[
                    styles.colorSwatch,
                    {
                      backgroundColor: c,
                      borderWidth: c === accentColor ? 3 : 0,
                      borderColor: darkMode ? "#ffffff" : "#000000",
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  orbContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
  },
  colorDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    marginRight: 2,
  },
  langBtn: {
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  langText: {
    fontSize: 10,
    letterSpacing: 0.8,
  },
  modeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginLeft: 2,
  },
  modeBtnText: {
    fontSize: 9,
    letterSpacing: 0.8,
  },
  rightPanel: {
    position: "absolute",
    right: 18,
    alignItems: "flex-end",
    gap: 4,
  },
  panelLabel: {
    fontSize: 7,
    fontWeight: "600",
    letterSpacing: 1.6,
  },
  intensityNum: {
    fontSize: 26,
    fontWeight: "200",
    letterSpacing: 0.5,
  },
  bottomArea: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 12,
  },
  breathText: {
    fontSize: 9,
    letterSpacing: 1.8,
  },
  micBtn: {
    borderWidth: 1,
    paddingHorizontal: 30,
    paddingVertical: 13,
  },
  micBtnText: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "500",
  },
  listeningBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
  },
  listeningDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  listeningText: {
    fontSize: 9,
    letterSpacing: 1.8,
  },
  deniedText: {
    fontSize: 9,
    letterSpacing: 1.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  colorPickerBox: {
    borderRadius: 18,
    padding: 22,
    width: 244,
    gap: 16,
  },
  pickerTitle: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.5,
    textAlign: "center",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
});
