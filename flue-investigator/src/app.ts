import { flue } from "@flue/runtime/routing";
import { Hono, type MiddlewareHandler } from "hono";

export interface Env {
  AI: Ai;
  CLAWPTCHA_FLUE_SECRET?: string;
  CLAWPTCHA_FLUE_MODEL?: string;
}

type AppBindings = { Bindings: Env };

const requireSecret: MiddlewareHandler<AppBindings> = async (c, next) => {
  const secret = c.env.CLAWPTCHA_FLUE_SECRET?.trim();
  if (!secret) return c.json({ error: "flue investigator is not configured" }, 503);
  const header = c.req.header("authorization") ?? "";
  if (header !== `Bearer ${secret}`) return c.json({ error: "unauthorized" }, 401);
  await next();
};

const app = new Hono<AppBindings>();
const flueApp = flue();

app.get("/health", (c) => c.json({ ok: true, service: "clawptcha-flue-investigator" }));
app.use("/workflows/*", requireSecret);
app.use("/runs/*", requireSecret);
app.route("/", flueApp);

export default app;
