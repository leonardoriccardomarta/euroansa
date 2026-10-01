-- Checklist per pratica (Filippo: documenti diversi ogni volta)
ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "required_document_types" text[] DEFAULT '{}' NOT NULL;
