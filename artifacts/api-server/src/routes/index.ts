import { Router, type IRouter } from "express";
import healthRouter from "./health";
import predictRouter from "./predict";
import optionsChainRouter from "./optionsChain";

const router: IRouter = Router();

router.use(healthRouter);
router.use(predictRouter);
router.use(optionsChainRouter);

export default router;
