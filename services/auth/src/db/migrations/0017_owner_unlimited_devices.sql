-- Remove device limit for the ElevatedPOS demo/owner organisation
UPDATE organisations
SET max_devices = 9999
WHERE id = '00000000-0000-0000-0000-000000000001';
