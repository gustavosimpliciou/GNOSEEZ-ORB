import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type MutableRefObject,
  type CSSProperties,
} from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
};

type AiAnalyser = { node: AnalyserNode; data: Uint8Array };

type Props = {
  isDark: boolean;
  isMobile: boolean;
  aiAnalyserRef: MutableRefObject<AiAnalyser | null>;
  chatRecordingAnalyserRef: MutableRefObject<AiAnalyser | null>;
  onAiSpeaking: (v: boolean) => void;
  recordingRef: MutableRefObject<boolean>;
  onInputColorChange: (color: string) => void;
  onOutputColorChange: (color: string) => void;
};

const MONO = "'JetBrains Mono','SF Mono','Fira Code','Courier New',monospace";

const T = {
  bg:         "rgba(3, 7, 14, 0.97)",
  green:      "#00ff64",
  greenDim:   "rgba(0,255,100,0.60)",
  greenFaint: "rgba(0,255,100,0.16)",
  cyan:       "#4af0ff",
  cyanDim:    "rgba(74,240,255,0.65)",
  white:      "rgba(210,230,255,0.90)",
  dim:        "rgba(140,165,200,0.55)",
  faint:      "rgba(80,110,150,0.22)",
};

const MIN_W = 230; const MAX_W = 560;
const MIN_H = 160; const MAX_H = 620;

