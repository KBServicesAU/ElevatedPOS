variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-southeast-2"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "domain_name" {
  description = "Primary domain for the platform"
  type        = string
  default     = "elevatedpos.com.au"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones to use"
  type        = list(string)
  default     = ["ap-southeast-2a", "ap-southeast-2b", "ap-southeast-2c"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

variable "eks_node_instance_types" {
  description = "EC2 instance types for EKS worker nodes"
  type        = list(string)
  default     = ["m6i.xlarge"]
}

variable "eks_node_min_size" {
  description = "Minimum number of EKS worker nodes"
  type        = number
  default     = 3
}

variable "eks_node_max_size" {
  description = "Maximum number of EKS worker nodes"
  type        = number
  default     = 20
}

variable "eks_node_desired_size" {
  description = "Desired number of EKS worker nodes"
  type        = number
  default     = 5
}

variable "eks_cluster_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.29"
}

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.r6g.large"
}

variable "db_instance_class" {
  description = "RDS instance class (alias for rds_instance_class)"
  type        = string
  default     = "db.t3.medium"
}

variable "rds_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 100
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB (alias for rds_allocated_storage)"
  type        = number
  default     = 50
}

variable "db_username" {
  description = "RDS master username"
  type        = string
  default     = "elevatedpos"
  sensitive   = true
}

variable "db_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.r6g.large"
}

variable "msk_instance_type" {
  description = "MSK broker instance type"
  type        = string
  default     = "kafka.m5.large"
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "elevatedpos"
}

variable "eks_node_instance_type" {
  description = "EKS worker node instance type (single value alias for eks_node_instance_types)"
  type        = string
  default     = "t3.medium"
}

variable "eks_node_desired_capacity" {
  description = "EKS desired node count (alias for eks_node_desired_size)"
  type        = number
  default     = 2
}

variable "eks_node_min_capacity" {
  description = "EKS minimum node count (alias for eks_node_min_size)"
  type        = number
  default     = 1
}

variable "eks_node_max_capacity" {
  description = "EKS maximum node count (alias for eks_node_max_size)"
  type        = number
  default     = 5
}
