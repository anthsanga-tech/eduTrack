import mongoose from "mongoose";
import { createStartupError } from "./startupError.js";

const legacyAtlasHosts = [
    "ac-ilxellv-shard-00-00.y990qk3.mongodb.net:27017",
    "ac-ilxellv-shard-00-01.y990qk3.mongodb.net:27017",
    "ac-ilxellv-shard-00-02.y990qk3.mongodb.net:27017",
].join(",");

export const getMongoUri = (env = process.env) => {
    const configuredUri = env.MONGODB_URI?.trim();
    if (configuredUri) return configuredUri;

    const requiredVariables = ["MONGO_USER", "MONGO_PASS", "MONGO_DB"];
    const missingVariables = requiredVariables.filter(variable => !env[variable]?.trim());
    if (missingVariables.length) {
        throw createStartupError(
            `MongoDB configuration is incomplete. Set MONGODB_URI or provide ${requiredVariables.join(", ")}; missing: ${missingVariables.join(", ")}`
        );
    }

    const database = encodeURIComponent(env.MONGO_DB.trim());
    const username = encodeURIComponent(env.MONGO_USER);
    const password = encodeURIComponent(env.MONGO_PASS);

    const configuredCluster = env.MONGO_CLUSTER?.trim();
    if (configuredCluster) {
        const cluster = configuredCluster.replace(/^mongodb\+srv:\/\//i, "").replace(/\/+$/, "");
        return `mongodb+srv://${username}:${password}@${cluster}/${database}?retryWrites=true&w=majority&authSource=admin`;
    }

    return `mongodb://${username}:${password}@${legacyAtlasHosts}/${database}?replicaSet=atlas-jdkfr8-shard-0&tls=true&authSource=admin`;
};

export const getMongoConnectionDiagnostic = error => {
    if (
        error?.name === "MongoServerError" &&
        (error.code === 18 || error.codeName === "AuthenticationFailed")
    ) {
        return "MongoDB authentication failed; check the configured database credentials and access permissions.";
    }
    if (["MongoParseError", "MongoInvalidArgumentError"].includes(error?.name)) {
        return "MongoDB rejected the connection configuration; check the URI format and options.";
    }
    if (["MongoNetworkError", "MongoNetworkTimeoutError"].includes(error?.name)) {
        return "MongoDB network connection failed; check DNS, network access, and the Atlas IP allowlist.";
    }
    if (["MongoServerSelectionError", "MongooseServerSelectionError"].includes(error?.name)) {
        return "MongoDB server selection failed; check cluster availability, DNS, and the Atlas IP allowlist.";
    }
    return "MongoDB connection failed; check database availability and connection settings.";
};

const connectDB = async () => {
    const uri = getMongoUri();
    try {
        await mongoose.connect(uri);
    } catch (error) {
        throw createStartupError(getMongoConnectionDiagnostic(error));
    }
    console.info(JSON.stringify({ event: "mongodb_connected" }));
};

export default connectDB;
