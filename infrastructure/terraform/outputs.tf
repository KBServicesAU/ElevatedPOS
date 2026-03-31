output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "EKS cluster API endpoint"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = aws_db_instance.elevatedpos.endpoint
  sensitive   = true
}

output "rds_port" {
  description = "RDS PostgreSQL port"
  value       = aws_db_instance.elevatedpos.port
}

output "rds_database_name" {
  description = "RDS database name"
  value       = aws_db_instance.elevatedpos.db_name
}

output "redis_primary_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = aws_elasticache_replication_group.elevatedpos.primary_endpoint_address
  sensitive   = true
}

output "msk_bootstrap_brokers_tls" {
  description = "MSK Kafka TLS bootstrap brokers"
  value       = aws_msk_cluster.elevatedpos.bootstrap_brokers_tls
  sensitive   = true
}

output "acm_certificate_arn" {
  description = "ACM certificate ARN"
  value       = aws_acm_certificate.elevatedpos.arn
}

output "s3_assets_bucket" {
  description = "S3 assets bucket name"
  value       = aws_s3_bucket.elevatedpos_assets.bucket
}

output "elevatedpos_service_role_arn" {
  description = "IAM role ARN for ElevatedPOS service pods"
  value       = aws_iam_role.elevatedpos_service.arn
}

output "ecr_repositories" {
  description = "ECR repository URLs for each service"
  value       = { for k, v in aws_ecr_repository.services : k => v.repository_url }
}
