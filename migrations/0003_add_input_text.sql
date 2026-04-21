-- Add input_text column for persisting pasted text content
ALTER TABLE runs ADD COLUMN input_text TEXT;
