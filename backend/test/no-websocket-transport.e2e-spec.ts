/**
 * No WebSocket transport (#1348).
 *
 * The dashboard Socket.IO gateway accepted any connection and answered
 * getDashboardData without authentication, while nothing in the frontend
 * used it. It was removed rather than authenticated. This asserts the effect
 * on a real boot: the backend no longer answers an Engine.IO handshake.
 *
 * A gateway added later re-attaches Socket.IO to the HTTP server and turns
 * this red, which is the point: a new real-time transport must be designed
 * together with its authentication, not slipped in.
 *
 * This covers the backend directly. What NGINX does with /socket.io/ in
 * front of it is configuration, not something this suite sees.
 *
 * The request is unauthenticated and mutates nothing, so the suite leaves no
 * audit_logs/search_queries traces for the leak check to find.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("No WebSocket transport (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("does not answer an Engine.IO polling handshake", async () => {
    const response = await request(app.getHttpServer()).get(
      "/socket.io/?EIO=4&transport=polling",
    );

    // An Engine.IO server answers 200 with an open packet: 0{"sid":...}.
    expect({
      status: response.status,
      openPacket: /^0\{"sid"/.test(response.text ?? ""),
    }).toEqual({ status: 404, openPacket: false });
  });
});
