import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";

/**
 * Express middleware factory that validates req.body against a Zod schema.
 * Returns 400 with structured errors if validation fails.
 */
export function validateBody(schema: ZodSchema): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.issues.map(issue => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
    }
    req.body = result.data;
    next();
  };
}
