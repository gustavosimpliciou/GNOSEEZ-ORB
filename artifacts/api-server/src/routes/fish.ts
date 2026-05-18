import { Router } from "express";
import { db, voicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

export default router;
