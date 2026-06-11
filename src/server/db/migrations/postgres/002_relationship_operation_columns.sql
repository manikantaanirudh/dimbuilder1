-- Add operation, operation_source, operation_notes to dimension_relationships.
ALTER TABLE dimension_relationships ADD COLUMN IF NOT EXISTS operation TEXT;
ALTER TABLE dimension_relationships ADD COLUMN IF NOT EXISTS operation_source TEXT;
ALTER TABLE dimension_relationships ADD COLUMN IF NOT EXISTS operation_notes TEXT;
