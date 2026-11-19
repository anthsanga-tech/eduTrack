import { describe, expect, it } from "@jest/globals";
import { createCorsOptions, getAllowedOrigins } from "./cors.js";
import { getMongoConnectionDiagnostic, getMongoUri } from "./db.js";
import { validateRuntimeEnvironment } from "./runtime.js";

const productionEnvironment = {
    NODE_ENV: "production",
    JWT_SECRET: "test-secret",
    PASSWORD_RESET_EMAIL_MODE: "resend",
    RESEND_API_KEY: "test-api-key",
    PASSWORD_RESET_FROM: "EduTrack <noreply@example.test>",
    ADMIN_FRONTEND_URL: "https://admin.example.test/",
    TEACHER_FRONTEND_URL: "https://teacher.example.test",
    STUDENT_FRONTEND_URL: "https://student.example.test",
};

describe("MongoDB connection configuration", () => {
    it("prefers an explicitly configured URI", () => {
        expect(getMongoUri({
            MONGODB_URI: "mongodb+srv://configured-uri",
            MONGO_USER: "legacy-user",
            MONGO_PASS: "legacy-password",
            MONGO_DB: "legacy-db",
        }))
            .toBe("mongodb+srv://configured-uri");
    });

    it("supports legacy Atlas variables with the configured SRV cluster", () => {
        expect(getMongoUri({
            MONGO_USER: "db user",
            MONGO_PASS: "p@ss:word",
            MONGO_DB: "current database",
            MONGO_CLUSTER: "existing-cluster.mongodb.net",
        })).toBe(
            "mongodb+srv://db%20user:p%40ss%3Aword@existing-cluster.mongodb.net/current%20database?retryWrites=true&w=majority&authSource=admin"
        );
    });

    it("supports the previous three-variable configuration and Atlas connection string", () => {
        expect(getMongoUri({
            MONGO_USER: "db user",
            MONGO_PASS: "p@ss:word",
            MONGO_DB: "current database",
        })).toBe(
            "mongodb://db%20user:p%40ss%3Aword@ac-ilxellv-shard-00-00.y990qk3.mongodb.net:27017,ac-ilxellv-shard-00-01.y990qk3.mongodb.net:27017,ac-ilxellv-shard-00-02.y990qk3.mongodb.net:27017/current%20database?replicaSet=atlas-jdkfr8-shard-0&tls=true&authSource=admin"
        );
    });

    it("fails with missing variable names instead of attempting a default database", () => {
        expect(() => getMongoUri({ MONGO_USER: "user" }))
            .toThrow(/MONGODB_URI|MONGO_PASS|MONGO_DB/);
    });

    it("returns useful MongoDB diagnostics without including driver error details", () => {
        const diagnostic = getMongoConnectionDiagnostic(Object.assign(
            new Error("failed for mongodb://user:password@cluster/db?secret=jwt-secret"),
            { name: "MongoServerSelectionError" }
        ));

        expect(diagnostic).toMatch(/server selection failed/i);
        expect(diagnostic).not.toMatch(/password|jwt-secret|mongodb:\/\//i);
    });
});

describe("CORS and production environment", () => {
    it("allows local development origins and requests without an Origin header", () => {
        const options = createCorsOptions({ NODE_ENV: "development" });
        const checkOrigin = origin => new Promise((resolve, reject) => {
            options.origin(origin, (error, allowed) => error ? reject(error) : resolve(allowed));
        });

        return Promise.all([
            checkOrigin("http://localhost:5173"),
            checkOrigin(undefined),
            checkOrigin("https://unlisted.example.test"),
        ]).then(results => expect(results).toEqual([true, true, false]));
    });

    it("allows only configured HTTPS frontend origins in production", () => {
        const allowed = getAllowedOrigins(productionEnvironment);
        expect([...allowed]).toEqual([
            "https://admin.example.test",
            "https://teacher.example.test",
            "https://student.example.test",
        ]);
        expect(() => getAllowedOrigins({
            ...productionEnvironment,
            STUDENT_FRONTEND_URL: "http://student.example.test",
        })).toThrow(/must use HTTPS/);
        expect(() => getAllowedOrigins({
            ...productionEnvironment,
            ADMIN_FRONTEND_URL: "",
        })).toThrow(/ADMIN_FRONTEND_URL is required/);
    });

    it("rejects production console reset mode and incomplete email configuration", () => {
        expect(() => validateRuntimeEnvironment({
            ...productionEnvironment,
            PASSWORD_RESET_EMAIL_MODE: "console",
        })).toThrow(/only allowed in development/);
        expect(() => validateRuntimeEnvironment({
            ...productionEnvironment,
            RESEND_API_KEY: "",
        })).toThrow(/RESEND_API_KEY and PASSWORD_RESET_FROM/);

        expect(() => validateRuntimeEnvironment({
            NODE_ENV: "development",
            PASSWORD_RESET_EMAIL_MODE: "console",
            JWT_SECRET: "local-secret",
        })).not.toThrow();
    });
});
