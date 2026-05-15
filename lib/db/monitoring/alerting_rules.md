# PostgreSQL Alerting Rules & Monitoring Dashboard

## Alert Configuration for Trading Platform

### 1. Critical Alerts (Immediate Action Required)

#### Connection Limit Exceeded
```
Condition: Active connections > 90% of max_connections
Threshold: 90 out of 100 connections
Action: Investigate and terminate idle connections, increase pool size
Severity: CRITICAL
```

#### Replication Lag (Production)
```
Condition: Replication lag > 100 MB
Threshold: 104857600 bytes
Action: Check network, database load, replica health
Severity: CRITICAL
```

#### Query Deadlock Detected
```
Condition: Deadlock detected in logs
Threshold: Any occurrence
Action: Review conflicting queries, adjust transaction isolation level
Severity: CRITICAL
```

#### Disk Space Low
```
Condition: Used disk space > 85%
Threshold: 85% of available storage
Action: Add storage, archive old data, clean logs
Severity: CRITICAL
```

#### Database Unavailable
```
Condition: Connection refused or timeout
Threshold: Database unreachable for 30 seconds
Action: Check database service, network connectivity, firewall
Severity: CRITICAL
```

### 2. Warning Alerts (Monitor & Plan)

#### High Query Latency
```
Condition: Average query time > 1 second
Threshold: 1000 ms
Action: Analyze slow queries, add indexes, optimize code
Severity: WARNING
```

#### Cache Hit Ratio Low
```
Condition: Cache hit ratio < 90%
Threshold: Below 90%
Action: Increase shared_buffers, add missing indexes, optimize queries
Severity: WARNING
```

#### Table Bloat High
```
Condition: Table bloat > 30%
Threshold: 30% wasted space
Action: Schedule VACUUM FULL during maintenance window
Severity: WARNING
```

#### Long Running Transaction
```
Condition: Transaction duration > 5 minutes
Threshold: 300 seconds
Action: Investigate query, check for locks, optimize transaction
Severity: WARNING
```

#### Autovacuum Falling Behind
```
Condition: Dead tuples > 10% of live tuples
Threshold: ratio > 0.1
Action: Increase autovacuum frequency, increase cost limits
Severity: WARNING
```

#### Unused Indexes
```
Condition: Index with 0 scans for > 30 days
Threshold: No usage over 30 days
Action: Review if index is needed, drop if unused
Severity: INFO (low priority)
```

### 3. Performance Baselines

#### Expected Metrics

| Metric | Dev | Production |
|--------|-----|------------|
| Cache Hit Ratio | > 95% | > 98% |
| Query Latency (p99) | < 100ms | < 50ms |
| Connection Pool | < 20 connections | 40-60 active |
| Replication Lag | N/A | < 10 MB |
| Disk I/O Utilization | < 30% | < 50% |
| Checkpoint Duration | < 5 seconds | < 10 seconds |

### 4. Monitoring Dashboard Queries

#### Dashboard 1: System Health
```sql
-- Primary metrics
SELECT 
    'Database' as component,
    CASE 
        WHEN (SELECT numbackends FROM pg_stat_database WHERE datname = current_database()) < 90 
        THEN 'HEALTHY'
        ELSE 'WARNING'
    END as status,
    (SELECT pg_database_size(current_database())) as size_bytes,
    (SELECT count(*) FROM pg_stat_activity WHERE state != 'idle') as active_queries
UNION ALL
SELECT 
    'Replication',
    CASE WHEN max_lag < 104857600 THEN 'HEALTHY' ELSE 'WARNING' END,
    max_lag,
    count(*)
FROM (
    SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) as max_lag
    FROM pg_stat_replication
) t
GROUP BY max_lag
UNION ALL
SELECT
    'Storage',
    CASE WHEN free_space > 0.15 THEN 'HEALTHY' ELSE 'CRITICAL' END,
    pg_database_size(current_database()),
    0
FROM pg_tablespace_size(current_database()) t
CROSS JOIN LATERAL (
    SELECT (1.0 - pg_database_size(current_database())::float / 
            pg_tablespace_size('pg_default')::float) as free_space
) f;
```

#### Dashboard 2: Top Queries
```sql
-- Real-time query performance
SELECT 
    LEFT(query, 60) as query_snippet,
    calls,
    round(mean_time::numeric, 2) as avg_ms,
    round(total_time::numeric / 1000, 2) as total_sec,
    calls * round(mean_time::numeric / 1000, 2) as cumulative_time
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
  AND query NOT LIKE '%information_schema%'
ORDER BY mean_time DESC
LIMIT 10;
```

#### Dashboard 3: Table Activity
```sql
-- Trading table activity (last 24 hours)
SELECT 
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch,
    n_tup_ins,
    n_tup_upd,
    n_tup_del
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND last_seq_scan > now() - interval '24 hours'
ORDER BY seq_scan DESC;
```

### 5. Alert Configuration (for external monitoring tools)

#### Prometheus Metrics
```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:9187']  # postgres_exporter
```

#### Grafana Dashboard JSON
```json
{
  "dashboard": {
    "title": "Trading Platform - PostgreSQL",
    "panels": [
      {
        "title": "Active Connections",
        "targets": [
          {
            "expr": "pg_stat_activity_total"
          }
        ]
      },
      {
        "title": "Cache Hit Ratio",
        "targets": [
          {
            "expr": "rate(pg_stat_database_blks_hit[5m]) / (rate(pg_stat_database_blks_hit[5m]) + rate(pg_stat_database_blks_read[5m]))"
          }
        ]
      },
      {
        "title": "Query Latency (p99)",
        "targets": [
          {
            "expr": "histogram_quantile(0.99, pg_statement_duration_seconds)"
          }
        ]
      }
    ]
  }
}
```

### 6. Alert Escalation Policy

**Severity Levels:**
- 🔴 **CRITICAL**: Immediate action required, page on-call
- 🟠 **WARNING**: Monitor closely, action within 1 hour
- 🟡 **INFO**: Log for review, action within 1 day

**Escalation:**
```
CRITICAL Alerts:
  ├─ Immediate: Slack #trading-incidents
  ├─ 5 min: Page on-call engineer
  ├─ 15 min: Escalate to engineering manager
  └─ 30 min: Escalate to VP Engineering

WARNING Alerts:
  ├─ Slack #trading-monitoring
  ├─ Create ticket
  └─ Schedule within 24 hours
```

### 7. Monthly Health Review

**Review Schedule:** First Tuesday of each month

**Items to Review:**
- [ ] Query performance trends
- [ ] Index effectiveness
- [ ] Storage usage growth
- [ ] Backup success rate
- [ ] Replication lag trends (prod)
- [ ] User activity patterns
- [ ] False alert rate

**Actions:**
- Update baselines if needed
- Adjust alert thresholds
- Plan optimization work
- Update runbooks
