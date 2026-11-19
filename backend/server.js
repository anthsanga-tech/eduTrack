import dns from "node:dns";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./src/config/db.js";
import { createCorsOptions } from "./src/config/cors.js";
import { validateRuntimeEnvironment } from "./src/config/runtime.js";
import { createStartupError } from "./src/config/startupError.js";
import authRoutes from "./src/routes/authRoutes.js";
import { scheduleExpiredTestCleanup } from "./src/jobs/closeExpiredTests.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import teacherRoutes from "./src/routes/teacherRoutes.js";
import studentRoutes from "./src/routes/studentRoutes.js";

dotenv.config();
dns.setDefaultResultOrder("ipv4first");

export const createApp = (env = process.env) => {
    const app = express();
    app.use(cors(createCorsOptions(env)));
    app.use(express.json());

    app.get("/health", (req, res) => {
        res.status(200).json({ status: "ok" });
    });

    app.use("/api/auth", authRoutes);
    app.use("/api/admin", adminRoutes);
    app.use("/api/teacher", teacherRoutes);
    app.use("/api/student", studentRoutes);

    app.use((error, req, res, next) => {
        if (res.headersSent) return next(error);

        const statusCode = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
            ? error.status
            : 500;
        console.error(JSON.stringify({
            event: "request_error",
            method: req.method,
            path: req.path,
            statusCode,
            error: error.name || "Error",
        }));

        return res.status(statusCode).json({
            message: env.NODE_ENV === "production"
                ? (statusCode < 500 ? "Invalid request" : "Internal server error")
                : error.message,
        });
    });

    return app;
};

export const startServer = async () => {
    validateRuntimeEnvironment();
    await connectDB();

    const configuredPort = process.env.PORT ?? "5000";
    const port = Number(configuredPort);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw createStartupError("PORT must be an integer between 0 and 65535");
    }

    const app = createApp();
    return new Promise((resolveServer, rejectServer) => {
        const server = app.listen(port, () => {
            scheduleExpiredTestCleanup();
            console.info(JSON.stringify({ event: "server_listening", port }));
            resolveServer(server);
        });
        server.once("error", error => {
            const code = ["EADDRINUSE", "EACCES"].includes(error.code) ? error.code : "SERVER_ERROR";
            rejectServer(createStartupError(`HTTP server failed to listen (${code}).`));
        });
    });
};

const isDirectExecution = process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
    startServer().catch(error => {
        console.error(JSON.stringify({
            event: "server_start_failed",
            message: error?.safeStartupMessage || "Unexpected startup failure",
        }));
        process.exitCode = 1;
    });
}
