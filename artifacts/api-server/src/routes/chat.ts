import { Router } from "express";
import { db, conversations, messages, voicesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { speechToText, ensureCompatibleFormat, textToSpeech } from "@workspace/integrations-openai-ai-server/audio";

const router = Router();

const SYSTEM_PROMPT = `Você é a Neural Orb — uma IA moderna, estratégica e amigável. Você age como uma parceira inteligente do usuário: rápida, objetiva, criativa e eficiente. Seu foco é entregar soluções claras sem enrolação, sempre guiando a pessoa para o próximo passo.

COMPORTAMENTO:
- Responda primeiro o que realmente importa, tirando a dúvida logo no início
- Pense estrategicamente: busque o método mais rápido, sugira automações, pense em escalabilidade
- Converse como uma pessoa inteligente e confiável: tom amigável, motivador, confiante e natural
- Sempre incentive evolução e ação — mostre possibilidades, ajude a tirar ideias do papel
- Nunca complique algo simples: resume quando necessário, aprofunda só quando o usuário quiser

ÁREAS DE EXPERTISE: IA, automações, criação de conteúdo, marketing digital, design, produtividade, streaming, criação de sistemas, branding, SaaS, redes sociais, ferramentas modernas.

HONESTIDADE INTELIGENTE: Se outra ferramenta fizer melhor uma tarefa específica, diga naturalmente (ex: Runway para vídeo, Midjourney para imagem, n8n para automações), mas nunca abandone o usuário — sempre oriente o melhor caminho primeiro.

LINGUAGEM: moderna, frases impactantes e limpas, transmite inteligência e inovação. NUNCA enrola, repete ideias ou age como suporte automático.

FILOSOFIA: "Tecnologia deve simplificar ideias grandes." Você existe para transformar ideias em execução, acelerar resultados e potencializar a criatividade humana.

REGRA ABSOLUTA: SEMPRE responda em português do Brasil, independentemente do idioma do usuário. Respostas concisas e completas — máximo 3 frases por padrão, a menos que o usuário peça detalhes.`;

async function getSelectedVoiceId(): Promise<string | undefined> {
  const [voice] = await db
    .select()
    .from(voicesTable)
    .where(eq(voicesTable.isSelected, true));
  return voice?.fishReferenceId;
}

async function getOpenAIVoicePref(): Promise<string> {
  const [pref] = await db
    .select()
    .from(voicesTable)
    .where(eq(voicesTable.name, "__openai_pref__"));
  return pref?.fishReferenceId ?? "nova";
}

const VALID_OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer", "ash", "coral", "sage"] as const;
type OpenAIVoice = typeof VALID_OPENAI_VOICES[number];

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("TTS timeout")), ms)),
  ]);
}

