# Trading Platform Database Documentation

## Overview

This directory contains the complete database setup for the high-end algorithmic trading platform, including:

- Schema definitions and migrations
- Connection pooling configuration  
- Row-Level Security (RLS) policies
- Backup and restore scripts
- Monitoring and alerting rules

## Structure

```
lib/db/
├── migrations/
│   ├── 001_initial_schema.sql          # Core table definitions
│   └── 002_rls_policies.sql            # Row-level security policies
├── scripts/
│   ├── backup.sh                       # Automated backup script
│   └── restore.sh                      # Database restore script
├── monitoring/
│   ├── health_checks.sql               # Health check queries
│   └── alerting_rules.md               # Alert configuration
├── drizzle.config.ts                   # Drizzle ORM config
├── package.json                        # Database package
└── src/
    ├── index.ts                        # Database client
    └── schema/
        └── index.ts                    # Table definitions
```

## Quick Start

### 1. Development Setup

```bash
# Set environment variable
export DATABASE_URL="postgresql://trading_dev_user:dev_password@localhost:5432/trading_dev"

# Create database
createdb trading_dev

# Run migrations
cd lib/db
pnpm install
pnpm run push
```

### 2. Production Setup

```bash
# Set environment variable
export DATABASE_URL="postgresql://trading_prod_user:${PROD_DB_PASSWORD}@trading-db-prod.internal:5432/trading_prod"

# Run migrations (from CI/CD pipeline)
pnpm --filter @workspace/db run push
```

## Database Configuration

### Development Environment

| Setting | Value |
|---------|-------|
| Host | localhost |
| Port | 5432 |
| Database | trading_dev |
| User | trading_dev_user |
| Pool Size | 5-20 connections |
| Backup Retention | 7 days |

### Production Environment

| Setting | Value |
|---------|-------|
| Host | trading-db-prod.internal |
| Port | 5432 |
| Database | trading_prod |
| User | trading_prod_user |
| Pool Size | 20-100 connections |
| Backup Retention | 30 days |
| SSL | Required |
| Replication | Primary + Standby |

## Tables

### Core Tables

- **users**: Multi-tenant user accounts
- **trading_accounts**: Broker-linked accounts  
- **strategies**: Trading strategy definitions
- **signals**: Generated trading signals
- **orders**: Executed orders
- **positions**: Current open positions
- **daily_performance**: Daily P&L and metrics
- **risk_limits**: Per-user risk configuration
- **audit_log**: Compliance audit trail

### Maintenance Tables

- **trade_history**: Closed trades archive
- **market_data_cache**: Real-time market data
- **system_health**: System diagnostics

## Security

### Row-Level Security (RLS)

All user data tables have RLS enabled to ensure multi-tenant data isolation:

- Users can only see their own data
- Service accounts (backend) have unrestricted access
- Admin users can see compliance/audit data

### Encryption

- API credentials are encrypted at application level
- Database uses SSL connections (production)
- Backups are encrypted with AES-256

### Access Control

- Development: Local access only
- Production: Restricted to application servers
- Backups: Stored in S3 with IAM restrictions

## Backup & Recovery

### Automated Backups

**Development:**
```bash
# Daily at 2 AM
0 2 * * * /path/to/backup.sh dev
```

**Production:**
```bash
# Hourly backups
0 * * * * /path/to/backup.sh prod

# Daily full backup
0 2 * * * /path/to/backup.sh prod
```

### Manual Backup

```bash
./scripts/backup.sh [dev|prod]
```

### Restore Database

```bash
./scripts/restore.sh prod trading_prod_full_20260515_020000.sql.gz
```

## Monitoring

### Health Checks

Run health check queries regularly:

```bash
# Connect to database
psql -h localhost -U trading_dev_user -d trading_dev

# Run health checks
\i monitoring/health_checks.sql
```

### Key Metrics

Monitor these metrics continuously:

- **Cache Hit Ratio**: Should be > 95% (dev) / > 98% (prod)
- **Query Latency**: p99 < 100ms (dev) / < 50ms (prod)
- **Replication Lag**: < 10 MB (prod only)
- **Disk Usage**: < 80%
- **Active Connections**: < 90% of max

### Alerts

See `monitoring/alerting_rules.md` for:
- Alert thresholds
- Escalation policies
- Dashboard queries
- Grafana configuration

## Performance Tuning

### Index Strategy

Indexes are created on:
- Foreign keys
- Frequently searched columns
- Date columns for range queries
- Status columns

### Query Optimization

Common queries are optimized with:
- Proper indexes
- Query hints
- Connection pooling
- Prepared statements (via Drizzle ORM)

### Connection Pooling

**Development:**
```
min_pool_size: 5
max_pool_size: 20
idle_timeout: 30s
```

**Production:**
```
min_pool_size: 20
max_pool_size: 100
idle_timeout: 60s
```

## Disaster Recovery

### Recovery Time Objectives (RTO)

- Development: 4 hours
- Production: 15 minutes (RPO: < 1 hour)

### Recovery Point Objectives (RPO)

- Development: 24 hours
- Production: 1 hour

### Procedures

1. **Detect failure**: Automated alerts trigger
2. **Assess damage**: Check backup integrity
3. **Prepare recovery**: Set up new instance
4. **Execute restore**: Run restore script
5. **Verify data**: Run health checks
6. **Resume operations**: Point application to new DB

See `scripts/restore.sh` for detailed procedures.

## Migration & Deployment

### Schema Migrations

Run Drizzle migrations during deployment:

```bash
pnpm --filter @workspace/db run push
```

Or force schema push:

```bash
pnpm --filter @workspace/db run push-force
```

### Zero-Downtime Deployments

- Migrations run before app deployment
- Connection pooling maintains availability
- Read replicas for read-heavy workloads

## Troubleshooting

### Common Issues

**Connection Refused:**
- Check DATABASE_URL is set correctly
- Verify PostgreSQL service is running
- Check network/firewall access

**Slow Queries:**
- Run health checks to identify bottlenecks
- Check index usage
- Review query plan with EXPLAIN

**Replication Lag:**
- Check network latency
- Verify replica resources
- Check for long transactions on primary

### Support

For issues:
1. Check monitoring/alerting_rules.md
2. Run health_checks.sql
3. Review database logs
4. Contact database team

## Documentation References

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Drizzle ORM Guide](https://orm.drizzle.team/)
- [pg Node.js Driver](https://node-postgres.com/)
- [Connection Pooling Best Practices](https://wiki.postgresql.org/wiki/Number_Of_Database_Connections)

## Maintenance Schedule

- **Daily**: Automated backups
- **Weekly**: Index maintenance check
- **Monthly**: Full health review and optimization
- **Quarterly**: Capacity planning review
- **Annually**: Disaster recovery drill

## Contact

- Database Team: #database-team on Slack
- On-Call: [PagerDuty link]
- Documentation: Internal wiki
