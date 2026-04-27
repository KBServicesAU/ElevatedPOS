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
  provider    = aws.ap-southeast-2
  domain_name = var.domain_name
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
# v2.7.54 — corrected the DKIM record shape. The v2.7.43 version assumed
# Amazon-SES-style "3× CNAME with hash selectors" but Resend actually
# publishes a single TXT public key at `resend._domainkey.email.<domain>`
# (selector is the literal string `resend`). The other records below
# match the Resend dashboard's "DNS Records" page exactly:
#
#   Domain Verification:
#     • DKIM TXT  resend._domainkey.email           p=<base64 public key>
#   Enable Sending:
#     • SPF TXT   send.email                        v=spf1 include:amazonses.com ~all
#     • MX        send.email   priority 10          feedback-smtp.<region>.amazonses.com
#   DMARC (optional):
#     • TXT       _dmarc                            v=DMARC1; p=none;
#   Enable Receiving (optional):
#     • MX        email        priority 10          inbound-smtp.<region>.amazonaws.com
#
# Sender address (see k8s/configmap.yaml EMAIL_FROM):
#   ElevatedPOS <noreply@send.email.elevatedpos.com.au>
#
# After `terraform apply`, run these to confirm propagation:
#   dig TXT  resend._domainkey.email.elevatedpos.com.au +short
#   dig TXT  send.email.elevatedpos.com.au              +short
#   dig MX   send.email.elevatedpos.com.au              +short
#   dig MX   email.elevatedpos.com.au                   +short
# Resend's "Verify" button in the dashboard reads the same records.

variable "resend_dkim_public_key" {
  description = "Resend-issued DKIM public key (everything after `p=` in the TXT, no quotes)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "resend_aws_region" {
  description = "AWS region of the Resend SES backend (visible in the Resend dashboard MX values)."
  type        = string
  default     = "ap-southeast-2"
}

variable "resend_enable_inbound" {
  description = "Set true to also publish the inbound MX (email.<domain>). Optional — only needed if you process replies."
  type        = bool
  default     = false
}

locals {
  # Skip every Resend record if the DKIM key isn't set yet — terraform
  # shouldn't create broken DNS. Filling in `resend_dkim_public_key` in
  # terraform.tfvars (gitignored) flips this to true on the next apply.
  resend_dns_enabled = var.resend_dkim_public_key != ""
}

# DKIM — single TXT at resend._domainkey.email.<domain>
resource "aws_route53_record" "resend_dkim" {
  count   = local.resend_dns_enabled ? 1 : 0
  zone_id = local.zone_id
  name    = "resend._domainkey.email.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [
    "p=${var.resend_dkim_public_key}"
  ]
}

# SPF — TXT on send.email.<domain>
resource "aws_route53_record" "resend_spf" {
  count   = local.resend_dns_enabled ? 1 : 0
  zone_id = local.zone_id
  name    = "send.email.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [
    "v=spf1 include:amazonses.com ~all"
  ]
}

# Outbound MX — feedback-smtp for bounce processing
resource "aws_route53_record" "resend_send_mx" {
  count   = local.resend_dns_enabled ? 1 : 0
  zone_id = local.zone_id
  name    = "send.email.${var.domain_name}"
  type    = "MX"
  ttl     = 600
  records = [
    "10 feedback-smtp.${var.resend_aws_region}.amazonses.com"
  ]
}

# DMARC — monitor-only. Bump to p=quarantine once reports are clean.
resource "aws_route53_record" "resend_dmarc" {
  count   = local.resend_dns_enabled ? 1 : 0
  zone_id = local.zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [
    "v=DMARC1; p=none; rua=mailto:dmarc@${var.domain_name}; ruf=mailto:dmarc@${var.domain_name}; fo=1; aspf=r; adkim=r"
  ]
}

# Inbound MX — only when explicitly enabled. Routes replies to
# Resend's inbound endpoint (which can forward to a webhook).
resource "aws_route53_record" "resend_inbound_mx" {
  count   = local.resend_dns_enabled && var.resend_enable_inbound ? 1 : 0
  zone_id = local.zone_id
  name    = "email.${var.domain_name}"
  type    = "MX"
  ttl     = 600
  records = [
    "10 inbound-smtp.${var.resend_aws_region}.amazonaws.com"
  ]
}

