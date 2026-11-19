const frontendUrlVariables = [
    "ADMIN_FRONTEND_URL",
    "TEACHER_FRONTEND_URL",
    "STUDENT_FRONTEND_URL",
];

const developmentOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
];

const parseFrontendOrigin = (variable, value, isProduction) => {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`${variable} must be an absolute HTTP or HTTPS URL`);
    }

    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error(`${variable} must use HTTP or HTTPS`);
    }
    if (isProduction && url.protocol !== "https:") {
        throw new Error(`${variable} must use HTTPS in production`);
    }

    return url.origin;
};

export const getAllowedOrigins = (env = process.env) => {
    const isProduction = env.NODE_ENV === "production";
    const allowedOrigins = new Set(isProduction ? [] : developmentOrigins);

    for (const variable of frontendUrlVariables) {
        const value = env[variable]?.trim();
        if (!value) {
            if (isProduction) throw new Error(`${variable} is required in production`);
            continue;
        }
        allowedOrigins.add(parseFrontendOrigin(variable, value, isProduction));
    }

    return allowedOrigins;
};

export const createCorsOptions = (env = process.env) => {
    const allowedOrigins = getAllowedOrigins(env);
    return {
        origin: (origin, callback) => {
            callback(null, !origin || allowedOrigins.has(origin));
        },
    };
};
