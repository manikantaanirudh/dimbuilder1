import { z } from "zod";

/** Schema for creating a new project */
export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(255),
  description: z.string().max(2000).default(""),
  dimensionType: z.string().optional(),
  blueprintType: z.string().optional()
});

/** Schema for renaming/updating a project */
export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional()
}).refine(data => data.name || data.description, {
  message: "At least one field (name or description) must be provided"
});

/** Schema for config PUT body */
export const updateConfigSchema = z.record(z.unknown());