# ── Stripe Connect "Pay" domain (pay.elevatedpos.com.au) ──────────────────────
#
# Stripe's hosted payment / Connect-branded pages are served from
# pay.<domain> when a Custom Domain is configured. The Stripe dashboard
# (Settings → Custom domains, or in some flows Connect → Branding → Domain)
# lists exactly nine records:
#
#   • TXT     pay                                  stripe-verification=<token>
#   • CNAME   <hash1>._domainkey.pay   →           <hash1>.dkim.custom-email-domain.stripe.com
#   • CNAME   <hash2>._domainkey.pay   →           <hash2>.dkim.custom-email-domain.stripe.com
#   • CNAME   <hash3>._domainkey.pay   →           <hash3>.dkim.custom-email-domain.stripe.com
#   • CNAME   <hash4>._domainkey.pay   →           <hash4>.dkim.custom-email-domain.stripe.com
#   • CNAME   <hash5>._domainkey.pay   →           <hash5>.dkim.custom-email-domain.stripe.com
#   • CNAME   <hash6>._domainkey.pay   →           <hash6>.dkim.custom-email-domain.stripe.com
#   • CNAME   bounce.pay               →           custom-email-domain.stripe.com
#   • TXT     _dmarc.pay                          (DMARC policy of your choice)
#
# Each `<hashN>` is a 32-char alphanumeric string Stripe generates per
# account. They appear in BOTH the record name (left column in the
# dashboard) and the value (right column). All six hashes go into the
# `stripe_pay_dkim_selectors` list variable below, in any order.
#
# After `terraform apply`, click "Try verifying now" in the Stripe
# dashboard. All nine rows should flip from Pending to Verified within
# a few minutes once DNS propagates.

variable "stripe_pay_verification_token" {
  description = "Stripe-issued domain verification token. From the dashboard: TXT 'pay' value, the part AFTER 'stripe-verification='."
  type        = string
  default     = ""
  sensitive   = true
}

variable "stripe_pay_dkim_selectors" {
  description = "Six DKIM selector hashes from the Stripe dashboard CNAME records. Each is 32 alphanumeric characters and appears in both the Name (<hash>._domainkey.pay) and the Value (<hash>.dkim.custom-email-domain.stripe.com) columns."
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.stripe_pay_dkim_selectors) == 0 || length(var.stripe_pay_dkim_selectors) == 6
    error_message = "stripe_pay_dkim_selectors must contain exactly 6 selectors (or be empty to skip the Stripe Pay records)."
  }
}

locals {
  # Both the verification token AND all 6 DKIM selectors must be set.
  # Half-configured DNS would let Stripe's verifier flap.
  stripe_pay_dns_enabled = (
    var.stripe_pay_verification_token != "" &&
    length(var.stripe_pay_dkim_selectors) == 6
  )
}

# Stripe domain verification TXT
resource "aws_route53_record" "stripe_pay_verification" {
  count   = local.stripe_pay_dns_enabled ? 1 : 0
  zone_id = local.zone_id
  name    = "pay.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [
    "stripe-verification=${var.stripe_pay_verification_token}"
  ]
}

# Stripe DKIM CNAMEs — one per selector
resource "aws_route53_record" "stripe_pay_dkim" {
  count   = local.stripe_pay_dns_enabled ? 6 : 0
  zone_id = local.zone_id
  name    = "${var.stripe_pay_dkim_selectors[count.index]}._domainkey.pay.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = [
    "${var.stripe_pay_dkim_selectors[count.index]}.dkim.custom-email-domain.stripe.com"
  ]
}

# Stripe bounce CNAME
resource "aws_route53_record" "stripe_pay_bounce" {
  count   = local.stripe_pay_dns_enabled ? 1 : 0
  zone_id = local.zone_id
  name    = "bounce.pay.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = [
    "custom-email-domain.stripe.com"
  ]
}

# DMARC for the pay subdomain — Stripe's UI accepts any policy you write.
# Mirror the email DMARC pattern (monitor first, tighten later).
resource "aws_route53_record" "stripe_pay_dmarc" {
  count   = local.stripe_pay_dns_enabled ? 1 : 0
  zone_id = local.zone_id
  name    = "_dmarc.pay.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [
    "v=DMARC1; p=none; rua=mailto:dmarc@${var.domain_name}"
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
