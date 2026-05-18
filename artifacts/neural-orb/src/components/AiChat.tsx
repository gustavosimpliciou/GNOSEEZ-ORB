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

type VoiceEntry = {
  id: number;
  name: string;
  fishReferenceId: string;
  isSelected: boolean;
};

type AiAnalyser = { node: AnalyserNode; data: Uint8Array };

type Props = {
  isDark: boolean;
  accent: [number, number, number];
  isMobile: boolean;
  aiAnalyserRef: MutableRefObject<AiAnalyser | null>;
  chatRecordingAnalyserRef: MutableRefObject<AiAnalyser | null>;
  onAiSpeaking: (v: boolean) => void;
  recordingRef: MutableRefObject<boolean>;
};

const MONO = "'JetBrains Mono','SF Mono','Fira Code','Courier New',monospace";

const T = {
  bg:         "rgba(3, 7, 14, 0.97)",
  green:      "#00ff64",
  greenDim:   "rgba(0,255,100,0.60)",
  greenFaint: "rgba(0,255,100,0.16)",
  cyan:       "#4af0ff",
  cyanDim:    "rgba(74,240,255,0.65)",
  cyanFaint:  "rgba(74,240,255,0.16)",
  white:      "rgba(210,230,255,0.90)",
  dim:        "rgba(140,165,200,0.55)",
  faint:      "rgba(80,110,150,0.22)",
  red:        "#ff4466",
};

const MIN_W = 230; const MAX_W = 560;
const MIN_H = 160; const MAX_H = 620;

