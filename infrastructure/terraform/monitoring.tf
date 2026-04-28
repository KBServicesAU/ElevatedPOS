# ═══════════════════════════════════════════════════════════════════════════════
# Monitoring + alerts (v2.7.61)
# ═══════════════════════════════════════════════════════════════════════════════
#
# Baseline CloudWatch alarms + SNS alert pipeline. Fires on the things that
# would actually keep a merchant from selling — RDS pegged, MSK disk full,
# auth pods crashlooping, ALB returning 5xx storms — before customers find
# them for us.
#
# Subscription target is a single email by default (var.alert_email). When
# you're ready, layer Opsgenie / PagerDuty by adding an additional
# `aws_sns_topic_subscription` per channel; the alarm-evaluation logic
# stays in this file so any alert auto-fans-out to every subscribed channel.
#
# Thresholds are intentionally conservative for a brand-new prod cluster.
# Tune downward (= more sensitive) once we have a few weeks of baseline
# metrics — the "warning vs page" distinction wants real data to inform it.

# ─── Variables ───────────────────────────────────────────────────────────────

variable "alert_email" {
  description = "Email address that receives CloudWatch alarm notifications. Set in terraform.tfvars."
  type        = string
  default     = ""
}

# ─── SNS topic + subscription ────────────────────────────────────────────────

resource "aws_sns_topic" "alerts" {
  name = "elevatedpos-alerts-${var.environment}"

  tags = {
    Environment = var.environment
    Purpose     = "CloudWatch alarm notifications"
  }
}

# Email subscription — created only when alert_email is set, so a fresh
# `terraform apply` on a workspace without the variable doesn't fail.
resource "aws_sns_topic_subscription" "alerts_email" {
  count     = var.alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ─── RDS alarms ──────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {
  alarm_name          = "elevatedpos-${var.environment}-rds-cpu-high"
  alarm_description   = "RDS CPU > 80% for 10 minutes — Postgres can't keep up with load. Either traffic spike or a runaway query; check `pg_stat_activity`."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.elevatedpos.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "rds_storage_low" {
  alarm_name          = "elevatedpos-${var.environment}-rds-storage-low"
  alarm_description   = "RDS free storage < 10 GB — auto-scale will eventually catch this but not before slow queries / write blockage if WAL spills."
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 10 * 1024 * 1024 * 1024 # 10 GiB in bytes
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.elevatedpos.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "rds_connections_high" {
  alarm_name          = "elevatedpos-${var.environment}-rds-connections-high"
  alarm_description   = "DatabaseConnections > 80 for 5 minutes — a service is leaking connections or pgbouncer config is wrong."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.elevatedpos.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# ─── MSK alarms ──────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "msk_disk_high" {
  alarm_name          = "elevatedpos-${var.environment}-msk-disk-high"
  alarm_description   = "MSK broker disk > 80% — log retention or topic count too aggressive; broker will start rejecting writes when it hits 100%."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "KafkaDataLogsDiskUsed"
  namespace           = "AWS/Kafka"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"

  dimensions = {
    "Cluster Name" = aws_msk_cluster.elevatedpos.cluster_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# ─── ALB alarms ──────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "alb_5xx_high" {
  alarm_name          = "elevatedpos-${var.environment}-alb-5xx-high"
  alarm_description   = "ALB returning > 20 HTTP 5xx responses in 5 minutes. Almost always a backend service crashing or out of capacity — check pod status + recent deploys."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 20
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.elevatedpos.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "alb_target_unhealthy" {
  alarm_name          = "elevatedpos-${var.environment}-alb-targets-unhealthy"
  alarm_description   = "ALB has unhealthy targets — typically pods failing health checks during a botched deploy. If sustained, foreground traffic is being routed to fewer replicas."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.elevatedpos.arn_suffix
    TargetGroup  = aws_lb_target_group.elevatedpos.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# ─── Outputs ─────────────────────────────────────────────────────────────────

output "alerts_topic_arn" {
  description = "SNS topic ARN for CloudWatch alerts. Subscribe additional channels (PagerDuty, Slack via Lambda, etc.) here."
  value       = aws_sns_topic.alerts.arn
}