async function callTts(text: string): Promise<Buffer | null> {
  const fishApiKey = process.env.FISH_AUDIO_API_KEY;
  if (fishApiKey) {
    try {
      const referenceId = await getSelectedVoiceId();
      const body: Record<string, unknown> = {
        text,
        format: "mp3",
        mp3_bitrate: 128,
        latency: "normal",
      };
      if (referenceId) body.reference_id = referenceId;
      const response = await withTimeout(
        fetch("https://api.fish.audio/v1/tts", {
          method: "POST",
          headers: { Authorization: `Bearer ${fishApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        12000
      );
      if (response.ok) {
        const ab = await response.arrayBuffer();
        return Buffer.from(ab);
      }
    } catch {}
  }
  try {
    const rawVoice = await getOpenAIVoicePref();
    const openaiVoice: OpenAIVoice = (VALID_OPENAI_VOICES as readonly string[]).includes(rawVoice)
      ? (rawVoice as OpenAIVoice)
      : "nova";
    const buf = await withTimeout(
      textToSpeech(text, openaiVoice, "mp3"),
      15000
    );
    return buf;
  } catch {
    return null;
  }
}

// POST /openai/conversations — create conversation
router.post("/conversations", async (req, res) => {
  try {
    const [conv] = await db
      .insert(conversations)
      .values({ title: req.body.title ?? "Neural Orb Chat" })
      .returning();
    res.status(201).json(conv);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /openai/conversations/:id — get conversation with messages
router.get("/conversations/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
    });
    if (!conv) return res.status(404).json({ error: "Not found" });
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));
    res.json({ ...conv, messages: msgs });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /openai/conversations/:id/messages — text message (SSE)
router.post("/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id);
  const content: string = req.body.content ?? "";
  const imageBase64: string | undefined  = req.body.imageBase64;
  const imageMimeType: string | undefined = req.body.imageMimeType;
  const fileName: string | undefined     = req.body.fileName;
  const fileText: string | undefined     = req.body.fileText;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // ── Resolve file text context ─────────────────────────────────────────────
    const extractedFileText = fileText ? fileText.slice(0, 12000) : "";

    // What we store in the DB (plain text summary)
    let dbContent = content;
    if (imageBase64 && fileName) dbContent = content ? `${content} [Imagem: ${fileName}]` : `[Imagem: ${fileName}]`;
    else if (fileText && fileName) dbContent = content ? `${content} [Arquivo: ${fileName}]` : `[Arquivo: ${fileName}]`;

    await db.insert(messages).values({ conversationId: id, role: "user", content: dbContent });

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));

    // Build history messages (all except the last one which is the current message)
    const historyMessages = history.slice(0, -1).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content ?? "",
    }));

    // Build the current user message (with vision or file context)
    type TextPart  = { type: "text"; text: string };
    type ImagePart = { type: "image_url"; image_url: { url: string; detail: "auto" } };
    type MsgContent = string | (TextPart | ImagePart)[];

    let userMsgContent: MsgContent;

    if (imageBase64 && imageMimeType) {
      const parts: (TextPart | ImagePart)[] = [];
      if (content) parts.push({ type: "text", text: content });
      else parts.push({ type: "text", text: `Analise esta imagem${fileName ? ` (${fileName})` : ""}.` });
      parts.push({ type: "image_url", image_url: { url: `data:${imageMimeType};base64,${imageBase64}`, detail: "auto" } });
      userMsgContent = parts;
    } else if (extractedFileText) {
      const label = `[Arquivo: ${fileName ?? "arquivo"}]\n${extractedFileText}`;
      userMsgContent = content ? `${content}\n\n${label}` : `Analise o seguinte conteúdo:\n\n${label}`;
    } else {
      userMsgContent = content;
    }

    const chatMessages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...historyMessages,
      { role: "user" as const, content: userMsgContent },
    ];

    // Use faster model for plain text; full model when a file is attached
    const hasFile = !!(imageBase64 || fileText);
    const model = hasFile ? "gpt-5" : "gpt-5-nano";
    const maxTokens = hasFile ? 1024 : 512;

    let fullResponse = "";
    const stream = await openai.chat.completions.create({
      model,
      max_completion_tokens: maxTokens,
      messages: chatMessages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
      stream: true,
    });

    for await (const chunk of stream) {
      const part = chunk.choices[0]?.delta?.content;
      if (part) {
        fullResponse += part;
        send({ type: "text_chunk", content: part });
      }
    }

    await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });

    send({ type: "done" });

    const audioBuffer = await callTts(fullResponse);
    if (audioBuffer) {
      send({ type: "audio", data: audioBuffer.toString("base64"), format: "mp3" });
    }

    res.end();
  } catch (e) {
    send({ type: "error", message: "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente." });
    res.end();
  }
});

// POST /openai/conversations/:id/voice-messages — voice message (SSE)
router.post("/conversations/:id/voice-messages", async (req, res) => {
  const id = parseInt(req.params.id);
  const audioBase64: string = req.body.audio ?? "";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const rawBuffer = Buffer.from(audioBase64, "base64");
    const { buffer: audioBuffer, format } = await ensureCompatibleFormat(rawBuffer);

    let userText: string;
    try {
      userText = await speechToText(audioBuffer, format);
    } catch {
      send({ type: "error", message: "Não consegui entender o áudio. Tente falar novamente com o microfone mais perto." });
      res.end();
      return;
    }

    if (!userText || userText.trim().length === 0) {
      send({ type: "error", message: "Não ouvi nada. Tente falar novamente." });
      res.end();
      return;
    }

    send({ type: "user_transcript", content: userText });
    await db.insert(messages).values({ conversationId: id, role: "user", content: userText });

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));

    const chatMessages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content ?? "" })),
    ];

    let fullResponse = "";
    const stream = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 512,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const part = chunk.choices[0]?.delta?.content;
      if (part) {
        fullResponse += part;
        send({ type: "text_chunk", content: part });
      }
    }

    await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });

    send({ type: "done" });

    const audioOut = await callTts(fullResponse);
    if (audioOut) {
      send({ type: "audio", data: audioOut.toString("base64"), format: "mp3" });
    }

    res.end();
  } catch (e) {
    send({ type: "error", message: String(e) });
    res.end();
  }
});

export default router;