export default function AiChat({
  isDark,
  accent,
  isMobile,
  aiAnalyserRef,
  chatRecordingAnalyserRef,
  onAiSpeaking,
  recordingRef,
}: Props) {
  const [messages,       setMessages]       = useState<ChatMessage[]>([]);
  const [input,          setInput]          = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [isLoading,      setIsLoading]      = useState(false);
  const [isRecording,    setIsRecording]    = useState(false);
  const [isSpeaking,     setIsSpeaking]     = useState(false);
  const [showVoices,     setShowVoices]     = useState(false);
  const [voices,         setVoices]         = useState<VoiceEntry[]>([]);
  const [newVoiceName,   setNewVoiceName]   = useState("");
  const [newVoiceRef,    setNewVoiceRef]    = useState("");
  const [cloneName,      setCloneName]      = useState("");
  const [isCloning,      setIsCloning]      = useState(false);
  const [cloneRecording, setCloneRecording] = useState(false);
  const [cloneStatus,    setCloneStatus]    = useState("");

  // ── Draggable / resizable state ──────────────────────────────────────────
  const [isMinimized, setIsMinimized] = useState(false);
  const [pos,  setPos]  = useState<{ x: number; y: number } | null>(null);
  const [iconPos, setIconPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: isMobile ? 300 : 270, h: isMobile ? 220 : 300 });

  const dragState  = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const iconDragState = useRef<{ ox: number; oy: number; dragged: boolean } | null>(null);
  const resizeState= useRef<{ ox: number; oy: number; sw: number; sh: number } | null>(null);
  const panelRef   = useRef<HTMLDivElement>(null);

  // Default initial position: bottom-right
  const initPos = useCallback(() => {
    if (pos !== null) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({
      x: vw - size.w - (isMobile ? 10 : 18),
      y: vh - size.h - (isMobile ? 68 : 82),
    });
  }, [pos, size.w, size.h, isMobile]);

  useEffect(() => { initPos(); }, []); // eslint-disable-line

  // Drag start (header)
  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const current = pos ?? { x: window.innerWidth - size.w - 18, y: window.innerHeight - size.h - 82 };
    dragState.current = { ox: clientX - current.x, oy: clientY - current.y, px: current.x, py: current.y };

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const cx = "touches" in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
      const cy = "touches" in ev ? ev.touches[0].clientY : (ev as MouseEvent).clientY;
      if (!dragState.current) return;
      const nx = clampX(cx - dragState.current.ox);
      const ny = clampY(cy - dragState.current.oy);
      setPos({ x: nx, y: ny });
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
  }, [pos, size.w, size.h]);

  const clampX = (x: number) => Math.max(0, Math.min(window.innerWidth  - size.w, x));
  const clampY = (y: number) => Math.max(0, Math.min(window.innerHeight - size.h, y));

  // Resize start — any edge or corner
  const onResizeEdge = useCallback((e: React.MouseEvent | React.TouchEvent, edge: string) => {
    e.preventDefault();
    e.stopPropagation();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const curPos = pos ?? { x: window.innerWidth - size.w - 18, y: window.innerHeight - size.h - 82 };
    resizeState.current = { ox: clientX, oy: clientY, sw: size.w, sh: size.h };
    const sx = curPos.x, sy = curPos.y;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const cx = "touches" in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
      const cy = "touches" in ev ? ev.touches[0].clientY : (ev as MouseEvent).clientY;
      if (!resizeState.current) return;
      const dx = cx - resizeState.current.ox;
      const dy = cy - resizeState.current.oy;
      let nw = resizeState.current.sw;
      let nh = resizeState.current.sh;
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

  const messagesEndRef       = useRef<HTMLDivElement>(null);
  const mediaRecorderRef     = useRef<MediaRecorder | null>(null);
  const chunksRef            = useRef<Blob[]>([]);
  const cloneRecorderRef     = useRef<MediaRecorder | null>(null);
  const cloneChunksRef       = useRef<Blob[]>([]);
  const audioCtxRef          = useRef<AudioContext | null>(null);

  void isDark; void accent;

  const termBorder = isRecording ? `1px solid ${T.green}` : isSpeaking ? `1px solid ${T.cyan}` : `1px solid ${T.faint}`;
  const termGlow   = isRecording ? `0 0 20px rgba(0,255,100,0.28)` : isSpeaking ? `0 0 20px rgba(74,240,255,0.28)` : `0 4px 28px rgba(0,0,0,0.65)`;

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

  const loadVoices = useCallback(() => {
    fetch("/api/fish/voices")
      .then(r => r.json())
      .then(setVoices)
      .catch(console.error);
  }, []);

  useEffect(() => { if (showVoices) loadVoices(); }, [showVoices, loadVoices]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

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
          if (ev.type === "user_transcript") {
            setMessages(p => [...p, { id: crypto.randomUUID(), role: "user", content: ev.content }]);
          } else if (ev.type === "text_chunk") {
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

  // ── Voice recording (chat) ───────────────────────────────────────────────
  const toggleRecording = useCallback(async () => {
    if (isRecording) { mediaRecorderRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Connect mic to analyser so the orb reacts while listening
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioContext();
      }
      const recCtx = audioCtxRef.current;
      const recAnalyser = recCtx.createAnalyser();
      recAnalyser.fftSize = 256;
      recAnalyser.smoothingTimeConstant = 0.28;
      recCtx.createMediaStreamSource(stream).connect(recAnalyser);
      chatRecordingAnalyserRef.current = { node: recAnalyser, data: new Uint8Array(recAnalyser.frequencyBinCount) };

      const PREFERRED = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
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
          const blob = new Blob(chunksRef.current, { type: effectiveMime });
          const ab   = await blob.arrayBuffer();
          const bytes1 = new Uint8Array(ab);
          let bin1 = ""; const C = 8192;
          for (let i = 0; i < bytes1.length; i += C) bin1 += String.fromCharCode(...bytes1.subarray(i, i + C));
          const b64  = btoa(bin1);
          setIsLoading(true);
          try {
            const res = await fetch(`/api/openai/conversations/${conversationId}/voice-messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audio: b64 }),
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

  // ── Voice clone recording ────────────────────────────────────────────────
  const toggleCloneRecording = useCallback(async () => {
    if (cloneRecording) { cloneRecorderRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const PREFERRED = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
      const mimeType  = PREFERRED.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
      let recorder: MediaRecorder;
      try { recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream); }
      catch { recorder = new MediaRecorder(stream); }
      const effectiveMime = recorder.mimeType || mimeType || 'audio/webm';
      cloneChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data?.size > 0) cloneChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setCloneRecording(false);
        if (!cloneName.trim() || cloneChunksRef.current.length === 0) {
          setCloneStatus("ERR: nome necessário ou áudio vazio"); return;
        }
        setIsCloning(true);
        setCloneStatus("clonando voz...");
        try {
          const blob = new Blob(cloneChunksRef.current, { type: effectiveMime });
          const ab   = await blob.arrayBuffer();
          const bytes2 = new Uint8Array(ab);
          let bin2 = ""; const C2 = 8192;
          for (let i = 0; i < bytes2.length; i += C2) bin2 += String.fromCharCode(...bytes2.subarray(i, i + C2));
          const b64  = btoa(bin2);
          const res = await fetch("/api/fish/voices/clone", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: cloneName.trim(), audio: b64, mimeType: effectiveMime }),
          });
          if (res.ok) { setCloneStatus("✓ voz clonada!"); setCloneName(""); loadVoices(); }
          else {
            const err = await res.json().catch(() => ({ error: "erro desconhecido" }));
            setCloneStatus(`ERR: ${err.error}`);
          }
        } catch (e) { setCloneStatus(`ERR: ${String(e)}`); }
        finally { setIsCloning(false); }
      };
      cloneRecorderRef.current = recorder;
      recorder.start(300);
      setCloneRecording(true);
      setCloneStatus("● gravando... (clique para parar)");
    } catch { setCloneStatus("ERR: microfone negado"); }
  }, [cloneRecording, cloneName, loadVoices]);

  // ── Voice management ─────────────────────────────────────────────────────
  const addVoice = useCallback(async () => {
    if (!newVoiceName.trim() || !newVoiceRef.trim()) return;
    await fetch("/api/fish/voices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newVoiceName.trim(), fishReferenceId: newVoiceRef.trim() }),
    });
    setNewVoiceName(""); setNewVoiceRef(""); loadVoices();
  }, [newVoiceName, newVoiceRef, loadVoices]);

  const selectVoice = useCallback(async (id: number) => {
    await fetch(`/api/fish/voices/${id}/select`, { method: "POST" }); loadVoices();
  }, [loadVoices]);

  const deleteVoice = useCallback(async (id: number) => {
    await fetch(`/api/fish/voices/${id}`, { method: "DELETE" }); loadVoices();
  }, [loadVoices]);

  const selectByGender = useCallback(async (gender: "male" | "female") => {
    const kw = gender === "male"
      ? ["masculin","male","homem","man","masc"]
      : ["feminin","female","mulher","woman","fem"];
    const match = voices.find(v => kw.some(k => v.name.toLowerCase().includes(k)));
    if (match) {
      await selectVoice(match.id);
    } else {
      await fetch("/api/fish/voice-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gender }),
      });
      setCloneStatus(`✓ voz ${gender === "male" ? "masculina (onyx)" : "feminina (nova)"} ativa`);
    }
  }, [voices, selectVoice]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const currentPos = pos ?? { x: window.innerWidth - size.w - 18, y: window.innerHeight - size.h - 82 };

  const panelStyle: CSSProperties = {
    position:  "fixed",
    left:      currentPos.x,
    top:       currentPos.y,
    width:     size.w,
    height:    size.h,
    zIndex:    20,
    pointerEvents: "auto",
    fontFamily: MONO,
    display:   "flex",
    flexDirection: "column",
    gap:       5,
    userSelect: "none",
    overflow:  "visible",
  };

  const selectedVoice = voices.find(v => v.isSelected);
  const statusText  = isRecording ? "OUVINDO" : isSpeaking ? "FALANDO" : isLoading ? "..." : "ONLINE";
  const statusColor = isRecording ? T.green   : isSpeaking ? T.cyan    : T.greenDim;

  const inputStyle: CSSProperties = {
    flex: 1, background: "transparent",
    border: "none", outline: "none",
    fontSize: 11, color: T.green,
    letterSpacing: "0.03em", fontFamily: MONO,
    fontWeight: 500, caretColor: T.green,
    userSelect: "text",
  };

  // Bright icon button base style
  const iconBtn = (active: boolean, activeColor: string): CSSProperties => ({
    background:   active ? `rgba(${activeColor},0.18)` : "rgba(120,180,255,0.10)",
    border:       `1.5px solid ${active ? `rgb(${activeColor})` : "rgba(140,185,255,0.55)"}`,
    borderRadius: 5, cursor: "pointer",
    padding: "5px 8px",
    color: active ? `rgb(${activeColor})` : "rgba(200,225,255,0.85)",
    transition: "all 0.18s",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
    boxShadow: active ? `0 0 10px rgba(${activeColor},0.35)` : "none",
  });

  const EDGES = [
    { e:"n",  style:{ top:-4,    left:10,  right:10, height:8,            cursor:"n-resize"  } as CSSProperties },
    { e:"s",  style:{ bottom:-4, left:10,  right:10, height:8,            cursor:"s-resize"  } as CSSProperties },
    { e:"e",  style:{ right:-4,  top:10,   bottom:10, width:8,            cursor:"e-resize"  } as CSSProperties },
    { e:"w",  style:{ left:-4,   top:10,   bottom:10, width:8,            cursor:"w-resize"  } as CSSProperties },
    { e:"ne", style:{ top:-4,    right:-4, width:14, height:14,           cursor:"ne-resize" } as CSSProperties },
    { e:"se", style:{ bottom:-4, right:-4, width:14, height:14,           cursor:"se-resize" } as CSSProperties },
    { e:"sw", style:{ bottom:-4, left:-4,  width:14, height:14,           cursor:"sw-resize" } as CSSProperties },
    { e:"nw", style:{ top:-4,    left:-4,  width:14, height:14,           cursor:"nw-resize" } as CSSProperties },
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
        const nx = Math.max(0, Math.min(window.innerWidth - 44, mx - iconDragState.current.ox));
        const ny = Math.max(0, Math.min(window.innerHeight - 44, my - iconDragState.current.oy));
        setIconPos({ x: nx, y: ny });
      };
      const onUp = () => {
        if (iconDragState.current && !iconDragState.current.dragged) {
          setIsMinimized(false);
        }
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
          position: "fixed",
          left: ip.x,
          top: ip.y,
          width: 44,
          height: 44,
          zIndex: 20,
          background: T.bg,
          border: isSpeaking ? `1px solid ${T.cyan}` : isRecording ? `1px solid ${T.green}` : `1px solid ${T.faint}`,
          borderRadius: "50%",
          cursor: "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: isSpeaking ? `0 0 18px rgba(74,240,255,0.45)` : isRecording ? `0 0 18px rgba(0,255,100,0.45)` : `0 4px 18px rgba(0,0,0,0.55)`,
          transition: "border-color 0.3s, box-shadow 0.3s",
          fontFamily: MONO,
          userSelect: "none",
        }}
      >
        <span style={{
          fontSize: 20,
          userSelect: "none",
          pointerEvents: "none",
          animation: (isRecording || isSpeaking) ? "termPulse 1.1s ease-in-out infinite" : "none",
          color: isSpeaking ? T.cyan : isRecording ? T.green : T.greenDim,
        }}>⬡</span>
        {(isRecording || isSpeaking) && (
          <span style={{
            position: "absolute",
            top: -3, right: -3,
            width: 9, height: 9,
            borderRadius: "50%",
            background: isSpeaking ? T.cyan : T.green,
            boxShadow: isSpeaking ? `0 0 6px ${T.cyan}` : `0 0 6px ${T.green}`,
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
      {/* Resize handles — all edges & corners */}
      {EDGES.map(({ e, style }) => (
        <div key={e} style={{ position:"absolute", zIndex:30, background:"transparent", ...style }}
          onMouseDown={ev => onResizeEdge(ev, e)}
          onTouchStart={ev => onResizeEdge(ev, e)}
        />
      ))}

      {/* ── Voice Settings Panel ──────────────────────────────────────────── */}
      {showVoices && (
        <div style={{
          background: T.bg, border: `1px solid ${T.faint}`,
          borderRadius: 6, padding: "10px 12px",
          flexShrink: 0, maxHeight: 330,
          overflowY: "auto", scrollbarWidth: "none",
          boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
        }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <div style={{ flex: 1, fontSize: 8, letterSpacing: "0.22em", color: T.greenDim, textTransform: "uppercase" }}>
              // VOICE_CONFIG
            </div>
            <button
              onClick={() => setShowVoices(false)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 14, color: T.dim, padding: "0 2px", lineHeight: 1,
                fontFamily: MONO, flexShrink: 0,
              }}
              title="Fechar"
            >×</button>
          </div>

          {/* Male / Female quick-select */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
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

          {/* Saved voices */}
          {voices.length === 0
            ? <div style={{ fontSize: 9, color: T.dim, marginBottom: 8 }}>nenhuma voz salva</div>
            : voices.map(v => (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                <div style={{ flex: 1, fontSize: 9, color: v.isSelected ? T.green : T.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {v.isSelected ? "▶ " : "  "}{v.name}
                </div>
                {v.isSelected
                  ? <span style={{ fontSize: 7, color: T.greenDim, letterSpacing: "0.1em" }}>ATIVA</span>
                  : <button onClick={() => selectVoice(v.id)} style={{ background: "none", border: `1px solid ${T.faint}`, cursor: "pointer", fontSize: 7, color: T.dim, borderRadius: 3, padding: "2px 6px", fontFamily: MONO }}>usar</button>
                }
                <button onClick={() => deleteVoice(v.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.dim, padding: "0 1px", lineHeight: 1, fontFamily: MONO }}>×</button>
              </div>
            ))
          }

          <div style={{ borderTop: `1px solid ${T.faint}`, margin: "8px 0" }} />

          {/* Add by Fish ID */}
          <div style={{ fontSize: 7, color: T.dim, marginBottom: 5, letterSpacing: "0.12em", textTransform: "uppercase" }}>+ fish.audio ID</div>
          {[{ val: newVoiceName, set: setNewVoiceName, ph: "nome" }, { val: newVoiceRef, set: setNewVoiceRef, ph: "reference_id" }].map(({ val, set, ph }) => (
            <input key={ph} value={val} onChange={e => set(e.target.value)} placeholder={ph} style={{
              width: "100%", background: "transparent", border: `1px solid ${T.faint}`,
              borderRadius: 3, padding: "4px 7px", fontSize: 9, color: T.white,
              outline: "none", marginBottom: 4, boxSizing: "border-box", fontFamily: MONO,
            }} />
          ))}
          <button onClick={addVoice} style={{
            background: "transparent", border: `1px solid ${T.greenFaint}`,
            borderRadius: 3, cursor: "pointer", fontSize: 8,
            color: T.greenDim, padding: "4px 0", width: "100%",
            fontFamily: MONO, letterSpacing: "0.10em", textTransform: "uppercase",
          }}>salvar</button>

          <div style={{ borderTop: `1px solid ${T.faint}`, margin: "8px 0" }} />

          {/* Clone voice */}
          <div style={{ fontSize: 7, color: T.dim, marginBottom: 5, letterSpacing: "0.12em", textTransform: "uppercase" }}>⦿ clonar voz (gravar)</div>
          <input value={cloneName} onChange={e => setCloneName(e.target.value)} placeholder="nome da voz clonada" style={{
            width: "100%", background: "transparent", border: `1px solid ${T.faint}`,
            borderRadius: 3, padding: "4px 7px", fontSize: 9, color: T.white,
            outline: "none", marginBottom: 5, boxSizing: "border-box", fontFamily: MONO,
          }} />
          <button onClick={toggleCloneRecording} disabled={isCloning} style={{
            background: cloneRecording ? "rgba(0,255,100,0.10)" : "transparent",
            border: `1px solid ${cloneRecording ? T.green : T.faint}`,
            borderRadius: 3, cursor: "pointer", fontSize: 8,
            color: cloneRecording ? T.green : T.dim, padding: "4px 0", width: "100%",
            fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", transition: "all 0.2s",
          }}>
            {cloneRecording ? "⏹ parar gravação" : "● gravar voz"}
          </button>
          {cloneStatus && (
            <div style={{ fontSize: 7.5, color: cloneStatus.startsWith("ERR") ? T.red : T.greenDim, marginTop: 5, letterSpacing: "0.05em", lineHeight: 1.4 }}>
              {cloneStatus}
            </div>
          )}
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

        {/* Header — drag handle */}
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
          {/* Window dots */}
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {["#ff5f57","#ffbd2e","#28c840"].map((c, i) => (
              <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />
            ))}
          </div>
          <div style={{ flex: 1, fontSize: 7.5, letterSpacing: "0.20em", color: T.greenDim, textTransform: "uppercase" }}>
            neural-orb ~ ai
          </div>
          {/* Status */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%", background: statusColor,
              boxShadow: (isRecording || isSpeaking) ? `0 0 7px ${statusColor}` : "none",
              display: "inline-block",
              animation: (isRecording || isSpeaking) ? "termPulse 1.1s ease-in-out infinite" : "none",
            }} />
            <span style={{ fontSize: 7, letterSpacing: "0.18em", color: statusColor }}>{statusText}</span>
          </div>
          {/* Minimize */}
          <button
            onClick={e => { e.stopPropagation(); setIsMinimized(true); }}
            onMouseDown={e => e.stopPropagation()}
            title="Minimizar"
            style={{
              background: "none", border: "1px solid transparent",
              borderRadius: 3, cursor: "pointer",
              padding: "2px 5px", color: T.dim,
              fontSize: 13, lineHeight: 1, transition: "all 0.2s", fontFamily: MONO,
            }}
          >−</button>
          {/* Settings */}
          <button
            onClick={e => { e.stopPropagation(); setShowVoices(v => !v); }}
            onMouseDown={e => e.stopPropagation()}
            style={{
              background: showVoices ? "rgba(0,255,100,0.10)" : "none",
              border: showVoices ? `1px solid ${T.greenFaint}` : "1px solid transparent",
              borderRadius: 3, cursor: "pointer",
              padding: "2px 5px", color: showVoices ? T.green : T.dim,
              fontSize: 11, lineHeight: 1, transition: "all 0.2s", fontFamily: MONO,
            }}
          >⚙</button>
        </div>

        {/* Active voice indicator */}
        {selectedVoice && (
          <div style={{ padding: "3px 10px", fontSize: 7, color: T.dim, borderBottom: `1px solid ${T.faint}`, letterSpacing: "0.10em", flexShrink: 0 }}>
            VOICE: {selectedVoice.name}
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative", minHeight: 0 }}>
          <div className="orb-scroll" style={{ height: "100%", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "rgba(0,255,100,0.18) transparent", padding: "6px 0 4px" }}>

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
                    <span style={{ color: T.green, fontSize: 10, flexShrink: 0, marginTop: 1 }}>›</span>
                    <span style={{ fontSize: 10, lineHeight: 1.55, color: T.green, letterSpacing: "0.02em", wordBreak: "break-word", userSelect: "text" }}>
                      {msg.content}
                    </span>
                  </div>
                ) : (
                  <div>
                    <span style={{ color: T.cyanDim, fontSize: 8, letterSpacing: "0.10em" }}>ORB </span>
                    <span style={{ color: T.dim, fontSize: 8 }}>~</span>
                    <span style={{ fontSize: 10, lineHeight: 1.6, color: T.white, letterSpacing: "0.01em", wordBreak: "break-word", marginLeft: 4, userSelect: "text" }}>
                      {msg.content}
                      {msg.streaming && <span style={{ opacity: 0.6, marginLeft: 2, color: T.cyan, animation: "termBlink 1s step-end infinite" }}>▌</span>}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {isLoading && !messages.some(m => m.streaming) && (
              <div style={{ padding: "2px 10px", display: "flex", gap: 3, alignItems: "center" }}>
                <span style={{ color: T.cyanDim, fontSize: 8 }}>ORB ~ </span>
                {[0,1,2].map(i => (
                  <span key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: T.cyan, opacity: 0.65, display: "inline-block", animation: `termDot 1.2s ease-in-out ${i*0.18}s infinite` }} />
                ))}
              </div>
            )}

            {isRecording && (
              <div style={{ padding: "2px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, animation: "termPulse 0.9s ease-in-out infinite", display: "inline-block", boxShadow: `0 0 8px ${T.green}` }} />
                <span style={{ fontSize: 8, color: T.greenDim, letterSpacing: "0.14em" }}>OUVINDO... (nível médio/alto)</span>
              </div>
            )}

            {isSpeaking && !isRecording && (
              <div style={{ padding: "2px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.cyan, animation: "termPulse 0.7s ease-in-out infinite", display: "inline-block", boxShadow: `0 0 8px ${T.cyan}` }} />
                <span style={{ fontSize: 8, color: T.cyanDim, letterSpacing: "0.14em" }}>ORB FALANDO...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── Input row ──────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 8px",
          borderTop: `1px solid ${T.faint}`,
          background: "rgba(0,255,100,0.02)",
          flexShrink: 0,
        }}>
          <span style={{ color: T.greenDim, fontSize: 12, flexShrink: 0 }}>$</span>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }}
            onMouseDown={e => e.stopPropagation()}
            placeholder={isRecording ? "ouvindo..." : conversationId ? "comando..." : "conectando..."}
            disabled={isLoading || isRecording}
            style={inputStyle}
          />

          {/* Mic button — bright */}
          <button
            onClick={toggleRecording}
            title={isRecording ? "Parar" : "Falar"}
            disabled={isLoading && !isRecording}
            onMouseDown={e => e.stopPropagation()}
            style={iconBtn(isRecording, "0,255,100")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill={isRecording ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>

          {/* Send button — bright */}
          <button
            onClick={sendText}
            disabled={!input.trim() || isLoading}
            onMouseDown={e => e.stopPropagation()}
            style={{
              ...iconBtn(!!input.trim() && !isLoading, "74,240,255"),
              opacity: (!input.trim() || isLoading) ? 0.45 : 1,
              padding: "5px 10px",
              fontSize: 14,
              fontFamily: MONO,
            }}
          >
            ↵
          </button>
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
        .orb-scroll::-webkit-scrollbar { width: 3px; }
        .orb-scroll::-webkit-scrollbar-track { background: transparent; }
        .orb-scroll::-webkit-scrollbar-thumb { background: rgba(0,255,100,0.20); border-radius: 2px; }
        .orb-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,255,100,0.38); }
      `}</style>
    </div>
  );
}
