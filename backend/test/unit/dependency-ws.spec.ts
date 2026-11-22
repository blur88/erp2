import { jest } from "@jest/globals";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { Server } from "socket.io";
import WebSocket from "ws";

// ws exports its Sender class at runtime, but @types/ws does not declare it.
type SenderMethod = (...args: unknown[]) => unknown;
const { Sender } = WebSocket as unknown as {
  Sender: { frame: SenderMethod; prototype: { sendFrame: SenderMethod } };
};

const requireDependency = createRequire(import.meta.url);

// engine.io and socket.io-adapter declare ws ~8.21.0; the backend `ws`
// override resolves them to a later 8.x. See the allowlist entries in
// scripts/dependency-override-allowlist.json.
describe("ws override resolutions", () => {
  it.each([
    ["engine.io", () => requireDependency.resolve("engine.io")],
    [
      "socket.io-adapter",
      () =>
        createRequire(requireDependency.resolve("socket.io")).resolve(
          "socket.io-adapter",
        ),
    ],
  ])("%s resolves ws 8.20.1 or later within major 8", (_consumer, entry) => {
    const { version } = createRequire(entry())("ws/package.json") as {
      version: string;
    };
    const [major, minor, patch] = version.split(".").map(Number);

    expect(major).toBe(8);
    expect(minor > 20 || (minor === 20 && patch >= 1)).toBe(true);
  });
});

describe("ws consumer compatibility", () => {
  let httpServer: HttpServer;
  let io: Server;
  let url: string;

  beforeEach(async () => {
    httpServer = createServer();
    io = new Server(httpServer, { transports: ["websocket"] });
    await new Promise<void>((resolve) =>
      httpServer.listen(0, "127.0.0.1", resolve),
    );
    const { port } = httpServer.address() as AddressInfo;
    url = `ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  it("upgrades, exchanges messages, broadcasts pre-encoded frames and closes", async () => {
    // ws's own send() also calls Sender.frame and sendFrame, so record which
    // package made each call.
    const callers = (method: "frame" | "sendFrame") => {
      const stacks: string[] = [];
      const target = method === "frame" ? Sender : Sender.prototype;
      const original = (target as Record<string, SenderMethod>)[method];
      jest.spyOn(target as any, method).mockImplementation(function (
        this: unknown,
        ...args: unknown[]
      ) {
        stacks.push(new Error().stack ?? "");
        return original.apply(this, args);
      });
      return stacks;
    };
    const frameCallers = callers("frame");
    const sendFrameCallers = callers("sendFrame");
    const received: string[] = [];
    const waitFor = (predicate: (message: string) => boolean) =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(`timed out; received ${JSON.stringify(received)}`),
            ),
          5000,
        );
        const check = () => {
          const match = received.find(predicate);
          if (match) {
            clearTimeout(timer);
            client.off("message", check);
            resolve(match);
          }
        };
        client.on("message", check);
        check();
      });

    const fromClient = new Promise<unknown>((resolve) =>
      io.on("connection", (socket) => socket.on("client-event", resolve)),
    );

    // ws.Server + handleUpgrade accept the upgrade; the transport sends the
    // Engine.IO open packet.
    const client = new WebSocket(url);
    client.on("message", (data) => received.push(data.toString()));
    await waitFor((m) => m.startsWith("0{"));

    // The transport receives a message and answers the namespace connect.
    client.send("40");
    await waitFor((m) => m.startsWith("40{"));

    client.send('42["client-event",{"from":"client"}]');
    await expect(fromClient).resolves.toEqual({ from: "client" });

    // A room broadcast is pre-encoded by socket.io-adapter with Sender.frame
    // and written by the transport through _sender.sendFrame.
    io.emit("broadcast", { total: 42 });
    await expect(waitFor((m) => m.startsWith("42["))).resolves.toBe(
      '42["broadcast",{"total":42}]',
    );
    expect(
      frameCallers.some((stack) => stack.includes("socket.io-adapter")),
    ).toBe(true);
    expect(
      sendFrameCallers.some((stack) =>
        /engine\.io[\\/]build[\\/]transports[\\/]websocket/.test(stack),
      ),
    ).toBe(true);

    // Closing the server closes the client connection.
    const closed = new Promise<number>((resolve) =>
      client.on("close", (code) => resolve(code)),
    );
    io.close();
    await expect(closed).resolves.toEqual(expect.any(Number));
  });
});
