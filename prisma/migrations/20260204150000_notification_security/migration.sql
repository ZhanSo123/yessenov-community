-- Add SECURITY notification type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'NotificationType' AND e.enumlabel = 'SECURITY'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'SECURITY';
  END IF;
END $$;
