-- Initial database schema for tekno-logger
-- Creates all required tables with proper indices and constraints

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id INT PRIMARY KEY AUTO_INCREMENT,
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    api_key_hash CHAR(64) NOT NULL,
    retention_days INT DEFAULT 3,
    minute_cap INT DEFAULT 5000,
    default_sample_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_slug (slug),
    INDEX idx_api_key_hash (api_key_hash)
);

-- Main logs table with optimized indices
CREATE TABLE IF NOT EXISTS logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    project_id INT NOT NULL,
    ts DATETIME(3) NOT NULL,
    day_id INT NOT NULL,
    level ENUM('debug','info','warn','error','fatal') NOT NULL,
    source VARCHAR(64) NOT NULL,
    env VARCHAR(32) NOT NULL,
    message VARCHAR(1024) NOT NULL,
    ctx_json JSON NULL,
    user_id VARCHAR(64) NULL,
    request_id VARCHAR(64) NULL,
    tags VARCHAR(128) NULL,
    fingerprint CHAR(40) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    KEY idx_proj_ts (project_id, ts),
    KEY idx_proj_level_ts (project_id, level, ts),
    KEY idx_proj_fp_ts (project_id, fingerprint, ts),
    KEY idx_day_id (day_id),
    KEY idx_fingerprint (fingerprint)
);

-- Rate limiting counters
CREATE TABLE IF NOT EXISTS project_minute_counters (
    project_id INT NOT NULL,
    minute_utc INT NOT NULL,
    count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (project_id, minute_utc),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Alert configuration per project
CREATE TABLE IF NOT EXISTS alert_settings (
    project_id INT PRIMARY KEY,
    enabled TINYINT(1) DEFAULT 0,
    discord_webhook VARCHAR(255) NULL,
    spike_n INT DEFAULT 5,
    spike_window_sec INT DEFAULT 60,
    error_rate_n INT DEFAULT 50,
    error_rate_window_sec INT DEFAULT 60,
    heartbeat_grace_sec INT DEFAULT 600,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Optional: Fingerprint tracking for advanced alerting
CREATE TABLE IF NOT EXISTS fingerprints (
    project_id INT NOT NULL,
    fingerprint CHAR(40) NOT NULL,
    last_seen DATETIME(3) NOT NULL,
    last_alert DATETIME(3) NULL,
    count_1m INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (project_id, fingerprint),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    KEY idx_last_seen (last_seen),
    KEY idx_last_alert (last_alert)
);