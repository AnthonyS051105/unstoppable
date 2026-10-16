UPDATE caregiver_relationships
SET location_sharing_mode = 'during_trip'
WHERE location_sharing_mode IN ('full', 'always');

ALTER TABLE caregiver_relationships
  ALTER COLUMN location_sharing_mode SET DEFAULT 'sos_only';

ALTER TABLE caregiver_relationships
  DROP CONSTRAINT IF EXISTS chk_location_sharing_mode;

ALTER TABLE caregiver_relationships
  ADD CONSTRAINT chk_location_sharing_mode
  CHECK (location_sharing_mode IN ('during_trip', 'sos_only', 'off'));
