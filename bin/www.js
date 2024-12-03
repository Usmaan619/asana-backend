#!/usr/bin/env node

/**
 * Module dependencies.
 */
import "dotenv/config";
import app from "../app.js";
import debugLib from "debug";
import http from "http";
import { initSocket } from "../src/web-sockets/notification.socket.js";

const debug = debugLib("express-l17:server");

const listen = (port) => {
  /**
   * Get port from environment and store in Express.
   */
  const normalizedPort = normalizePort(process.env.PORT || port || "3001");
  app.set("port", normalizedPort);

  /**
   * Create HTTP server.
   */
  const server = http.createServer(app);

  /**
   * Initialize Socket.io
   * */
  initSocket(server);

  /**
   * Listen on provided port, on all network interfaces.
   */
  server.listen(normalizedPort, () => {
    console.log(`Node server listening on port ${normalizedPort}...`);
  });

  server.on("error", onError);
  server.on("listening", onListening);

  /**
   * Normalize a port into a number, string, or false.
   */
  function normalizePort(val) {
    const port = parseInt(val, 10);

    if (isNaN(port)) {
      // named pipe
      return val;
    }

    if (port >= 0) {
      // port number
      return port;
    }

    return false;
  }

  /**
   * Event listener for HTTP server "error" event.
   */
  function onError(error) {
    if (error.syscall !== "listen") {
      throw error;
    }

    const bind =
      typeof normalizedPort === "string"
        ? "Pipe " + normalizedPort
        : "Port " + normalizedPort;

    // handle specific listen errors with friendly messages
    switch (error.code) {
      case "EACCES":
        console.error(bind + " requires elevated privileges");
        process.exit(1);
        break;
      case "EADDRINUSE":
        console.error(bind + " is already in use");
        changePort(normalizedPort);
        break;
      default:
        throw error;
    }
  }

  /**
   * Event listener for HTTP server "listening" event.
   */
  function onListening() {
    const addr = server.address();
    const bind =
      typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
    debug("Listening on " + bind);
    console.log("Server listening on port:", addr.port);
  }
};

/**
 * Listening for the first time.
 */
listen();

const changePort = (port) => {
  const input = process.stdin;
  input.setEncoding("utf-8");
  console.log("Do you want to change port? (yes/no)");
  input.on("data", (data) => {
    if (data === "yes\n") {
      listen(port + 1);
    } else {
      console.log("Exiting...");
      process.exit();
    }
  });
};
