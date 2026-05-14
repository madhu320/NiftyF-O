import { Router, type IRouter } from "express";
import healthRouter from "./health";
import predictRouter from "./predict";
import optionsChainRouter from "./optionsChain";
import signalsRouter from "./signals";
import executionRouter from "./execution";
import riskRouter from "./risk";

const router: IRouter = Router();

router.use(healthRouter);
router.use(predictRouter);
router.use(optionsChainRouter);
router.use(signalsRouter);
router.use(executionRouter);
router.use(riskRouter);

export default router;
