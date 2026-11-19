import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createApp } from "../../server.js";

describe("health endpoint", () => {
    it("returns an unauthenticated service status response", async () => {
        const response = await request(createApp({ NODE_ENV: "test" }))
            .get("/health");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: "ok" });
    });
});
