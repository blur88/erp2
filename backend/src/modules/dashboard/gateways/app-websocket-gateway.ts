import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 25000,
  pingTimeout: 60000,
})
export class AppWebSocketGateway {
  @WebSocketServer()
  server: Server;
}
