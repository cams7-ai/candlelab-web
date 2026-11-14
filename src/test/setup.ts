import { File } from "node:buffer";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";
import { handlers, resetStore } from "../mocks/handlers";
// Undici captures File during import; select the Node implementation first.
Object.assign(globalThis, { File });
const { FormData, Request, Response, Headers, fetch } = await import("undici");
Object.assign(globalThis, { FormData, Request, Response, Headers, fetch });
export const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetStore();
  location.hash = "";
});
afterAll(() => server.close());
