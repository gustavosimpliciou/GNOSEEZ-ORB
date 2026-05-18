import { Router } from "express";
import { db, voicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { convertToWav } from "@workspace/integrations-openai-ai-server/audio";

const router = Router();

// GET /fish/voices — list all voices
router.get("/voices", async (_req, res) => {
  try {
    const voices = await db.select().from(voicesTable).orderBy(voicesTable.createdAt);
    res.json(voices);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /fish/voices — add a voice by reference ID
router.post("/voices", async (req, res) => {
  try {
    const { name, fishReferenceId } = req.body;
    if (!name || !fishReferenceId) {
      return res.status(400).json({ error: "name and fishReferenceId required" });
    }
    const [voice] = await db
      .insert(voicesTable)
      .values({ name, fishReferenceId, isSelected: false })
      .returning();
    res.status(201).json(voice);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /fish/voices/clone — clone a voice from audio recording
router.post("/voices/clone", async (req, res) => {
  try {
    const { name, audio, mimeType } = req.body;
    if (!name || !audio) {
      return res.status(400).json({ error: "name and audio required" });
    }

    const apiKey = process.env.FISH_AUDIO_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: "FISH_AUDIO_API_KEY not configured" });
    }

    const rawBuffer = Buffer.from(audio, "base64");

    let wavBuffer: Buffer;
    try {
      wavBuffer = await convertToWav(rawBuffer);
    } catch {
      wavBuffer = rawBuffer;
    }

    const formData = new FormData();
    formData.append("title", name);
    formData.append("train_mode", "fast");
    formData.append("visibility", "private");

    const blob = new Blob([wavBuffer], { type: "audio/wav" });
    formData.append("voices", blob, "voice.wav");

    const response = await fetch("https://api.fish.audio/v1/model", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `Fish Audio: ${errText}` });
    }

    const model = await response.json() as { _id?: string };
    const referenceId = model._id;
    if (!referenceId) {
      return res.status(502).json({ error: "Fish Audio did not return model ID" });
    }

    const [voice] = await db
      .insert(voicesTable)
      .values({ name, fishReferenceId: referenceId, isSelected: false })
      .returning();

    res.status(201).json(voice);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /fish/voices/:id/select — set as active voice
router.post("/voices/:id/select", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(voicesTable).set({ isSelected: false });
    const [voice] = await db
      .update(voicesTable)
      .set({ isSelected: true })
      .where(eq(voicesTable.id, id))
      .returning();
    if (!voice) return res.status(404).json({ error: "Not found" });
    res.json(voice);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /fish/voices/:id — delete a voice
router.delete("/voices/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(voicesTable).where(eq(voicesTable.id, id));
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /fish/voice-preference — set OpenAI voice for male/female fallback
router.post("/voice-preference", async (req, res) => {
  try {
    const { gender } = req.body as { gender: "male" | "female" };
    const openaiVoice = gender === "male" ? "onyx" : "nova";
    await db.delete(voicesTable).where(eq(voicesTable.name, "__openai_pref__"));
    await db.insert(voicesTable).values({ name: "__openai_pref__", fishReferenceId: openaiVoice, isSelected: false });
    res.json({ voice: openaiVoice });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /fish/voice-preference — get current OpenAI voice preference
router.get("/voice-preference", async (_req, res) => {
  try {
    const [pref] = await db.select().from(voicesTable).where(eq(voicesTable.name, "__openai_pref__"));
    res.json({ voice: pref?.fishReferenceId ?? "nova" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
