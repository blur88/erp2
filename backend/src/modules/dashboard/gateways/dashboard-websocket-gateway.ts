import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { DashboardService } from "../services/dashboard-service";
import {
  DashboardDataRequest,
  DashboardAlert,
} from "../interfaces/dashboard-interfaces";

@WebSocketGateway({
  cors: {
    origin: "*", // Configure properly in production
    methods: ["GET", "POST"],
  },
  namespace: "dashboard",
})
export class DashboardWebSocketGateway {
  @WebSocketServer()
  server: Server;

  constructor(private dashboardService: DashboardService) {}

  // Client requests real-time dashboard data
  @SubscribeMessage("getDashboardData")
  async handleDashboardDataRequest(
    @MessageBody() request: DashboardDataRequest,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const dashboardData =
        await this.dashboardService.getDashboardData(request);
      client.emit("dashboardData", dashboardData);
    } catch (error) {
      client.emit("error", {
        message: "Failed to fetch dashboard data",
        details: error.message,
      });
    }
  }

  // Real-time alert monitoring
  async broadcastAlerts() {
    try {
      const alerts: DashboardAlert[] =
        await this.dashboardService.generateAlerts();

      // Broadcast alerts to all connected clients
      this.server.emit("dashboardAlerts", alerts);
    } catch (error) {
      console.error("Alert broadcasting failed:", error);
    }
  }

  // Periodic data refresh method
  async startPeriodicRefresh(intervalMs: number = 300000) {
    // Default 5 minutes
    setInterval(async () => {
      // Fetch and broadcast latest dashboard data
      const dashboardData = await this.dashboardService.getDashboardData({});
      this.server.emit("dashboardDataRefresh", dashboardData);

      // Check and broadcast alerts
      await this.broadcastAlerts();
    }, intervalMs);
  }
}
