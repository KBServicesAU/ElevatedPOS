# Runbook 03 — RDS backup restore drill

## Why this matters

RDS automated backups run on the schedule defined in
`infrastructure/terraform/main.tf` (default 7-day retention with daily
snapshots). They are **untested** until we actually restore one. A
backup that doesn't restore is not a backup. Doing the drill once
before go-live, and again every quarter, gives you a real RTO/RPO
number you can quote to compliance.

## Prerequisites

- AWS CLI authenticated as a role with `rds:RestoreDBInstanceFromDBSnapshot`
  and `rds:DescribeDBSnapshots`.
- `psql` installed locally (or use a temporary EC2 in the VPC).
- ~1 hour wall clock.

## Drill

### 1. List recent automated snapshots

```bash
aws rds describe-db-snapshots \
  --db-instance-identifier elevatedpos-prod \
  --snapshot-type automated \
  --max-records 10 \
  --query 'reverse(sort_by(DBSnapshots,&SnapshotCreateTime))[].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --output table
```

Pick the most recent `available` snapshot — call its identifier $SNAP.

### 2. Restore to a NEW instance (don't overwrite prod)

```bash
SNAP="rds:elevatedpos-prod-2026-04-28-..."   # paste from previous step
TARGET="elevatedpos-restore-drill-$(date +%Y%m%d)"

aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier "$TARGET" \
  --db-snapshot-identifier "$SNAP" \
  --db-instance-class db.t3.medium \
  --no-publicly-accessible \
  --vpc-security-group-ids "$(aws rds describe-db-instances \
    --db-instance-identifier elevatedpos-prod \
    --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' --output text)" \
  --db-subnet-group-name "$(aws rds describe-db-instances \
    --db-instance-identifier elevatedpos-prod \
    --query 'DBInstances[0].DBSubnetGroup.DBSubnetGroupName' --output text)"
```

Wait until `available` (~10-15 min on db.t3.medium):

```bash
aws rds wait db-instance-available --db-instance-identifier "$TARGET"
echo "restored at $(date)"
```

### 3. Sanity-check the data

Get the endpoint:

```bash
ENDPOINT=$(aws rds describe-db-instances --db-instance-identifier "$TARGET" \
  --query 'DBInstances[0].Endpoint.Address' --output text)
```

From a pod inside the VPC (the restored instance is private):

```bash
POD=$(kubectl get pods -n elevatedpos -l app=auth --field-selector status.phase=Running --no-headers | head -1 | awk '{print $1}')

# Use the same password as prod (the snapshot retains the original master pw)
kubectl exec -n elevatedpos "$POD" -- env PGPASSWORD="$DB_PASSWORD" psql \
  "host=$ENDPOINT user=postgres dbname=elevatedpos sslmode=no-verify" \
  -c "SELECT
        (SELECT COUNT(*) FROM organisations) AS orgs,
        (SELECT COUNT(*) FROM employees)     AS employees,
        (SELECT COUNT(*) FROM orders)        AS orders,
        (SELECT MAX(created_at) FROM orders) AS latest_order;"
```

Compare counts and latest_order timestamp with prod (run the same query
against `elevatedpos-prod`). The numbers should differ only by however
much activity happened between snapshot time and now.

### 4. Document the RPO/RTO numbers

Record:
- Snapshot age at time of restore: `<snap_create_time>` → `<now>` =
  ___ minutes. This is your RPO floor (how much data loss in a real
  disaster).
- Wall clock from `restore-db-instance-from-db-snapshot` to
  `available`: ___ minutes. This is your RTO floor.

For a `db.t3.medium` with our current data volume, expect RTO around
12-20 minutes and RPO around 0-24 hours depending on snapshot timing
(automated snapshots run during the configured backup window).

### 5. Tear down the drill instance

```bash
aws rds delete-db-instance \
  --db-instance-identifier "$TARGET" \
  --skip-final-snapshot
```

The instance is private, so it doesn't attract traffic — but leaving
restore drills running costs ~$50/month each.

## After the drill

If anything in step 3 surprised you (counts way off, missing tables,
auth credentials no longer match), the prod backup retention policy
isn't actually fit for purpose. Investigate before going live.

If the drill passed cleanly, set a calendar reminder to repeat it every
3 months and after any major schema migration.
