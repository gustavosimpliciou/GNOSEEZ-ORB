import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import fishRouter from "./fish";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/openai", chatRouter);
router.use("/fish", fishRouter);

export default router;
