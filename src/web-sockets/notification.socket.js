import { Server as SocketServer } from "socket.io";

let io;

export const initSocket = (server) => {
  io = new SocketServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    // Handle joining a room (collaborators join the same task room)
    socket.on("joinRoom", (roomId) => {
      socket.join(roomId);
      console.log(`Client ${socket.id} joined room: ${roomId}`);
    });

    // Handle sending a message to collaborators
    socket.on("sendMessage", ({ roomId, message, sender }) => {
      console.log(`Message from ${sender} in room ${roomId}: ${message}`);
      io.to(roomId).emit("receiveMessage", { message, sender });
    });

    // Handle disconnecting
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });
};

// Notify a specific user (e.g., task assigned)
export const notifyUser = (userId, notificationData) => {
  io.to(userId).emit("notification", notificationData);
};

// Notify a user when they are assigned a task
export const notifyTaskAssigned = (userId, taskData) => {
  io.to(userId).emit("taskAssigned", taskData);
};
