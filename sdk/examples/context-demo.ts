import { storage } from "../src/context";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function inner() {
  await sleep(50);
  console.log("inner sees:", storage.getStore());
}

async function main() {
  console.log("outside sees:", storage.getStore());
  await storage.run({ traceId: "t_demo", spanId: "s_parent" }, async () => {
    await sleep(50);
    await inner();
  });
  console.log("after sees:", storage.getStore());
}

main();