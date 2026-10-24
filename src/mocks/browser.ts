import { setupWorker } from "msw/browser";
import { handlers, saveMockState } from "./handlers";

export const worker = setupWorker(...handlers);
worker.events.on("response:mocked", () => saveMockState());
