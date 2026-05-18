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
  onAiSpeaking: (v: boolean) => void;
  recordingRef: MutableRefObject<boolean>;
};

const FONT = "'Space Grotesk','Inter',system-ui,sans-serif";
const MONO = "'JetBrains Mono','SF Mono','Fira Code',monospace";

export default function AiChat({
  isDark,
  accent,
  isMobile,
  aiAnalyserRef,
  onAiSpeaking,
  recordingRef,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showVoices, setShowVoices] = useState(false);
  const [voices, setVoices] = useState<VoiceEntry[]>([]);
  const [newVoiceName, setNewVoiceName] = useState("");
  const [newVoiceRef, setNewVoiceRef] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [cr, cg, cb] = accent;
  const acc = `rgb(${cr},${cg},${cb})`;
  const accA = (a: number) => `rgba(${cr},${cg},${cb},${a})`;

  // Theme tokens
  const fg      = isDark ? "rgba(230,236,245,0.88)" : "rgba(14,20,36,0.82)";
  const fg50    = isDark ? "rgba(200,210,228,0.50)" : "rgba(14,20,36,0.45)";
  const fg20    = isDark ? "rgba(200,210,228,0.18)" : "rgba(14,20,36,0.14)";
  const fg08    = isDark ? "rgba(255,255,255,0.07)"  : "rgba(0,0,0,0.06)";

  // Glass container — no border, opaque blurred edges
  const glass: CSSProperties = {
    background:      isDark ? "rgba(6,10,18,0.46)" : "rgba(245,248,255,0.52)",
    backdropFilter:  "blur(26px) saturate(150%)",
    WebkitBackdropFilter: "blur(26px) saturate(150%)",
    border:          "none",
    borderRadius:    14,
    boxShadow:       isDark
      ? "0 4px 28px rgba(0,0,0,0.38)"
      : "0 4px 28px rgba(0,0,0,0.07)",
  };

  // Input pill
  const pill: CSSProperties = {
    display:         "flex",
    alignItems:      "center",
    gap:             6,
    background:      isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.042)",
    border:          isDark
      ? "1px solid rgba(255,255,255,0.10)"
      : "1px solid rgba(0,0,0,0.09)",
    borderRadius:    50,
    padding:         "7px 8px 7px 14px",
  };

  // Fade gradient colors (match background)
  const fadeFrom = isDark ? "rgba(6,10,18,1)" : "rgba(245,248,255,1)";

  // Panel position
  const panelStyle: CSSProperties = isMobile
    ? {
        position:  "absolute",
        left:      12,
        right:     12,
        bottom:    68,
        height:    "min(34vh, 270px)",
      }
    : {
        position:  "absolute",
        right:     20,
        top:       272,
        bottom:    88,
        width:     210,
      };

  // ── Init conversation ─────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/openai/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Neural Orb Chat" }),
    })
      .then((r) => r.json())
      .then((c) => setConversationId(c.id))
      .catch(console.error);
  }, []);

  const loadVoices = useCallback(() => {
    fetch("/api/fish/voices")
      .then((r) => r.json())
      .then(setVoices)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (showVoices) loadVoices();
  }, [showVoices, loadVoices]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── AI audio playback ─────────────────────────────────────────────────────
  const playAiAudio = useCallback(
    async (base64: string) => {
      try {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
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
        onAiSpeaking(true);
        source.onended = () => {
          aiAnalyserRef.current = null;
          onAiSpeaking(false);
        };
        source.start();
      } catch (e) {
        console.error("Audio playback:", e);
      }
    },
    [aiAnalyserRef, onAiSpeaking]
  );

  // ── SSE stream parser ─────────────────────────────────────────────────────
  const processStream = useCallback(
    async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
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
              setMessages((p) => [
                ...p,
                { id: crypto.randomUUID(), role: "user", content: ev.content },
              ]);
            } else if (ev.type === "text_chunk") {
              setMessages((p) => {
                const last = p[p.length - 1];
                if (last?.role === "assistant" && last.streaming)
                  return [...p.slice(0, -1), { ...last, content: last.content + ev.content }];
                return [...p, { id: crypto.randomUUID(), role: "assistant", content: ev.content, streaming: true }];
              });
            } else if (ev.type === "audio" && ev.data) {
              await playAiAudio(ev.data);
            } else if (ev.type === "done") {
              setMessages((p) => {
                const last = p[p.length - 1];
                return last?.streaming ? [...p.slice(0, -1), { ...last, streaming: false }] : p;
              });
            }
          } catch {}
        }
      }
    },
    [playAiAudio]
  );

  // ── Send text ─────────────────────────────────────────────────────────────
  const sendText = useCallback(async () => {
    if (!input.trim() || !conversationId || isLoading) return;
    const content = input.trim();
    setInput("");
    setIsLoading(true);
    setMessages((p) => [...p, { id: crypto.randomUUID(), role: "user", content }]);
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

  // ── Voice recording ───────────────────────────────────────────────────────
  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const PREFERRED = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
      const mimeType  = PREFERRED.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
      let recorder: MediaRecorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      const effectiveMime = recorder.mimeType || mimeType || 'audio/webm';
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        recordingRef.current = false;
        setIsRecording(false);
        if (!conversationId || chunksRef.current.length === 0) return;
        try {
          const blob = new Blob(chunksRef.current, { type: effectiveMime });
          const ab = await blob.arrayBuffer();
          const bytes = new Uint8Array(ab);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          const b64 = btoa(binary);
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
  }, [isRecording, conversationId, processStream, recordingRef]);

  // ── Voice management ──────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        ...panelStyle,
        zIndex: 20,
        pointerEvents: "auto",
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* Voice settings popover */}
      {showVoices && (
        <div style={{ ...glass, padding: "12px 14px", flexShrink: 0 }}>
          <div style={{ fontSize: 8, letterSpacing: "0.18em", color: fg50, fontFamily: MONO, marginBottom: 10, textTransform: "uppercase" }}>
            CLONED VOICES
          </div>
          {voices.length === 0 && (
            <div style={{ fontSize: 10, color: fg50, marginBottom: 8, fontFamily: FONT }}>Nenhuma voz salva</div>
          )}
          {voices.map((v) => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
              <div style={{ flex: 1, fontSize: 11, color: v.isSelected ? acc : fg, fontFamily: FONT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {v.name}
              </div>
              {v.isSelected ? (
                <div style={{ fontSize: 7, color: accA(0.65), fontFamily: MONO, letterSpacing: "0.12em" }}>ATIVA</div>
              ) : (
                <button onClick={() => selectVoice(v.id)} style={{ background: "none", border: `1px solid ${fg20}`, cursor: "pointer", fontSize: 8, color: fg50, borderRadius: 4, padding: "2px 7px", fontFamily: FONT }}>
                  usar
                </button>
              )}
              <button onClick={() => deleteVoice(v.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: fg50, padding: "0 2px", lineHeight: 1 }}>×</button>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${fg08}`, paddingTop: 10, marginTop: 6 }}>
            <div style={{ fontSize: 8, color: fg50, marginBottom: 6, fontFamily: MONO, letterSpacing: "0.12em", textTransform: "uppercase" }}>Adicionar</div>
            {[
              { val: newVoiceName, set: setNewVoiceName, ph: "Nome da voz" },
              { val: newVoiceRef, set: setNewVoiceRef, ph: "Reference ID (fish.audio)" },
            ].map(({ val, set, ph }) => (
              <input
                key={ph}
                value={val}
                onChange={(e) => set(e.target.value)}
                placeholder={ph}
                style={{
                  width: "100%", background: "transparent",
                  border: `1px solid ${fg08}`, borderRadius: 6,
                  padding: "4px 8px", fontSize: 10, color: fg,
                  outline: "none", marginBottom: 5,
                  boxSizing: "border-box", fontFamily: FONT,
                  placeholderColor: fg50,
                }}
              />
            ))}
            <button
              onClick={addVoice}
              style={{
                background: accA(0.1), border: `1px solid ${accA(0.25)}`,
                borderRadius: 6, cursor: "pointer", fontSize: 9,
                color: acc, padding: "5px 0", width: "100%",
                fontFamily: MONO, letterSpacing: "0.10em", textTransform: "uppercase",
              }}
            >
              Salvar Voz
            </button>
          </div>
        </div>
      )}

      {/* Main chat glass panel */}
      <div style={{ ...glass, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "10px 11px 8px" }}>

        {/* Gear + label row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexShrink: 0 }}>
          <div style={{ fontSize: 7.5, letterSpacing: "0.20em", color: accA(0.55), fontFamily: MONO, textTransform: "uppercase", fontWeight: 500 }}>
            NEURAL ORB AI
          </div>
          <button
            onClick={() => setShowVoices((v) => !v)}
            title="Vozes clonadas"
            style={{
              background: showVoices ? accA(0.12) : "none",
              border:     showVoices ? `1px solid ${accA(0.25)}` : "none",
              borderRadius: 6, cursor: "pointer",
              padding: "2px 5px", color: showVoices ? acc : fg50,
              fontSize: 11, lineHeight: 1, transition: "all 0.2s",
            }}
          >
            ⚙
          </button>
        </div>

        {/* Messages area with top fade */}
        <div ref={messagesContainerRef} style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {/* Top fade mask */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 64,
            background: `linear-gradient(to bottom, ${fadeFrom} 0%, transparent 100%)`,
            zIndex: 2, pointerEvents: "none",
            opacity: messages.length > 2 ? 1 : 0,
            transition: "opacity 0.6s",
          }} />

          {/* Scroll container */}
          <div style={{ height: "100%", overflowY: "auto", scrollbarWidth: "none", paddingTop: 8 }}>
            {messages.length === 0 && !isLoading && (
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                textAlign: "center", color: fg50, fontSize: 10.5,
                letterSpacing: "0.04em", lineHeight: 1.75, fontFamily: FONT, fontWeight: 300,
                paddingBottom: 4,
              }}>
                Fale ou escreva algo
                <br />ao Neural Orb
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} style={{
                marginBottom: 8,
                display: "flex",
                flexDirection: "column",
                alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              }}>
                {msg.role === "user" ? (
                  <div style={{
                    fontSize: 10,
                    lineHeight: 1.55,
                    color: accA(0.80),
                    fontFamily: MONO,
                    fontWeight: 400,
                    letterSpacing: "0.02em",
                    textAlign: "right",
                    maxWidth: "90%",
                    background: accA(0.07),
                    border: `1px solid ${accA(0.14)}`,
                    borderRadius: "10px 10px 2px 10px",
                    padding: "5px 9px",
                  }}>
                    {msg.content}
                  </div>
                ) : (
                  <div style={{
                    fontSize: 11.5,
                    lineHeight: 1.65,
                    color: fg,
                    fontFamily: FONT,
                    fontWeight: 300,
                    letterSpacing: "0.01em",
                    maxWidth: "96%",
                  }}>
                    {msg.content}
                    {msg.streaming && (
                      <span style={{ opacity: 0.4, marginLeft: 2, fontFamily: MONO }}>▋</span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Loading dots */}
            {isLoading && !messages.some((m) => m.streaming) && (
              <div style={{ display: "flex", gap: 4, paddingLeft: 2, marginBottom: 8 }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{
                    width: 4, height: 4, borderRadius: "50%",
                    background: accA(0.45),
                    display: "inline-block",
                    animation: `aiDot 1.2s ease-in-out ${i * 0.18}s infinite`,
                  }} />
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Listening indicator */}
        {isRecording && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            paddingBottom: 6, paddingTop: 2, flexShrink: 0,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: acc, animation: "aiPulse 1.1s ease-in-out infinite", display: "inline-block" }} />
            <span style={{ fontSize: 9, color: accA(0.65), fontFamily: MONO, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Ouvindo...
            </span>
          </div>
        )}

        {/* ── Input pill ──────────────────────────────────────────────────── */}
        <div style={{ ...pill, flexShrink: 0, marginTop: 6 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
            }}
            placeholder={isRecording ? "" : "Pergunte ao orb..."}
            disabled={isLoading || !conversationId || isRecording}
            style={{
              flex: 1,
              background: "transparent",
              border: "none", outline: "none",
              fontSize: 11, color: fg,
              letterSpacing: "0.02em",
              fontFamily: FONT, fontWeight: 400,
            }}
          />

          {/* Mic button */}
          <button
            onClick={toggleRecording}
            title={isRecording ? "Parar" : "Falar"}
            disabled={isLoading && !isRecording}
            style={{
              background: isRecording ? accA(0.18) : "none",
              border:     isRecording ? `1px solid ${accA(0.35)}` : "none",
              borderRadius: 8,
              cursor: "pointer",
              padding: "5px 7px",
              color: isRecording ? acc : fg50,
              transition: "all 0.2s",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill={isRecording ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>

          {/* Send button */}
          <button
            onClick={sendText}
            disabled={!input.trim() || isLoading || !conversationId}
            style={{
              background: input.trim() ? accA(0.14) : "transparent",
              border: `1px solid ${input.trim() ? accA(0.30) : fg08}`,
              borderRadius: 8,
              cursor: input.trim() ? "pointer" : "default",
              padding: "5px 10px",
              color: input.trim() ? acc : fg50,
              fontSize: 13, lineHeight: 1,
              transition: "all 0.2s",
              fontFamily: MONO,
              flexShrink: 0,
            }}
          >
            →
          </button>
        </div>
      </div>

      <style>{`
        @keyframes aiDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40% { transform: scale(1.0); opacity: 1; }
        }
        @keyframes aiPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}
