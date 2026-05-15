-- =====================================================
-- POSTGRESQL HEALTH CHECKS & MONITORING QUERIES
-- =====================================================
-- Performance monitoring and diagnostic queries for trading platform
-- Run these queries regularly to monitor database health
-- =====================================================

-- =====================================================
-- 1. CONNECTION MONITORING
-- =====================================================

-- Active connections by database
SELECT datname, usename, count(*) as connection_count
FROM pg_stat_activity
WHERE datname IS NOT NULL
GROUP BY datname, usename
ORDER BY connection_count DESC;

-- Connection pool status
SELECT 
    sum(numbackends) as total_connections,
    max(numbackends) as max_connections,
    datname
FROM pg_stat_database
WHERE datname IN ('trading_dev', 'trading_prod')
GROUP BY datname;

-- Long running queries (>5 minutes)
SELECT 
    pid,
    usename,
    application_name,
    state,
    query_start,
    now() - query_start as duration,
    query
FROM pg_stat_activity
WHERE state != 'idle' AND query_start < now() - interval '5 minutes'
ORDER BY query_start;

-- =====================================================
-- 2. TABLE SIZE MONITORING
-- =====================================================

-- Table sizes (largest tables first)
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Database size
SELECT
    datname,
    pg_size_pretty(pg_database_size(datname)) AS size,
    pg_database_size(datname) AS size_bytes
FROM pg_database
WHERE datname IN ('trading_dev', 'trading_prod')
ORDER BY pg_database_size(datname) DESC;

-- Index sizes
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;

-- =====================================================
-- 3. QUERY PERFORMANCE MONITORING
-- =====================================================

-- Slowest queries (requires pg_stat_statements extension)
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    max_time,
    min_time,
    stddev_time
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY mean_time DESC
LIMIT 10;

-- Most called queries
SELECT 
    query,
    calls,
    total_time,
    mean_time
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY calls DESC
LIMIT 10;

-- Queries using most I/O
SELECT 
    query,
    (blks_hit + blks_read) as total_blocks,
    blks_read,
    blks_hit,
    CASE 
        WHEN (blks_hit + blks_read) = 0 THEN 0 
        ELSE round(100.0 * blks_hit / (blks_hit + blks_read), 2) 
    END as cache_hit_ratio
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY (blks_hit + blks_read) DESC
LIMIT 10;

-- =====================================================
-- 4. INDEX HEALTH
-- =====================================================

-- Unused indexes
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
AND idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- Missing indexes (queries accessing seq_scan frequently)
SELECT 
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    seq_tup_read - idx_tup_fetch as wasted_reads
FROM pg_stat_user_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
AND seq_scan > 100
ORDER BY seq_scan DESC
LIMIT 10;

-- =====================================================
-- 5. CACHE HIT RATIO
-- =====================================================

-- Database-wide cache hit ratio
SELECT 
    sum(heap_blks_read) as heap_read,
    sum(heap_blks_hit) as heap_hit,
    sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as ratio
FROM pg_statio_user_tables;

-- Cache hit ratio by table
SELECT 
    schemaname,
    tablename,
    heap_blks_read,
    heap_blks_hit,
    CASE 
        WHEN heap_blks_hit + heap_blks_read = 0 THEN 100 
        ELSE round(100.0 * heap_blks_hit / (heap_blks_hit + heap_blks_read), 2) 
    END as cache_hit_ratio
FROM pg_statio_user_tables
ORDER BY cache_hit_ratio ASC
LIMIT 10;

-- =====================================================
-- 6. TRANSACTION & LOCK MONITORING
-- =====================================================

-- Active transactions
SELECT 
    pid,
    usename,
    state,
    xact_start,
    now() - xact_start as transaction_duration,
    query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start;

-- Blocking queries (who is blocking whom)
SELECT 
    blocked_locks.pid AS blocked_pid,
    blocked_activity.usename AS blocked_user,
    blocking_locks.pid AS blocking_pid,
    blocking_activity.usename AS blocking_user,
    blocked_activity.query AS blocked_statement,
    blocking_activity.query AS blocking_statement,
    blocked_activity.application_name AS blocked_application,
    blocking_activity.application_name AS blocking_application
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

-- =====================================================
-- 7. TRADING-SPECIFIC MONITORING
-- =====================================================

-- Orders per user (activity analysis)
SELECT 
    u.email,
    COUNT(o.id) as total_orders,
    COUNT(CASE WHEN o.status = 'EXECUTED' THEN 1 END) as executed,
    COUNT(CASE WHEN o.status = 'REJECTED' THEN 1 END) as rejected,
    COUNT(CASE WHEN o.status = 'CANCELLED' THEN 1 END) as cancelled,
    AVG(EXTRACT(EPOCH FROM (o.execution_time - o.created_at))) as avg_execution_time
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.email
ORDER BY total_orders DESC;

-- Recent signals (last 24 hours)
SELECT 
    s.id,
    s.symbol,
    s.action,
    s.confidence,
    s.signal_status,
    s.created_at,
    COUNT(o.id) as order_count
FROM signals s
LEFT JOIN orders o ON s.id = o.signal_id
WHERE s.created_at > now() - interval '24 hours'
GROUP BY s.id
ORDER BY s.created_at DESC;

-- Position analysis
SELECT 
    u.email,
    p.symbol,
    p.quantity,
    p.avg_price,
    p.current_price,
    p.market_value,
    p.unrealized_pnl,
    CASE 
        WHEN p.current_price IS NOT NULL 
        THEN round(((p.current_price - p.avg_price) / p.avg_price * 100), 2)
        ELSE NULL 
    END as pnl_percentage
FROM positions p
JOIN users u ON p.user_id = u.id
ORDER BY p.market_value DESC;

-- =====================================================
-- 8. MAINTENANCE STATUS
-- =====================================================

-- Bloat analysis (how much wasted space in tables)
SELECT
    schemaname,
    tablename,
    ROUND(100.0 * (pg_relation_size(schemaname||'.'||tablename) - 
           pg_relation_size(schemaname||'.'||tablename, 'main')) / 
           pg_relation_size(schemaname||'.'||tablename), 2) as bloat_ratio
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY bloat_ratio DESC;

-- Vacuum statistics
SELECT 
    schemaname,
    tablename,
    last_vacuum,
    last_autovacuum,
    n_live_tup,
    n_dead_tup
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 10;

-- Autovacuum activity
SELECT 
    datname,
    COUNT(*) as autovacuum_workers
FROM pg_stat_activity
WHERE query LIKE '%autovacuum%'
GROUP BY datname;

-- =====================================================
-- 9. SYSTEM RESOURCE USAGE
-- =====================================================

-- Checkpoint information
SELECT 
    checkpoints_timed,
    checkpoints_req,
    checkpoint_write_time,
    checkpoint_sync_time,
    buffers_checkpoint,
    buffers_clean,
    buffers_backend
FROM pg_stat_bgwriter;

-- =====================================================
-- 10. REPLICATION STATUS (Production)
-- =====================================================

-- Replication lag
SELECT 
    client_addr,
    state,
    pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) as replication_lag_bytes,
    ROUND(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)::numeric / 1024 / 1024, 2) as lag_mb
FROM pg_stat_replication;
