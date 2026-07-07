import { readFile, writeFile } from "node:fs/promises";

const outputPath = new URL("../dist/flue_investigator/wrangler.json", import.meta.url);
const raw = JSON.parse(await readFile(outputPath, "utf8"));

raw.name = "clawptcha-flue-investigator";
raw.ai = { binding: "AI" };
raw.exports = {
  FlueInvestigatePrWorkflow: {
    type: "durable-object",
    storage: "sqlite",
  },
  FlueRegistry: {
    type: "durable-object",
    storage: "sqlite",
  },
};

await writeFile(outputPath, `${JSON.stringify(raw, null, 2)}\n`);
