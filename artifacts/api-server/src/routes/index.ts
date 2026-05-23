import { Router, type IRouter } from "express";
import healthRouter from "./health";
import predictRouter from "./predict";
import optionsChainRouter from "./optionsChain";
import signalsRouter from "./signals";
import executionRouter from "./execution";
import riskRouter from "./risk";
import { marketStream } from "../lib/marketDataStream";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Initialize live market data WebSocket stream
marketStream.connect().then(() => {
  marketStream.subscribe(['BANKNIFTY', 'NIFTY']);
}).catch(err => logger.error({ err }, "Failed to start market data stream"));

router.use(healthRouter);
router.use(predictRouter);
router.use(optionsChainRouter);
router.use(signalsRouter);
router.use(executionRouter);
router.use(riskRouter);

export default router;
