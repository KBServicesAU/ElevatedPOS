# ─── RDS PostgreSQL ───────────────────────────────────────────────────────────
# NOTE: The primary RDS instance, subnet group, and security group are defined
# in main.tf. This file contains read replicas and parameter group tuning for
# production deployments.

# ─── Parameter Group ──────────────────────────────────────────────────────────

resource "aws_db_parameter_group" "elevatedpos" {
  name   = "elevatedpos-${var.environment}-pg16"
  family = "postgres16"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_duration"
    value = "0"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  parameter {
    name         = "max_connections"
    value        = "200"
    apply_method = "pending-reboot"
  }
}

# ─── RDS Read Replica (production only) ───────────────────────────────────────

resource "aws_db_instance" "nexus_replica" {
  count = var.environment == "prod" ? 1 : 0

  identifier          = "elevatedpos-${var.environment}-replica"
  replicate_source_db = aws_db_instance.elevatedpos.identifier

  instance_class    = var.db_instance_class
  storage_encrypted = true

  publicly_accessible = false
  skip_final_snapshot = true

  parameter_group_name = aws_db_parameter_group.elevatedpos.name

  performance_insights_enabled = true

  tags = {
    Name = "elevatedpos-${var.environment}-replica"
  }
}

# ─── RDS Proxy (connection pooling) ───────────────────────────────────────────

resource "aws_iam_role" "rds_proxy" {
  name = "elevatedpos-rds-proxy-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "rds.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "rds_proxy_secrets" {
  name = "elevatedpos-rds-proxy-secrets"
  role = aws_iam_role.rds_proxy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:elevatedpos/rds*"
    }]
  })
}

resource "aws_db_proxy" "elevatedpos" {
  name                   = "elevatedpos-${var.environment}"
  engine_family          = "POSTGRESQL"
  idle_client_timeout    = 1800
  require_tls            = true
  role_arn               = aws_iam_role.rds_proxy.arn
  vpc_security_group_ids = [aws_security_group.rds.id]
  vpc_subnet_ids         = module.vpc.private_subnets

  auth {
    auth_scheme = "SECRETS"
    description = "RDS master credentials"
    iam_auth    = "DISABLED"
    secret_arn  = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:elevatedpos/rds-credentials"
  }
}

resource "aws_db_proxy_default_target_group" "elevatedpos" {
  db_proxy_name = aws_db_proxy.elevatedpos.name

  connection_pool_config {
    connection_borrow_timeout    = 120
    max_connections_percent      = 100
    max_idle_connections_percent = 50
  }
}

resource "aws_db_proxy_target" "elevatedpos" {
  db_instance_identifier = aws_db_instance.elevatedpos.identifier
  db_proxy_name          = aws_db_proxy.elevatedpos.name
  target_group_name      = aws_db_proxy_default_target_group.elevatedpos.name
}

# ─── RDS Snapshot (manual baseline) ──────────────────────────────────────────

resource "aws_db_snapshot" "nexus_baseline" {
  count = var.environment == "prod" ? 1 : 0

  db_instance_identifier = aws_db_instance.elevatedpos.identifier
  db_snapshot_identifier = "elevatedpos-${var.environment}-baseline"

  lifecycle {
    ignore_changes = [db_snapshot_identifier]
  }
}
