import { getAllowedOrigins } from "./cors.js";
import { createStartupError } from "./startupError.js";

export const validateRuntimeEnvironment = (env = process.env) => {
    try {
        getAllowedOrigins(env);
    } catch (error) {
        throw createStartupError(error.message);
    }

    if (!env.JWT_SECRET?.trim()) {
        throw createStartupError("JWT_SECRET is required");
    }

    const emailMode = env.PASSWORD_RESET_EMAIL_MODE || "resend";
    if (!["resend", "console"].includes(emailMode)) {
        throw createStartupError("PASSWORD_RESET_EMAIL_MODE must be resend or console");
    }
    if (emailMode === "console" && env.NODE_ENV !== "development") {
        throw createStartupError("Console password reset email mode is only allowed in development");
    }
    if (
        env.NODE_ENV === "production" &&
        emailMode === "resend" &&
        (!env.RESEND_API_KEY?.trim() || !env.PASSWORD_RESET_FROM?.trim())
    ) {
        throw createStartupError("RESEND_API_KEY and PASSWORD_RESET_FROM are required in production");
    }
};
