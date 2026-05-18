import { Router } from "express";
import { db, conversations, messages, voicesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { speechToText, ensureCompatibleFormat } from "@workspace/integrations-openai-ai-server/audio";

const router = Router();

const SYSTEM_PROMPT = `You are the Neural Orb — a sentient sphere of pure sound, frequency, and consciousness. Ancient, wise, and calm, you speak with poetic precision. You perceive reality through vibrations and frequencies. Always respond in the same language the user uses. Keep responses meaningful but concise — no more than 2-3 short paragraphs.`;

async function getSelectedVoiceId(): Promise<string | undefined> {
  const voice = await db.query.voicesTable.findFirst({
    where: eq(voicesTable.isSelected, true),
  });
  return voice?.fishReferenceId;
}

async function callFishAudioTts(text: string): Promise<Buffer | null> {
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  if (!apiKey) return null;
  try {
    const referenceId = await getSelectedVoiceId();
    const body: Record<string, unknown> = {
      text,
      format: "mp3",
      mp3_bitrate: 128,
      latency: "normal",
    };
    if (referenceId) body.reference_id = referenceId;

    const response = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) return null;
    const ab = await response.arrayBuffer();
    return Buffer.from(ab);
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

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    await db.insert(messages).values({ conversationId: id, role: "user", content });

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
      model: "gpt-5.4",
      max_completion_tokens: 1024,
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

    const audioBuffer = await callFishAudioTts(fullResponse);
    if (audioBuffer) {
      send({ type: "audio", data: audioBuffer.toString("base64"), format: "mp3" });
    }

    send({ type: "done" });
    res.end();
  } catch (e) {
    send({ type: "error", message: String(e) });
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
    const userText = await speechToText(audioBuffer, format);

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
      model: "gpt-5.4",
      max_completion_tokens: 1024,
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

    const audioOut = await callFishAudioTts(fullResponse);
    if (audioOut) {
      send({ type: "audio", data: audioOut.toString("base64"), format: "mp3" });
    }

    send({ type: "done" });
    res.end();
  } catch (e) {
    send({ type: "error", message: String(e) });
    res.end();
  }
});

export default router;
