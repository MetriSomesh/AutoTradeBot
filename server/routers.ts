import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { localAuthRouter } from "./routers/local-auth";
import { tradingRouter } from "./routers/trading";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: localAuthRouter,

  trading: tradingRouter,
});

export type AppRouter = typeof appRouter;
