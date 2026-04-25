import { AppWebSocketGateway } from './app-websocket-gateway';

describe('AppWebSocketGateway', () => {
  let gateway: AppWebSocketGateway;

  beforeEach(() => {
    gateway = new AppWebSocketGateway();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
