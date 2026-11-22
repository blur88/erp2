import { createServer, type Server, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { DataSource } from "typeorm";

const requireDependency = createRequire(import.meta.url);

// Parse complete RESP command arrays from the front of a buffer.
function parseCommands(buffer: Buffer): { commands: string[][]; rest: Buffer } {
  const commands: string[][] = [];
  let offset = 0;
  const line = (from: number) => {
    const end = buffer.indexOf("\r\n", from);
    return end === -1
      ? undefined
      : { text: buffer.toString("utf8", from, end), next: end + 2 };
  };
  for (;;) {
    const header = line(offset);
    if (!header) break;
    let next = header.next;
    const command: string[] = [];
    for (let count = Number(header.text.slice(1)); count > 0; count--) {
      const size = line(next);
      if (!size) break;
      const end = size.next + Number(size.text.slice(1));
      if (buffer.length < end + 2) break;
      command.push(buffer.toString("utf8", size.next, end));
      next = end + 2;
    }
    if (command.length !== Number(header.text.slice(1))) break;
    commands.push(command);
    offset = next;
  }
  return { commands, rest: buffer.subarray(offset) };
}

const bulk = (value: string | undefined) =>
  value === undefined
    ? "$-1\r\n"
    : `$${Buffer.byteLength(value)}\r\n${value}\r\n`;

// A minimal Redis server: enough of the protocol for ioredis to connect, in
// standalone or single-node cluster mode, and for TypeORM's query cache to
// store, read, remove and clear entries.
function fakeRedis(received: string[][]) {
  const store = new Map<string, string>();
  return createServer((socket: Socket) => {
    let pending: Buffer = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      const { commands, rest } = parseCommands(Buffer.concat([pending, chunk]));
      pending = rest;
      for (const [name, ...args] of commands) {
        const command = name.toUpperCase();
        received.push([command, ...args]);
        if (command === "INFO") socket.write(bulk("# Server\r\nloading:0\r\n"));
        else if (command === "CLUSTER" && args[0].toUpperCase() === "SLOTS") {
          // One node serves every slot.
          const { port } = socket.address() as AddressInfo;
          socket.write(
            `*1\r\n*3\r\n:0\r\n:16383\r\n*2\r\n${bulk("127.0.0.1")}:${port}\r\n`,
          );
        } else if (command === "CLUSTER")
          socket.write(bulk("cluster_state:ok\r\n"));
        else if (command === "GET") socket.write(bulk(store.get(args[0])));
        else if (command === "SET") {
          store.set(args[0], args[1]);
          socket.write("+OK\r\n");
        } else if (command === "DEL") {
          const removed = args.filter((key) => store.delete(key)).length;
          socket.write(`:${removed}\r\n`);
        } else if (command === "FLUSHDB") {
          store.clear();
          socket.write("+OK\r\n");
        } else if (command === "QUIT") socket.end("+OK\r\n");
        else socket.write("+OK\r\n");
      }
    });
  });
}

// The `typeorm → ioredis` override resolves TypeORM's optional peer (declared
// ^5.0.4) to the backend's direct ioredis. See the allowlist entry in
// scripts/dependency-override-allowlist.json.
describe("ioredis override resolution", () => {
  it("typeorm resolves the backend's direct ioredis", () => {
    // typeorm's exports map hides its package.json, so resolve from its entry.
    const fromTypeorm = createRequire(requireDependency.resolve("typeorm"));

    expect(fromTypeorm.resolve("ioredis/package.json")).toBe(
      requireDependency.resolve("ioredis/package.json"),
    );
  });
});

describe("ioredis consumer compatibility", () => {
  const received: string[][] = [];
  let server: Server;
  let port: number;

  beforeEach(async () => {
    received.length = 0;
    server = fakeRedis(received);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    ({ port } = server.address() as AddressInfo);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // TypeORM's RedisQueryResultCache constructs the client in each of these
  // ways, depending on the cache options.
  it.each([
    {
      client: "new Redis(options)",
      cluster: false,
      cache: () => ({ type: "ioredis", options: { host: "127.0.0.1", port } }),
    },
    {
      client: "new Redis(port, options)",
      cluster: false,
      cache: () => ({ type: "ioredis", port, options: { host: "127.0.0.1" } }),
    },
    {
      client: "new Cluster(nodes)",
      cluster: true,
      cache: () => ({
        type: "ioredis/cluster",
        options: [{ host: "127.0.0.1", port }],
      }),
    },
    {
      client: "new Cluster(startupNodes, options)",
      cluster: true,
      cache: () => ({
        type: "ioredis/cluster",
        options: {
          startupNodes: [{ host: "127.0.0.1", port }],
          options: { scaleReads: "master" },
        },
      }),
    },
  ])(
    "TypeORM's query cache stores, reads, removes and clears through $client",
    async ({ cache: cacheOptions, cluster }) => {
      const dataSource = new DataSource({
        type: "postgres",
        cache: cacheOptions() as any,
      });
      const cache = dataSource.queryResultCache;
      const entry = {
        identifier: "items",
        query: "SELECT 1",
        time: Date.now(),
        duration: 60_000,
        result: [{ id: 1 }],
      };

      const lookup = { identifier: "items", duration: entry.duration };

      await cache.connect();
      await cache.storeInCache(entry, undefined);
      await expect(cache.getFromCache(lookup)).resolves.toMatchObject({
        result: [{ id: 1 }],
        duration: 60_000,
      });

      await cache.remove(["items"]);
      await expect(cache.getFromCache(lookup)).resolves.toBe(undefined);

      await cache.storeInCache(entry, undefined);
      await cache.clear();
      await expect(cache.getFromCache(lookup)).resolves.toBe(undefined);
      await cache.disconnect();

      expect(received).toEqual(
        expect.arrayContaining([
          ["SET", "items", JSON.stringify(entry), "PX", "60000"],
          ["DEL", "items"],
          ["FLUSHDB"],
          ["QUIT"],
        ]),
      );
      // Cluster clients discover the slot map; standalone clients never ask.
      expect(received).toEqual(
        cluster
          ? expect.arrayContaining([["CLUSTER", "SLOTS"]])
          : expect.not.arrayContaining([["CLUSTER", "SLOTS"]]),
      );
    },
  );
});
