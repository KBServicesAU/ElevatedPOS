# ── DNS & SSL ─────────────────────────────────────────────────────────────────

variable "create_hosted_zone" {
  description = "Set to false if the Route53 hosted zone already exists"
  type        = bool
  default     = true
}

# Route 53 hosted zone (create or look up existing)
resource "aws_route53_zone" "primary" {
  count = var.create_hosted_zone ? 1 : 0
  name  = var.domain_name

  tags = {
    Project     = "elevatedpos"
    Environment = var.environment
  }
}

data "aws_route53_zone" "primary" {
  count        = var.create_hosted_zone ? 0 : 1
  name         = var.domain_name
  private_zone = false
}

locals {
  zone_id = var.create_hosted_zone ? aws_route53_zone.primary[0].zone_id : data.aws_route53_zone.primary[0].zone_id
}

# ACM wildcard certificate (us-east-1 required for CloudFront, ap-southeast-2 for ALB)
resource "aws_acm_certificate" "wildcard" {
  provider          = aws.ap-southeast-2
  domain_name       = var.domain_name
  subject_alternative_names = [
    "*.${var.domain_name}",
    "api.${var.domain_name}",
    "app.${var.domain_name}",
  ]
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Project     = "elevatedpos"
    Environment = var.environment
  }
}

# DNS validation records
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.wildcard.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = local.zone_id
}

resource "aws_acm_certificate_validation" "wildcard" {
  provider                = aws.ap-southeast-2
  certificate_arn         = aws_acm_certificate.wildcard.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]

  timeouts {
    create = "30m"
  }
}

# A record: apex domain → ALB
resource "aws_route53_record" "apex" {
  zone_id = local.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.elevatedpos.dns_name
    zone_id                = aws_lb.elevatedpos.zone_id
    evaluate_target_health = true
  }
}

# A record: app subdomain → ALB (backoffice)
resource "aws_route53_record" "app" {
  zone_id = local.zone_id
  name    = "app.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.elevatedpos.dns_name
    zone_id                = aws_lb.elevatedpos.zone_id
    evaluate_target_health = true
  }
}

# A record: www subdomain → ALB (marketing site)
resource "aws_route53_record" "www" {
  zone_id = local.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.elevatedpos.dns_name
    zone_id                = aws_lb.elevatedpos.zone_id
    evaluate_target_health = true
  }
}

# A record: godmode subdomain → ALB (platform super-admin)
resource "aws_route53_record" "godmode" {
  zone_id = local.zone_id
  name    = "godmode.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.elevatedpos.dns_name
    zone_id                = aws_lb.elevatedpos.zone_id
    evaluate_target_health = true
  }
}

# A record: organisation subdomain → ALB (support staff portal)
resource "aws_route53_record" "organisation" {
  zone_id = local.zone_id
  name    = "organisation.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.elevatedpos.dns_name
    zone_id                = aws_lb.elevatedpos.zone_id
    evaluate_target_health = true
  }
}

# A record: reseller subdomain → ALB (reseller portal)
resource "aws_route53_record" "reseller" {
  zone_id = local.zone_id
  name    = "reseller.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.elevatedpos.dns_name
    zone_id                = aws_lb.elevatedpos.zone_id
    evaluate_target_health = true
  }
}

# A record: api subdomain → ALB
resource "aws_route53_record" "api" {
  zone_id = local.zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.elevatedpos.dns_name
    zone_id                = aws_lb.elevatedpos.zone_id
    evaluate_target_health = true
  }
}

output "nameservers" {
  description = "Route53 nameservers — point your domain registrar to these"
  value       = var.create_hosted_zone ? aws_route53_zone.primary[0].name_servers : []
}

output "certificate_arn" {
  description = "ACM certificate ARN to use in ALB listener"
  value       = aws_acm_certificate_validation.wildcard.certificate_arn
}

output "zone_id" {
  description = "Route53 hosted zone ID"
  value       = local.zone_id
}
