import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getGameStatus } from "../services/game.js";

export const gameRouter = Router();
gameRouter.use(requireAuth);

gameRouter.get("/status", async (_req, res, next) => {
  try {
    res.json(await getGameStatus());
  } catch (err) {
    next(err);
  }
});
