terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }

  backend "s3" {
    bucket         = "elevatedpos-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "ap-southeast-2"
    dynamodb_table = "elevatedpos-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "elevatedpos"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Explicit alias used by dns.tf for ACM certificate (ALB requires ap-southeast-2)
provider "aws" {
  alias  = "ap-southeast-2"
  region = "ap-southeast-2"

  default_tags {
    tags = {
      Project     = "elevatedpos"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
    }
  }
}

# ─── VPC ────────────────────────────────────────────────────────────────────

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "elevatedpos-${var.environment}"
  cidr = var.vpc_cidr

  azs             = var.availability_zones
  private_subnets = var.private_subnet_cidrs
  public_subnets  = var.public_subnet_cidrs

  enable_nat_gateway     = true
  single_nat_gateway     = var.environment != "prod"
  enable_vpn_gateway     = false
  enable_dns_hostnames   = true
  enable_dns_support     = true

  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }
}

# ─── EKS ────────────────────────────────────────────────────────────────────

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "elevatedpos-${var.environment}"
  cluster_version = "1.32"

  cluster_endpoint_public_access = true

  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.private_subnets

  eks_managed_node_groups = {
    general = {
      instance_types = var.eks_node_instance_types
      min_size       = var.eks_node_min_size
      max_size       = var.eks_node_max_size
      desired_size   = var.eks_node_desired_size

      labels = {
        role = "general"
      }
    }
  }

  enable_cluster_creator_admin_permissions = true
}

# ─── RDS PostgreSQL ─────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "elevatedpos" {
  name       = "elevatedpos-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "rds" {
  name        = "elevatedpos-rds-${var.environment}"
  description = "RDS PostgreSQL security group"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "elevatedpos" {
  identifier        = "elevatedpos-${var.environment}"
  engine            = "postgres"
  engine_version    = "16.6"
  instance_class    = var.rds_instance_class
  allocated_storage = var.rds_allocated_storage
  storage_encrypted = true

  db_name  = "elevatedpos"
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.elevatedpos.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az               = false
  publicly_accessible    = false
  deletion_protection    = false
  skip_final_snapshot    = true
  final_snapshot_identifier = null

  backup_retention_period = var.environment == "prod" ? 1 : 0
  backup_window           = "03:00-04:00"
  maintenance_window      = "Sun:04:00-Sun:05:00"

  performance_insights_enabled = true
}

# ─── ElastiCache Redis ───────────────────────────────────────────────────────

resource "aws_elasticache_subnet_group" "elevatedpos" {
  name       = "elevatedpos-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "redis" {
  name        = "elevatedpos-redis-${var.environment}"
  description = "ElastiCache Redis security group"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_elasticache_replication_group" "elevatedpos" {
  replication_group_id = "elevatedpos-${var.environment}"
  description          = "ElevatedPOS Redis cache"

  node_type            = var.redis_node_type
  num_cache_clusters   = var.environment == "prod" ? 2 : 1
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.elevatedpos.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  automatic_failover_enabled = var.environment == "prod"
}

# ─── MSK (Managed Kafka) ────────────────────────────────────────────────────

resource "aws_security_group" "msk" {
  name        = "elevatedpos-msk-${var.environment}"
  description = "MSK Kafka security group"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 9092
    to_port     = 9092
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  ingress {
    from_port   = 9094
    to_port     = 9094
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_msk_cluster" "elevatedpos" {
  cluster_name           = "elevatedpos-${var.environment}"
  kafka_version          = "3.5.1"
  number_of_broker_nodes = var.environment == "prod" ? 3 : 1

  broker_node_group_info {
    instance_type   = var.msk_instance_type
    client_subnets  = slice(module.vpc.private_subnets, 0, var.environment == "prod" ? 3 : 1)
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = 100
      }
    }
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  open_monitoring {
    prometheus {
      jmx_exporter {
        enabled_in_broker = true
      }
      node_exporter {
        enabled_in_broker = true
      }
    }
  }
}

# ─── ACM Certificate ─────────────────────────────────────────────────────────
# Defined in dns.tf as aws_acm_certificate.wildcard (includes DNS validation).
# Reference: aws_acm_certificate_validation.wildcard.certificate_arn

# ─── ECR Repositories ────────────────────────────────────────────────────────

locals {
  services = [
    "auth", "catalog", "inventory", "orders", "payments",
    "customers", "loyalty", "campaigns", "notifications",
    "integrations", "automations", "ai", "hardware-bridge",
    "franchise", "reporting", "webhooks",
    "web-backoffice", "kds-display",
  ]
}

resource "aws_ecr_repository" "services" {
  for_each = toset(local.services)

  name                 = "elevatedpos/${each.key}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "services" {
  for_each   = aws_ecr_repository.services
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 20 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 20
      }
      action = { type = "expire" }
    }]
  })
}

# ─── IAM ─────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "elevatedpos_service" {
  name = "elevatedpos-service-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRoleWithWebIdentity"
      Effect    = "Allow"
      Principal = { Federated = module.eks.oidc_provider_arn }
      Condition = {
        StringEquals = {
          "${module.eks.oidc_provider}:sub" = "system:serviceaccount:elevatedpos:elevatedpos-service"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "elevatedpos_service" {
  name = "elevatedpos-service-policy"
  role = aws_iam_role.elevatedpos_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
        ]
        Resource = [
          aws_s3_bucket.elevatedpos_assets.arn,
          "${aws_s3_bucket.elevatedpos_assets.arn}/*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail",
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:elevatedpos/*"
      },
    ]
  })
}

# ─── S3 (media / assets) ────────────────────────────────────────────────────

resource "aws_s3_bucket" "elevatedpos_assets" {
  bucket = "elevatedpos-assets-${var.environment}-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "elevatedpos_assets" {
  bucket = aws_s3_bucket.elevatedpos_assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "elevatedpos_assets" {
  bucket = aws_s3_bucket.elevatedpos_assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "elevatedpos_assets" {
  bucket                  = aws_s3_bucket.elevatedpos_assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ─── Data Sources ────────────────────────────────────────────────────────────

data "aws_caller_identity" "current" {}
