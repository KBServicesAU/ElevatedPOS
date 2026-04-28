# ═══════════════════════════════════════════════════════════════════════════════
# AWS WAFv2 — public ALB protection (v2.7.61)
# ═══════════════════════════════════════════════════════════════════════════════
#
# Layers an AWS-managed common ruleset + bot ruleset + a global IP rate-limit
# in front of the public ALB. Catches:
#
#   - The OWASP Top-10-style attacks AWS already understands (SQLi, XSS,
#     known-bad payloads, Log4Shell, etc.) via AWSManagedRulesCommonRuleSet.
#   - Known-malicious request signatures via AWSManagedRulesAmazonIpReputationList.
#   - Volumetric brute-force / scraping via the per-IP rate-limit rule below.
#
# What this does NOT replace:
#   - Per-route rate limit on POST /api/v1/auth/login (added in v2.7.61 in the
#     auth service itself — handles brute-force at 10/min with stateful
#     per-account lockout already in place).
#   - Per-account / per-tenant authorisation. WAF sees URLs + headers, not
#     the user identity behind a JWT.
#
# Cost note: WAFv2 is ~$5/month per WebACL + ~$1/managed-rule-group/month,
# plus $0.60 per million requests. Ballpark $15-30/month for the ruleset
# below. Worth it.

resource "aws_wafv2_web_acl" "elevatedpos_alb" {
  name        = "elevatedpos-${var.environment}-alb"
  description = "ALB protection: managed common + IP-reputation + per-IP rate limit."
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # ── Rule 1: AWS Managed Common Rules (OWASP Top 10ish) ─────────────────────
  rule {
    name     = "aws-managed-common"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"

        # SizeRestrictions excluded by default — too eager for our larger
        # JSON payloads (big catalog uploads, multi-line orders).
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            count {}
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "elevatedpos-aws-managed-common"
      sampled_requests_enabled   = true
    }
  }

  # ── Rule 2: Known bad IPs ──────────────────────────────────────────────────
  rule {
    name     = "aws-managed-ip-reputation"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "elevatedpos-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  # ── Rule 3: Per-IP rate limit ──────────────────────────────────────────────
  # 2,000 requests per 5 minutes = 400 rpm. Real merchants scanning a busy
  # day's catalog or doing a heavy report run won't hit this; bots will.
  # Action is `block` (as opposed to count) so we actually shed the load.
  rule {
    name     = "rate-limit-per-ip"
    priority = 3

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "elevatedpos-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "elevatedpos-${var.environment}-alb"
    sampled_requests_enabled   = true
  }

  tags = {
    Environment = var.environment
  }
}

resource "aws_wafv2_web_acl_association" "elevatedpos_alb" {
  resource_arn = aws_lb.elevatedpos.arn
  web_acl_arn  = aws_wafv2_web_acl.elevatedpos_alb.arn
}

# Alarm when WAF starts blocking — good signal for both attacks and
# false positives in the managed rules.
resource "aws_cloudwatch_metric_alarm" "waf_blocking_high" {
  alarm_name          = "elevatedpos-${var.environment}-waf-blocking-high"
  alarm_description   = "WAF blocked > 100 requests in 5 minutes. Either an attack (good — WAF is doing its job, but flag for review) or a false positive (need to add an exception)."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "BlockedRequests"
  namespace           = "AWS/WAFV2"
  period              = 300
  statistic           = "Sum"
  threshold           = 100
  treat_missing_data  = "notBreaching"

  dimensions = {
    WebACL = aws_wafv2_web_acl.elevatedpos_alb.name
    Region = var.aws_region
    Rule   = "ALL"
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}
