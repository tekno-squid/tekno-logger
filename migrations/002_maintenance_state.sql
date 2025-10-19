-- Add maintenance state tracking table
-- This table tracks when maintenance was last run and if it's currently in progress

CREATE TABLE IF NOT EXISTS maintenance_state (
    id INT PRIMARY KEY AUTO_INCREMENT,
    last_maintenance TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    maintenance_in_progress TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert initial maintenance state record
INSERT IGNORE INTO maintenance_state (last_maintenance, maintenance_in_progress) 
VALUES (CURRENT_TIMESTAMP, 0);

-- Rename fingerprints table to fingerprint_trackers for consistency
ALTER TABLE fingerprints RENAME TO fingerprint_trackers;