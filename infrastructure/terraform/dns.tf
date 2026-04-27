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

# Data source: look up the nginx ingress NLB created by the k8s ingress controller
data "aws_lb" "nginx_nlb" {
  name = "a4b8e8594643a4a40b931c4d76d5f397"
}

# A record: apex domain → nginx NLB
resource "aws_route53_record" "apex" {
  zone_id = local.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = data.aws_lb.nginx_nlb.dns_name
    zone_id                = data.aws_lb.nginx_nlb.zone_id
    evaluate_target_health = true
  }
}

# A record: www subdomain → nginx NLB
resource "aws_route53_record" "www" {
  zone_id = local.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = data.aws_lb.nginx_nlb.dns_name
    zone_id                = data.aws_lb.nginx_nlb.zone_id
    evaluate_target_health = true
  }
}

# A record: app subdomain → nginx NLB (backoffice)
resource "aws_route53_record" "app" {
  zone_id = local.zone_id
  name    = "app.${var.domain_name}"
  type    = "A"

  alias {
    name                   = data.aws_lb.nginx_nlb.dns_name
    zone_id                = data.aws_lb.nginx_nlb.zone_id
    evaluate_target_health = true
  }
}

# A record: api subdomain → nginx NLB
resource "aws_route53_record" "api" {
  zone_id = local.zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = data.aws_lb.nginx_nlb.dns_name
    zone_id                = data.aws_lb.nginx_nlb.zone_id
    evaluate_target_health = true
  }
}

# A record: site subdomain → nginx NLB (customer-facing merchant storefronts)
# v2.7.51-F2 — every merchant gets a public site at site.elevatedpos.com.au/<slug>.
# The matching ingress rule routes to the storefront service on port 3002.
resource "aws_route53_record" "site" {
  zone_id = local.zone_id
  name    = "site.${var.domain_name}"
  type    = "A"

  alias {
    name                   = data.aws_lb.nginx_nlb.dns_name
    zone_id                = data.aws_lb.nginx_nlb.zone_id
    evaluate_target_health = true
  }
}

# A record: godmode subdomain → nginx NLB (platform super-admin)
resource "aws_route53_record" "godmode" {
  zone_id = local.zone_id
  name    = "godmode.${var.domain_name}"
  type    = "A"

  alias {
    name                   = data.aws_lb.nginx_nlb.dns_name
    zone_id                = data.aws_lb.nginx_nlb.zone_id
    evaluate_target_health = true
  }
}

# A record: organisation subdomain → nginx NLB (support staff portal)
resource "aws_route53_record" "organisation" {
  zone_id = local.zone_id
  name    = "organisation.${var.domain_name}"
  type    = "A"

  alias {
    name                   = data.aws_lb.nginx_nlb.dns_name
    zone_id                = data.aws_lb.nginx_nlb.zone_id
    evaluate_target_health = true
  }
}

# A record: reseller subdomain → nginx NLB (reseller portal)
resource "aws_route53_record" "reseller" {
  zone_id = local.zone_id
  name    = "reseller.${var.domain_name}"
  type    = "A"

  alias {
    name                   = data.aws_lb.nginx_nlb.dns_name
    zone_id                = data.aws_lb.nginx_nlb.zone_id
    evaluate_target_health = true
  }
}

# ── Email sending DNS (Resend on email.elevatedpos.com.au) ────────────────────
#
# We send transactional email (order confirmations, receipts, pickup-ready
# notifications, password resets, etc.) via Resend. Resend requires:
#
#   1. SPF — TXT record on the sending subdomain authorising Amazon SES
#      (Resend's backing mailer for AU region) to send mail for us.
#   2. DKIM — three CNAME records pointing to DKIM keys Resend publishes
#      for the sending domain. These must be added in the Resend dashboard
#      FIRST (Domains → Add Domain → email.elevatedpos.com.au) which shows
#      the exact record values — then mirrored here so they're tracked in
#      terraform.
#   3. DMARC — TXT at _dmarc.<sending subdomain> that tells inboxes what
#      policy to apply when a message fails SPF/DKIM. Start with p=none
#      (monitor only) and move to p=quarantine once a few weeks of Resend
#      reports come back clean.
#   4. MX — minimal MX so reply-to addresses don't bounce. Points at
#      Resend's inbound MX which accepts and drops (we don't process
#      replies yet).
#
# Variables below let us check the DKIM selectors into terraform without
# hardcoding per-environment keys. Populate via tfvars (not committed).
#
# Sender address (see k8s/configmap.yaml EMAIL_FROM):
#   ElevatedPOS <noreply@email.elevatedpos.com.au>
#
# After applying these records, run `dig TXT email.elevatedpos.com.au` and
# the three `dig CNAME <selector>._domainkey.email.elevatedpos.com.au`
# lookups — values should match Resend's dashboard. Resend's "Verify"
# button in their UI checks the same records.

