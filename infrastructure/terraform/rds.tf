# ─── RDS PostgreSQL ───────────────────────────────────────────────────────────
# NOTE: The primary RDS instance, subnet group, and security group are defined
# in main.tf. This file contains parameter group tuning.

# ─── Parameter Group ──────────────────────────────────────────────────────────

resource "aws_db_parameter_group" "elevatedpos" {
  name   = "elevatedpos-${var.environment}-pg16"
  family = "postgres16"

  parameter {
    name         = "log_connections"
    value        = "1"
    apply_method = "immediate"
  }

  parameter {
    name         = "log_disconnections"
    value        = "1"
    apply_method = "immediate"
  }

  parameter {
    name         = "log_duration"
    value        = "0"
    apply_method = "immediate"
  }

  parameter {
    name         = "log_min_duration_statement"
    value        = "1000"
    apply_method = "immediate"
  }

  # shared_preload_libraries is a static parameter — requires pending-reboot
  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "max_connections"
    value        = "200"
    apply_method = "pending-reboot"
  }
}
