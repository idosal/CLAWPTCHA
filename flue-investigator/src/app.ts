import { flue } from "@flue/runtime/routing";
import { Hono } from "hono";

export interface Env {
  AI: Ai;
  VOUCHA_FLUE_MODEL?: string;
}

type AppBindings = { Bindings: Env };

const app = new Hono<AppBindings>();
const flueApp = flue();

app.get("/health", (c) => c.json({ ok: true, service: "voucha-flue-investigator" }));
app.route("/", flueApp);

export default app;
