import type { Express } from "express";
import { logger } from "./logger";

/**
 * OpenAPI 3.0 specification for the FinCommand API.
 *
 * Served at:
 *   GET /api/docs       — Swagger UI (HTML)
 *   GET /api/docs.json  — Raw OpenAPI JSON spec
 *
 * The spec is hand-authored here rather than generated from JSDoc annotations
 * so it stays in sync with the Zod schemas in @workspace/api-zod and the
 * existing route implementations without requiring a build step.
 */
const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "FinCommand Executive Treasury API",
    version: "0.1.0",
    description:
      "REST API for the FinCommand finance control system. Handles bills, vendors, wallets, users, reports, and exports.",
    contact: { name: "FinCommand Engineering" },
  },
  servers: [{ url: "/api", description: "Current environment" }],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "fincommand.sid",
        description: "Session cookie set after a successful POST /auth/login",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string", example: "Validation failed" },
        },
        required: ["error"],
      },
      Bill: {
        type: "object",
        properties: {
          id: { type: "string" },
          vendorId: { type: "string" },
          vendorName: { type: "string" },
          description: { type: "string" },
          amount: { type: "number" },
          approvedAmount: { type: "number" },
          paidAmount: { type: "number" },
          outstandingBalance: { type: "number" },
          scheduledDate: { type: "string", format: "date" },
          dueDate: { type: "string", format: "date" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          status: {
            type: "string",
            enum: ["pending", "approved", "rejected", "on_hold", "partial", "paid", "overdue", "withdrawn"],
          },
          createdBy: { type: "string" },
          createdByName: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Vendor: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          bankName: { type: "string" },
          accountNumber: { type: "string" },
          totalBilled: { type: "number" },
          totalPaid: { type: "number" },
          outstandingBalance: { type: "number" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Wallet: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          bankName: { type: "string" },
          accountNumber: { type: "string" },
          balance: { type: "number" },
          currency: { type: "string", example: "NGN" },
          isLow: { type: "boolean" },
          lowBalanceThreshold: { type: "number" },
          ownedBy: { type: "string" },
          ownedByName: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          role: { type: "string", enum: ["md", "treasury", "payment_assistant"] },
          email: { type: "string" },
          phone: { type: "string" },
          isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  security: [{ sessionCookie: [] }],
  paths: {
    "/healthz": {
      get: {
        summary: "Health check",
        tags: ["Health"],
        security: [],
        responses: {
          "200": {
            description: "Service is healthy",
            content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", example: "ok" } } } } },
          },
        },
      },
    },
    "/auth/login": {
      post: {
        summary: "Log in with email and password",
        tags: ["Auth"],
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", format: "password" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Login successful — session cookie set" },
          "400": { description: "Missing credentials", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Invalid credentials", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Rate limit exceeded", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/logout": {
      post: {
        summary: "Log out and destroy session",
        tags: ["Auth"],
        responses: { "200": { description: "Logged out" } },
      },
    },
    "/auth/me": {
      get: {
        summary: "Get current authenticated user",
        tags: ["Auth"],
        responses: {
          "200": { description: "Current user", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } },
          "401": { description: "Not authenticated" },
        },
      },
      patch: {
        summary: "Update own profile (name, email, phone)",
        tags: ["Auth"],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  email: { type: "string", format: "email" },
                  phone: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Profile updated" },
          "400": { description: "Validation error" },
        },
      },
    },
    "/auth/change-password": {
      post: {
        summary: "Change own password",
        tags: ["Auth"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["currentPassword", "newPassword"],
                properties: {
                  currentPassword: { type: "string", format: "password" },
                  newPassword: { type: "string", format: "password", minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Password changed" },
          "400": { description: "Validation error or incorrect current password" },
        },
      },
    },
    "/bills": {
      get: {
        summary: "List bills with optional filters",
        tags: ["Bills"],
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "vendorId", in: "query", schema: { type: "string" } },
          { name: "priority", in: "query", schema: { type: "string" } },
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
          { name: "userId", in: "query", schema: { type: "string" }, description: "MD only" },
        ],
        responses: {
          "200": {
            description: "List of bills",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    bills: { type: "array", items: { $ref: "#/components/schemas/Bill" } },
                    total: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Create a new bill",
        tags: ["Bills"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["vendorId", "description", "amount", "scheduledDate"],
                properties: {
                  vendorId: { type: "string" },
                  description: { type: "string" },
                  amount: { type: "number" },
                  scheduledDate: { type: "string", format: "date" },
                  dueDate: { type: "string", format: "date" },
                  walletId: { type: "string" },
                  priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                  notes: { type: "string" },
                  link: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Bill created", content: { "application/json": { schema: { $ref: "#/components/schemas/Bill" } } } },
          "400": { description: "Validation error" },
        },
      },
    },
    "/bills/{id}": {
      get: {
        summary: "Get bill details with comments and audit trail",
        tags: ["Bills"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Bill detail" },
          "403": { description: "Forbidden" },
          "404": { description: "Not found" },
        },
      },
      patch: {
        summary: "Update bill fields",
        tags: ["Bills"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated bill" }, "400": { description: "Validation error" } },
      },
      delete: {
        summary: "Permanently delete a bill (MD only)",
        tags: ["Bills"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" }, "403": { description: "Forbidden" } },
      },
    },
    "/bills/{id}/approve": {
      post: { summary: "Approve a bill (MD only)", tags: ["Bills"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Approved" } } },
    },
    "/bills/{id}/reject": {
      post: { summary: "Reject a bill (MD only)", tags: ["Bills"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Rejected" } } },
    },
    "/bills/{id}/hold": {
      post: { summary: "Put a bill on hold (MD only)", tags: ["Bills"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "On hold" } } },
    },
    "/bills/{id}/pay": {
      post: { summary: "Process payment for an approved bill", tags: ["Bills"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Payment processed" } } },
    },
    "/bills/{id}/escalate": {
      post: { summary: "Escalate a bill to urgent priority", tags: ["Bills"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Escalated" } } },
    },
    "/bills/{id}/reschedule": {
      post: { summary: "Reschedule a bill to a new date", tags: ["Bills"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Rescheduled" } } },
    },
    "/vendors": {
      get: { summary: "List vendors", tags: ["Vendors"], responses: { "200": { description: "Vendor list" } } },
      post: { summary: "Create a vendor", tags: ["Vendors"], responses: { "201": { description: "Created" } } },
    },
    "/vendors/{id}": {
      get: { summary: "Get vendor detail", tags: ["Vendors"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Vendor detail" } } },
      patch: { summary: "Update vendor", tags: ["Vendors"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
      delete: { summary: "Delete vendor (MD only)", tags: ["Vendors"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" } } },
    },
    "/wallets": {
      get: { summary: "List wallets", tags: ["Wallets"], responses: { "200": { description: "Wallet list" } } },
      post: { summary: "Create a wallet", tags: ["Wallets"], responses: { "201": { description: "Created" } } },
    },
    "/wallets/transfer": {
      post: { summary: "Transfer funds between wallets", tags: ["Wallets"], responses: { "200": { description: "Transfer complete" } } },
    },
    "/wallets/{id}": {
      get: { summary: "Get wallet detail", tags: ["Wallets"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Wallet detail" } } },
      patch: { summary: "Update wallet", tags: ["Wallets"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
      delete: { summary: "Delete wallet", tags: ["Wallets"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" } } },
    },
    "/wallets/{id}/statement": {
      get: { summary: "Paginated wallet transaction ledger", tags: ["Wallets"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Statement" } } },
    },
    "/users": {
      get: { summary: "List all users (MD only)", tags: ["Users"], responses: { "200": { description: "User list" } } },
      post: { summary: "Create a user (MD only)", tags: ["Users"], responses: { "201": { description: "Created" } } },
    },
    "/users/{id}": {
      get: { summary: "Get user (MD or self)", tags: ["Users"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "User" } } },
      patch: { summary: "Update user (MD only)", tags: ["Users"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
      delete: { summary: "Deactivate user (MD only)", tags: ["Users"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deactivated" } } },
    },
    "/reports/outstanding-liabilities": {
      get: { summary: "Outstanding liabilities report", tags: ["Reports"], responses: { "200": { description: "Report data" } } },
    },
    "/reports/pending-approvals": {
      get: { summary: "Pending approvals report", tags: ["Reports"], responses: { "200": { description: "Report data" } } },
    },
    "/reports/paid-today": {
      get: { summary: "Paid today report", tags: ["Reports"], responses: { "200": { description: "Report data" } } },
    },
    "/reports/partial-payments": {
      get: { summary: "Partial payments report", tags: ["Reports"], responses: { "200": { description: "Report data" } } },
    },
    "/export/reports/{type}": {
      get: {
        summary: "Export a report as Excel or PDF",
        tags: ["Exports"],
        parameters: [
          { name: "type", in: "path", required: true, schema: { type: "string", enum: ["outstanding-liabilities", "pending-approvals", "paid-today", "partial-payments"] } },
          { name: "format", in: "query", schema: { type: "string", enum: ["excel", "pdf"], default: "excel" } },
        ],
        responses: {
          "200": { description: "File download" },
          "400": { description: "Invalid report type" },
          "429": { description: "Export rate limit exceeded" },
        },
      },
    },
    "/export/vendors/{id}/statement": {
      get: {
        summary: "Export vendor payment statement",
        tags: ["Exports"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "format", in: "query", schema: { type: "string", enum: ["excel", "pdf"] } },
        ],
        responses: { "200": { description: "File download" }, "404": { description: "Vendor not found" } },
      },
    },
    "/export/wallets/{id}/statement": {
      get: {
        summary: "Export wallet transaction statement",
        tags: ["Exports"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "format", in: "query", schema: { type: "string", enum: ["excel", "pdf"] } },
        ],
        responses: { "200": { description: "File download" }, "404": { description: "Wallet not found" } },
      },
    },
    "/dashboard/summary": {
      get: { summary: "Dashboard summary cards", tags: ["Dashboard"], responses: { "200": { description: "Summary" } } },
    },
    "/audit": {
      get: { summary: "Audit log (MD only)", tags: ["Audit"], responses: { "200": { description: "Audit entries" } } },
    },
    "/health/backups": {
      get: { summary: "Database backup status", tags: ["Health"], responses: { "200": { description: "Backup status" } } },
    },
    "/metrics": {
      get: { summary: "Prometheus metrics", tags: ["Monitoring"], security: [], responses: { "200": { description: "Metrics in Prometheus text format" } } },
    },
  },
};

/**
 * Register Swagger UI and raw JSON spec endpoints on the Express app.
 * Dynamically imports swagger-ui-express so the server still starts if the
 * package is not installed (graceful degradation).
 */
export async function registerSwagger(app: Express): Promise<void> {
  try {
    const swaggerUi = await import("swagger-ui-express");

    app.get("/api/docs.json", (_req, res) => {
      res.json(openApiSpec);
    });

    app.use(
      "/api/docs",
      swaggerUi.serve,
      swaggerUi.setup(openApiSpec, {
        customSiteTitle: "FinCommand API Docs",
        swaggerOptions: { persistAuthorization: true },
      }),
    );

    logger.info("Swagger UI registered at /api/docs");
  } catch {
    logger.warn("swagger-ui-express not installed — API docs unavailable. Run: pnpm add swagger-ui-express");
  }
}
