import type { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

/**
 * Express middleware factory that validates request body, params, and/or query
 * against the provided Zod schemas (sourced from @workspace/api-zod).
 *
 * Returns 400 with a structured error payload on validation failure.
 * Attaches parsed/coerced values back onto req so downstream handlers
 * receive clean, typed data.
 *
 * Usage:
 *   router.post("/bills", validateRequest({ body: CreateBillBody }), handler);
 */
export function validateRequest(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: Record<string, unknown> = {};

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        errors["body"] = formatZodError(result.error);
      } else {
        req.body = result.data;
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        errors["params"] = formatZodError(result.error);
      } else {
        // req.params is read-only in Express types but we can assign individual keys
        Object.assign(req.params, result.data);
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        errors["query"] = formatZodError(result.error);
      } else {
        // Assign coerced query values back
        Object.assign(req.query, result.data);
      }
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({
        error: "Validation failed",
        details: errors,
      });
      return;
    }

    next();
  };
}

function formatZodError(error: ZodError): { field: string; message: string }[] {
  return error.errors.map((issue) => ({
    field: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}
