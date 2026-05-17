import express, { type Express, type RequestHandler } from "express";
import cors from "cors";
import pinoHttp, { type Options as PinoHttpOptions } from "pino-http";
import type { IncomingMessage, ServerResponse } from "http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const pinoOpts: PinoHttpOptions = {
  logger,
  serializers: {
    req(req: IncomingMessage & { id?: string }) {
      return {
        id: req.id,
        method: req.method,
        url: req.url?.split("?")[0],
      };
    },
    res(res: ServerResponse) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
};

app.use(
  (pinoHttp as unknown as (opts: PinoHttpOptions) => RequestHandler)(pinoOpts),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