export default function AiChat({
  isDark,
  isMobile,
  aiAnalyserRef,
  chatRecordingAnalyserRef,
  onAiSpeaking,
  recordingRef,
  onInputColorChange,
  onOutputColorChange,
}: Props) {
  void isDark;

  const [messages,       setMessages]       = useState<ChatMessage[]>([]);
  const [input,          setInput]          = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [isLoading,      setIsLoading]      = useState(false);
  const [isRecording,    setIsRecording]    = useState(false);
  const [isSpeaking,     setIsSpeaking]     = useState(false);
  const [showSettings,   setShowSettings]   = useState(false);
  const [inputColor,     setInputColor]     = useState("#00ff64");
  const [outputColor,    setOutputColor]    = useState("#4af0ff");
  const [voiceStatus,    setVoiceStatus]    = useState("");

  // ── Draggable / resizable state ──────────────────────────────────────────
  const [isMinimized, setIsMinimized] = useState(false);
  const [pos,  setPos]  = useState<{ x: number; y: number } | null>(null);
  const [iconPos, setIconPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: isMobile ? 300 : 270, h: isMobile ? 220 : 300 });

  const dragState      = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const iconDragState  = useRef<{ ox: number; oy: number; dragged: boolean } | null>(null);
  const resizeState    = useRef<{ ox: number; oy: number; sw: number; sh: number } | null>(null);
  const panelRef       = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);

  const initPos = useCallback(() => {
    if (pos !== null) return;
    setPos({
      x: window.innerWidth  - size.w - (isMobile ? 10 : 18),
      y: window.innerHeight - size.h - (isMobile ? 68 : 82),
    });
  }, [pos, size.w, size.h, isMobile]);

  useEffect(() => { initPos(); }, []); // eslint-disable-line

  const clampX = (x: number) => Math.max(0, Math.min(window.innerWidth  - size.w, x));
  const clampY = (y: number) => Math.max(0, Math.min(window.innerHeight - size.h, y));

  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const current = pos ?? { x: window.innerWidth - size.w - 18, y: window.innerHeight - size.h - 82 };
    dragState.current = { ox: clientX - current.x, oy: clientY - current.y, px: current.x, py: current.y };

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const cx = "touches" in ev ? (ev as TouchEvent).touches[0].clientX : (ev as MouseEvent).clientX;
      const cy = "touches" in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY;
      if (!dragState.current) return;
      setPos({ x: clampX(cx - dragState.current.ox), y: clampY(cy - dragState.current.oy) });
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  }, [pos, size.w, size.h]); // eslint-disable-line

  const onResizeEdge = useCallback((e: React.MouseEvent | React.TouchEvent, edge: string) => {
    e.preventDefault(); e.stopPropagation();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const curPos = pos ?? { x: window.innerWidth - size.w - 18, y: window.innerHeight - size.h - 82 };
    resizeState.current = { ox: clientX, oy: clientY, sw: size.w, sh: size.h };
    const sx = curPos.x, sy = curPos.y;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const cx = "touches" in ev ? (ev as TouchEvent).touches[0].clientX : (ev as MouseEvent).clientX;
      const cy = "touches" in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY;
      if (!resizeState.current) return;
      const dx = cx - resizeState.current.ox;
      const dy = cy - resizeState.current.oy;
      let nw = resizeState.current.sw, nh = resizeState.current.sh;
      let nx = sx, ny = sy;
      if (edge.includes("e")) nw = Math.max(MIN_W, Math.min(MAX_W, resizeState.current.sw + dx));
      if (edge.includes("s")) nh = Math.max(MIN_H, Math.min(MAX_H, resizeState.current.sh + dy));
      if (edge.includes("w")) { nw = Math.max(MIN_W, Math.min(MAX_W, resizeState.current.sw - dx)); nx = sx + (resizeState.current.sw - nw); }
      if (edge.includes("n")) { nh = Math.max(MIN_H, Math.min(MAX_H, resizeState.current.sh - dy)); ny = sy + (resizeState.current.sh - nh); }
      setSize({ w: nw, h: nh });
      setPos({ x: nx, y: ny });
    };
    const onUp = () => {
      resizeState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  }, [pos, size.w, size.h]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Init conversation ────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/openai/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Neural Orb Chat" }),
    })
      .then(r => r.json())
      .then(c => setConversationId(c.id))
      .catch(console.error);
  }, []);

  // ── AI audio playback ────────────────────────────────────────────────────
  const playAiAudio = useCallback(async (base64: string) => {
    try {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const audioBuffer = await ctx.decodeAudioData(bytes.buffer as ArrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.28;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      aiAnalyserRef.current = { node: analyser, data: dataArray };
      setIsSpeaking(true);
      onAiSpeaking(true);
      source.onended = () => {
        aiAnalyserRef.current = null;
        setIsSpeaking(false);
        onAiSpeaking(false);
      };
      source.start();
    } catch (e) { console.error("Audio playback:", e); }
  }, [aiAnalyserRef, onAiSpeaking]);

  // ── SSE stream parser ────────────────────────────────────────────────────
  const processStream = useCallback(async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.type === "user_transcript" && ev.content) {
            setMessages(p => [...p, { id: crypto.randomUUID(), role: "user", content: ev.content }]);
          } else if (ev.type === "text_chunk" && ev.content) {
            setMessages(p => {
              const last = p[p.length - 1];
              if (last?.role === "assistant" && last.streaming)
                return [...p.slice(0, -1), { ...last, content: last.content + ev.content }];
              return [...p, { id: crypto.randomUUID(), role: "assistant", content: ev.content, streaming: true }];
            });
          } else if (ev.type === "audio" && ev.data) {
            await playAiAudio(ev.data);
          } else if (ev.type === "done") {
            setMessages(p => {
              const last = p[p.length - 1];
              return last?.streaming ? [...p.slice(0, -1), { ...last, streaming: false }] : p;
            });
          } else if (ev.type === "error") {
            setMessages(p => [...p, { id: crypto.randomUUID(), role: "assistant", content: `⚠ ${ev.message ?? "Erro de conexão"}` }]);
          }
        } catch {}
      }
    }
  }, [playAiAudio]);

  // ── Send text ────────────────────────────────────────────────────────────
  const sendText = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    if (!conversationId) { console.warn("Aguardando conexão com o servidor..."); return; }
    const content = input.trim();
    setInput("");
    setIsLoading(true);
    setMessages(p => [...p, { id: crypto.randomUUID(), role: "user", content }]);
    try {
      const res = await fetch(`/api/openai/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.body) await processStream(res.body.getReader());
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, [input, conversationId, isLoading, processStream]);

  // ── Voice recording ──────────────────────────────────────────────────────
  const toggleRecording = useCallback(async () => {
    if (isRecording) { mediaRecorderRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioContext();
      }
      const recCtx = audioCtxRef.current;
      const recAnalyser = recCtx.createAnalyser();
      recAnalyser.fftSize = 256;
      recAnalyser.smoothingTimeConstant = 0.28;
      recCtx.createMediaStreamSource(stream).connect(recAnalyser);
      chatRecordingAnalyserRef.current = { node: recAnalyser, data: new Uint8Array(recAnalyser.frequencyBinCount) };

      const PREFERRED = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg'];
      const mimeType  = PREFERRED.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
      let recorder: MediaRecorder;
      try { recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream); }
      catch { recorder = new MediaRecorder(stream); }
      const effectiveMime = recorder.mimeType || mimeType || 'audio/webm';
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        chatRecordingAnalyserRef.current = null;
        recordingRef.current = false;
        setIsRecording(false);
        if (!conversationId || chunksRef.current.length === 0) return;
        try {
          const blob  = new Blob(chunksRef.current, { type: effectiveMime });
          const ab    = await blob.arrayBuffer();
          const bytes = new Uint8Array(ab);
          let bin = ""; const C = 8192;
          for (let i = 0; i < bytes.length; i += C) bin += String.fromCharCode(...bytes.subarray(i, i + C));
          setIsLoading(true);
          try {
            const res = await fetch(`/api/openai/conversations/${conversationId}/voice-messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audio: btoa(bin) }),
            });
            if (res.body) await processStream(res.body.getReader());
          } finally { setIsLoading(false); }
        } catch (err) { console.error("Audio send:", err); setIsLoading(false); }
      };
      mediaRecorderRef.current = recorder;
      recorder.start(300);
      recordingRef.current = true;
      setIsRecording(true);
    } catch (e) { console.error("Mic:", e); }
  }, [isRecording, conversationId, processStream, recordingRef, chatRecordingAnalyserRef]);

  // ── Voice gender select ──────────────────────────────────────────────────
  const selectByGender = useCallback(async (gender: "male" | "female") => {
    await fetch("/api/fish/voice-preference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gender }),
    });
    setVoiceStatus(`✓ voz ${gender === "male" ? "masculina" : "feminina"} ativa`);
    setTimeout(() => setVoiceStatus(""), 2500);
  }, []);

  // ── Color change handlers ────────────────────────────────────────────────
  const handleInputColor = useCallback((color: string) => {
    setInputColor(color);
    onInputColorChange(color);
  }, [onInputColorChange]);

  const handleOutputColor = useCallback((color: string) => {
    setOutputColor(color);
    onOutputColorChange(color);
  }, [onOutputColorChange]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const currentPos = pos ?? { x: window.innerWidth - size.w - 18, y: window.innerHeight - size.h - 82 };

  const termBorder = isRecording ? `1px solid ${inputColor}` : isSpeaking ? `1px solid ${outputColor}` : `1px solid ${T.faint}`;
  const termGlow   = isRecording ? `0 0 20px ${inputColor}44` : isSpeaking ? `0 0 20px ${outputColor}44` : `0 4px 28px rgba(0,0,0,0.65)`;

  const statusText  = isRecording ? "OUVINDO" : isSpeaking ? "FALANDO" : isLoading ? "..." : "ONLINE";
  const statusColor = isRecording ? inputColor : isSpeaking ? outputColor : T.greenDim;

  const panelStyle: CSSProperties = {
    position: "fixed", left: currentPos.x, top: currentPos.y,
    width: size.w, height: size.h, zIndex: 20,
    pointerEvents: "auto", fontFamily: MONO,
    display: "flex", flexDirection: "column", gap: 5,
    userSelect: "none", overflow: "visible",
  };

  const inputStyle: CSSProperties = {
    flex: 1, background: "transparent",
    border: "none", outline: "none",
    fontSize: 11, color: inputColor,
    letterSpacing: "0.03em", fontFamily: MONO,
    fontWeight: 500, caretColor: inputColor,
    userSelect: "text",
  };

  const iconBtn = (active: boolean, color: string): CSSProperties => ({
    background:   active ? `${color}2e` : "rgba(120,180,255,0.10)",
    border:       `1.5px solid ${active ? color : "rgba(140,185,255,0.55)"}`,
    borderRadius: 5, cursor: "pointer", padding: "5px 10px",
    color: active ? color : "rgba(200,225,255,0.85)",
    transition: "all 0.18s", display: "flex", alignItems: "center",
    justifyContent: "center", flexShrink: 0,
    boxShadow: active ? `0 0 10px ${color}59` : "none",
    fontSize: 14, fontFamily: MONO,
  });

  const EDGES = [
    { e:"n",  style:{ top:-4,    left:10,  right:10,  height:8,  cursor:"n-resize"  } as CSSProperties },
    { e:"s",  style:{ bottom:-4, left:10,  right:10,  height:8,  cursor:"s-resize"  } as CSSProperties },
    { e:"e",  style:{ right:-4,  top:10,   bottom:10, width:8,   cursor:"e-resize"  } as CSSProperties },
    { e:"w",  style:{ left:-4,   top:10,   bottom:10, width:8,   cursor:"w-resize"  } as CSSProperties },
    { e:"ne", style:{ top:-4,    right:-4, width:14,  height:14, cursor:"ne-resize" } as CSSProperties },
    { e:"se", style:{ bottom:-4, right:-4, width:14,  height:14, cursor:"se-resize" } as CSSProperties },
    { e:"sw", style:{ bottom:-4, left:-4,  width:14,  height:14, cursor:"sw-resize" } as CSSProperties },
    { e:"nw", style:{ top:-4,    left:-4,  width:14,  height:14, cursor:"nw-resize" } as CSSProperties },
  ];

  if (isMinimized) {
    const fallback = pos ?? { x: window.innerWidth - size.w - 18, y: window.innerHeight - size.h - 82 };
    const ip = iconPos ?? { x: fallback.x, y: fallback.y + size.h - 44 };

    const onIconDragStart = (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
      const cy = "touches" in e ? e.touches[0].clientY : e.clientY;
      iconDragState.current = { ox: cx - ip.x, oy: cy - ip.y, dragged: false };

      const onMove = (ev: MouseEvent | TouchEvent) => {
        const mx = "touches" in ev ? (ev as TouchEvent).touches[0].clientX : (ev as MouseEvent).clientX;
        const my = "touches" in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY;
        if (!iconDragState.current) return;
        iconDragState.current.dragged = true;
        setIconPos({
          x: Math.max(0, Math.min(window.innerWidth  - 44, mx - iconDragState.current.ox)),
          y: Math.max(0, Math.min(window.innerHeight - 44, my - iconDragState.current.oy)),
        });
      };
      const onUp = () => {
        if (iconDragState.current && !iconDragState.current.dragged) setIsMinimized(false);
        iconDragState.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onUp);
    };

    return (
      <div
        title="Arrastar / clique para abrir"
        onMouseDown={onIconDragStart}
        onTouchStart={onIconDragStart}
        style={{
          position: "fixed", left: ip.x, top: ip.y,
          width: 44, height: 44, zIndex: 20,
          background: T.bg,
          border: isSpeaking ? `1px solid ${outputColor}` : `1px solid ${T.faint}`,
          borderRadius: "50%", cursor: "grab",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: isSpeaking ? `0 0 18px ${outputColor}72` : `0 4px 18px rgba(0,0,0,0.55)`,
          transition: "border-color 0.3s, box-shadow 0.3s",
          fontFamily: MONO, userSelect: "none",
        }}
      >
        <span style={{
          fontSize: 20, userSelect: "none", pointerEvents: "none",
          animation: isSpeaking ? "termPulse 1.1s ease-in-out infinite" : "none",
          color: isSpeaking ? outputColor : T.greenDim,
        }}>⬡</span>
        {isSpeaking && (
          <span style={{
            position: "absolute", top: -3, right: -3,
            width: 9, height: 9, borderRadius: "50%",
            background: outputColor, boxShadow: `0 0 6px ${outputColor}`,
            animation: "termPulse 0.9s ease-in-out infinite",
            pointerEvents: "none",
          }} />
        )}
        <style>{`
          @keyframes termPulse {
            0%,100% { opacity:1; transform:scale(1); }
            50% { opacity:0.3; transform:scale(0.65); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div ref={panelRef} style={panelStyle}>
      {EDGES.map(({ e, style }) => (
        <div key={e} style={{ position:"absolute", zIndex:30, background:"transparent", ...style }}
          onMouseDown={ev => onResizeEdge(ev, e)}
          onTouchStart={ev => onResizeEdge(ev, e)}
        />
      ))}

      {/* ── Settings Panel ────────────────────────────────────────────────── */}
      {showSettings && (
        <div style={{
          background: T.bg, border: `1px solid ${T.faint}`,
          borderRadius: 6, padding: "10px 12px",
          flexShrink: 0, boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
        }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <div style={{ flex: 1, fontSize: 8, letterSpacing: "0.22em", color: T.greenDim, textTransform: "uppercase" }}>
              // CONFIG
            </div>
            <button onClick={() => setShowSettings(false)} style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 14, color: T.dim, padding: "0 2px", lineHeight: 1, fontFamily: MONO,
            }}>×</button>
          </div>

          {/* Voice gender */}
          <div style={{ fontSize: 7, color: T.dim, marginBottom: 5, letterSpacing: "0.14em", textTransform: "uppercase" }}>voz</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {(["male","female"] as const).map(g => (
              <button key={g} onClick={() => selectByGender(g)} style={{
                flex: 1, background: "rgba(120,180,255,0.08)",
                border: `1px solid rgba(140,185,255,0.40)`,
                borderRadius: 4, cursor: "pointer",
                padding: "5px 4px", fontSize: 9,
                color: "rgba(200,225,255,0.85)", fontFamily: MONO,
                letterSpacing: "0.10em", textTransform: "uppercase",
              }}>
                {g === "male" ? "♂ Masc" : "♀ Fem"}
              </button>
            ))}
          </div>
          {voiceStatus && (
            <div style={{ fontSize: 7.5, color: T.greenDim, marginBottom: 8, letterSpacing: "0.05em" }}>
              {voiceStatus}
            </div>
          )}

          <div style={{ borderTop: `1px solid ${T.faint}`, margin: "4px 0 10px" }} />

          {/* Orb colors */}
          <div style={{ fontSize: 7, color: T.dim, marginBottom: 8, letterSpacing: "0.14em", textTransform: "uppercase" }}>cor do orb</div>

          {/* Input color */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 8, color: T.dim, letterSpacing: "0.08em", flex: 1 }}>Entrada</div>
            <input
              type="color"
              value={inputColor}
              onChange={e => handleInputColor(e.target.value)}
              style={{ width: 28, height: 20, border: "none", background: "none", cursor: "pointer", padding: 0 }}
            />
            <span style={{ fontSize: 8, color: T.dim, fontFamily: "monospace", width: 52 }}>{inputColor}</span>
          </div>

          {/* Output color */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 8, color: T.dim, letterSpacing: "0.08em", flex: 1 }}>Saída</div>
            <input
              type="color"
              value={outputColor}
              onChange={e => handleOutputColor(e.target.value)}
              style={{ width: 28, height: 20, border: "none", background: "none", cursor: "pointer", padding: 0 }}
            />
            <span style={{ fontSize: 8, color: T.dim, fontFamily: "monospace", width: 52 }}>{outputColor}</span>
          </div>
        </div>
      )}

      {/* ── Terminal Main Panel ────────────────────────────────────────────── */}
      <div style={{
        background: T.bg, border: termBorder,
        borderRadius: 6, boxShadow: termGlow,
        flex: 1, display: "flex", flexDirection: "column",
        overflow: "hidden", transition: "border-color 0.3s, box-shadow 0.3s",
        minHeight: 0,
      }}>

        {/* Header */}
        <div
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 10px",
            borderBottom: `1px solid ${T.faint}`,
            flexShrink: 0,
            background: "rgba(0,255,100,0.025)",
            cursor: "grab",
          }}
        >
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {["#ff5f57","#ffbd2e","#28c840"].map((c, i) => (
              <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />
            ))}
          </div>
          <div style={{ flex: 1, fontSize: 7.5, letterSpacing: "0.20em", color: T.greenDim, textTransform: "uppercase" }}>
            neural-orb ~ ai
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%", background: statusColor,
              boxShadow: isSpeaking ? `0 0 7px ${statusColor}` : "none",
              display: "inline-block",
              animation: isSpeaking ? "termPulse 1.1s ease-in-out infinite" : "none",
            }} />
            <span style={{ fontSize: 7, letterSpacing: "0.18em", color: statusColor }}>{statusText}</span>
          </div>
          <button
            onClick={e => { e.stopPropagation(); setIsMinimized(true); }}
            onMouseDown={e => e.stopPropagation()}
            style={{ background:"none", border:"1px solid transparent", borderRadius:3, cursor:"pointer", padding:"2px 5px", color:T.dim, fontSize:13, lineHeight:1, transition:"all 0.2s", fontFamily:MONO }}
          >−</button>
          <button
            onClick={e => { e.stopPropagation(); setShowSettings(v => !v); }}
            onMouseDown={e => e.stopPropagation()}
            style={{
              background: showSettings ? "rgba(0,255,100,0.10)" : "none",
              border: showSettings ? `1px solid ${T.greenFaint}` : "1px solid transparent",
              borderRadius: 3, cursor: "pointer", padding: "2px 5px",
              color: showSettings ? T.green : T.dim,
              fontSize: 11, lineHeight: 1, transition: "all 0.2s", fontFamily: MONO,
            }}
          >⚙</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative", minHeight: 0 }}>
          <div className="orb-scroll" style={{ height: "100%", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: `${inputColor}30 transparent`, padding: "6px 0 4px" }}>

            {messages.length === 0 && !isLoading && (
              <div style={{ padding: "4px 10px", color: T.dim, fontSize: 9, lineHeight: 1.7 }}>
                <span style={{ color: T.greenFaint }}>$</span> pronto. fale ou escreva...<br />
                <span style={{ color: "rgba(80,120,160,0.55)", fontSize: 8 }}>orb reage a voz média/alta</span>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} style={{ padding: "1px 10px", marginBottom: 4 }}>
                {msg.role === "user" ? (
                  <div style={{ display: "flex", gap: 5, alignItems: "flex-start" }}>
                    <span style={{ color: inputColor, fontSize: 10, flexShrink: 0, marginTop: 1 }}>›</span>
                    <span style={{ fontSize: 10, lineHeight: 1.55, color: inputColor, letterSpacing: "0.02em", wordBreak: "break-word", userSelect: "text" }}>
                      {msg.content}
                    </span>
                  </div>
                ) : (
                  <div>
                    <span style={{ color: outputColor, fontSize: 8, letterSpacing: "0.10em", opacity: 0.75 }}>ORB </span>
                    <span style={{ color: T.dim, fontSize: 8 }}>~</span>
                    <span style={{ fontSize: 10, lineHeight: 1.6, color: T.white, letterSpacing: "0.01em", wordBreak: "break-word", marginLeft: 4, userSelect: "text" }}>
                      {msg.content}
                      {msg.streaming && <span style={{ opacity: 0.6, marginLeft: 2, color: outputColor, animation: "termBlink 1s step-end infinite" }}>▌</span>}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {isLoading && !messages.some(m => m.streaming) && (
              <div style={{ padding: "2px 10px", display: "flex", gap: 3, alignItems: "center" }}>
                <span style={{ color: outputColor, fontSize: 8, opacity: 0.75 }}>ORB ~ </span>
                {[0,1,2].map(i => (
                  <span key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: outputColor, opacity: 0.65, display: "inline-block", animation: `termDot 1.2s ease-in-out ${i*0.18}s infinite` }} />
                ))}
              </div>
            )}

            {isRecording && (
              <div style={{ padding: "2px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: inputColor, animation: "termPulse 0.9s ease-in-out infinite", display: "inline-block", boxShadow: `0 0 8px ${inputColor}` }} />
                <span style={{ fontSize: 8, color: inputColor, opacity: 0.85, letterSpacing: "0.14em" }}>OUVINDO...</span>
              </div>
            )}

            {isSpeaking && !isRecording && (
              <div style={{ padding: "2px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: outputColor, animation: "termPulse 0.7s ease-in-out infinite", display: "inline-block", boxShadow: `0 0 8px ${outputColor}` }} />
                <span style={{ fontSize: 8, color: outputColor, opacity: 0.75, letterSpacing: "0.14em" }}>ORB FALANDO...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── Input row ──────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px 8px",
          borderTop: `1px solid ${T.faint}`,
          background: "rgba(0,255,100,0.015)",
          flexShrink: 0,
          position: "relative",
        }}>
          {/* Sonar rings when recording */}
          {isRecording && <>
            <div style={{ position: "absolute", width: 60, height: 60, borderRadius: "50%", border: `1px solid ${inputColor}`, pointerEvents: "none", animation: "micRing 1.5s ease-out infinite" }} />
            <div style={{ position: "absolute", width: 60, height: 60, borderRadius: "50%", border: `1px solid ${inputColor}`, pointerEvents: "none", animation: "micRing 1.5s ease-out 0.55s infinite" }} />
            <div style={{ position: "absolute", width: 60, height: 60, borderRadius: "50%", border: `1px solid ${inputColor}`, pointerEvents: "none", animation: "micRing 1.5s ease-out 1.1s infinite" }} />
          </>}

          <button
            onClick={toggleRecording}
            title={isRecording ? "Parar gravação" : "Falar com o Orb"}
            disabled={isLoading && !isRecording}
            onMouseDown={e => e.stopPropagation()}
            style={{
              width: 48, height: 48,
              borderRadius: "50%",
              border: `1.5px solid ${isRecording ? inputColor : "rgba(0,255,100,0.28)"}`,
              background: isRecording
                ? `radial-gradient(circle at center, ${inputColor}20 0%, transparent 70%)`
                : "rgba(0,0,0,0.35)",
              color: isRecording ? inputColor : T.dim,
              cursor: (isLoading && !isRecording) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: isRecording
                ? `0 0 22px ${inputColor}44, 0 0 8px ${inputColor}22, inset 0 0 12px ${inputColor}10`
                : "0 0 10px rgba(0,255,100,0.06)",
              animation: isRecording ? "micActive 0.8s ease-in-out infinite alternate" : "micIdle 3.5s ease-in-out infinite",
              transition: "border-color 0.35s, box-shadow 0.35s, background 0.35s, color 0.35s",
              flexShrink: 0,
              position: "relative",
              zIndex: 1,
              opacity: (isLoading && !isRecording) ? 0.45 : 1,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24"
              fill={isRecording ? inputColor : "none"}
              stroke={isRecording ? inputColor : "rgba(140,165,200,0.7)"}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>

          {/* Loading dots */}
          {isLoading && !isRecording && (
            <div style={{ position: "absolute", right: 14, display: "flex", gap: 3, alignItems: "center" }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: outputColor, animation: `termDot 1.2s ease-in-out ${i*0.2}s infinite` }} />
              ))}
            </div>
          )}

          {/* Status label */}
          <span style={{
            position: "absolute", bottom: 3, left: 0, right: 0,
            textAlign: "center", fontSize: 7, letterSpacing: "0.18em",
            color: isRecording ? inputColor : "rgba(140,165,200,0.3)",
            transition: "color 0.3s",
            fontFamily: MONO,
          }}>
            {isRecording ? "OUVINDO" : isLoading ? "PROCESSANDO" : "TOQUE PARA FALAR"}
          </span>
        </div>

      </div>

      <style>{`
        @keyframes termDot {
          0%,80%,100% { transform:scale(0.5); opacity:0.2; }
          40% { transform:scale(1); opacity:1; }
        }
        @keyframes termPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.3; transform:scale(0.65); }
        }
        @keyframes termBlink {
          0%,100% { opacity:1; }
          50% { opacity:0; }
        }
        @keyframes micIdle {
          0%,100% { box-shadow: 0 0 10px rgba(0,255,100,0.06); }
          50% { box-shadow: 0 0 18px rgba(0,255,100,0.18), 0 0 5px rgba(0,255,100,0.10); }
        }
        @keyframes micActive {
          from { box-shadow: 0 0 14px var(--mic-c,#00ff64)44, inset 0 0 8px var(--mic-c,#00ff64)10; }
          to   { box-shadow: 0 0 28px var(--mic-c,#00ff64)66, inset 0 0 16px var(--mic-c,#00ff64)20; }
        }
        @keyframes micRing {
          0%   { transform: scale(0.85); opacity: 0.7; }
          100% { transform: scale(2.6);  opacity: 0; }
        }
        .orb-scroll::-webkit-scrollbar { width: 3px; }
        .orb-scroll::-webkit-scrollbar-track { background: transparent; }
        .orb-scroll::-webkit-scrollbar-thumb { background: rgba(0,255,100,0.20); border-radius: 2px; }
        .orb-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,255,100,0.38); }
      `}</style>
    </div>
  );
}