variable "resend_dkim_selector_1" {
  description = "Resend-issued DKIM selector 1 for email.<domain> — get from Resend → Domains → <sending subdomain>"
  type        = string
  default     = ""
}

variable "resend_dkim_cname_1" {
  description = "Resend-issued DKIM CNAME target for selector 1 — looks like <hash>.dkim.amazonses.com"
  type        = string
  default     = ""
}

variable "resend_dkim_selector_2" {
  description = "Resend-issued DKIM selector 2"
  type        = string
  default     = ""
}

variable "resend_dkim_cname_2" {
  description = "Resend-issued DKIM CNAME target for selector 2"
  type        = string
  default     = ""
}

variable "resend_dkim_selector_3" {
  description = "Resend-issued DKIM selector 3"
  type        = string
  default     = ""
}

variable "resend_dkim_cname_3" {
  description = "Resend-issued DKIM CNAME target for selector 3"
  type        = string
  default     = ""
}

locals {
  # Skip the email records entirely if the DKIM selectors haven't been
  # filled in yet — terraform shouldn't create broken records. The
  # create/destroy step happens the first time someone runs `terraform
  # apply` after the Resend domain is verified.
  email_dns_enabled = (
    var.resend_dkim_selector_1 != "" &&
    var.resend_dkim_cname_1    != "" &&
    var.resend_dkim_selector_2 != "" &&
    var.resend_dkim_cname_2    != "" &&
    var.resend_dkim_selector_3 != "" &&
    var.resend_dkim_cname_3    != ""
  )
}

# SPF — TXT on email.<domain>. Resend uses Amazon SES for AU sending.
resource "aws_route53_record" "email_spf" {
  count   = local.email_dns_enabled ? 1 : 0
  zone_id = local.zone_id
  name    = "email.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [
    "v=spf1 include:amazonses.com ~all"
  ]
}

# DKIM selectors — three CNAMEs as issued by Resend.
resource "aws_route53_record" "email_dkim_1" {
  count   = local.email_dns_enabled ? 1 : 0
  zone_id = local.zone_id
  name    = "${var.resend_dkim_selector_1}._domainkey.email.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = [var.resend_dkim_cname_1]
}

resource "aws_route53_record" "email_dkim_2" {
  count   = local.email_dns_enabled ? 1 : 0
  zone_id = local.zone_id
  name    = "${var.resend_dkim_selector_2}._domainkey.email.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = [var.resend_dkim_cname_2]
}

resource "aws_route53_record" "email_dkim_3" {
  count   = local.email_dns_enabled ? 1 : 0
  zone_id = local.zone_id
  name    = "${var.resend_dkim_selector_3}._domainkey.email.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = [var.resend_dkim_cname_3]
}

# DMARC — monitor-only first. Bump to p=quarantine once Resend reports
# come back clean for ~2 weeks of production traffic.
resource "aws_route53_record" "email_dmarc" {
  count   = local.email_dns_enabled ? 1 : 0
  zone_id = local.zone_id
  name    = "_dmarc.email.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [
    "v=DMARC1; p=none; rua=mailto:dmarc@${var.domain_name}; ruf=mailto:dmarc@${var.domain_name}; fo=1; aspf=r; adkim=r"
  ]
}

# MX so replies to noreply@email.<domain> at least get routed somewhere
# (Resend's bounce handler). If you want real inbound mail routing later,
# swap this for your own inbound MX — until then this is a "drop quietly"
# endpoint.
resource "aws_route53_record" "email_mx" {
  count   = local.email_dns_enabled ? 1 : 0
  zone_id = local.zone_id
  name    = "email.${var.domain_name}"
  type    = "MX"
  ttl     = 600
  records = [
    "10 feedback-smtp.ap-southeast-2.amazonses.com"
  ]
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
