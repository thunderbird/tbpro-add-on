#!/bin/env python3

import tb_pulumi
import tb_pulumi.autoscale
import tb_pulumi.ci
import tb_pulumi.cloudfront
import tb_pulumi.cloudwatch
import tb_pulumi.fargate
import tb_pulumi.iam
import tb_pulumi.network
import tb_pulumi.secrets

from cloudfront import cloudfront
from fargate import fargate
from network import network


CLOUDFRONT_REWRITE_CODE_FILE = 'cloudfront-rewrite.js'
EXCLUDE_ROUTE53_STACKS = ['prod', 'stage']  # Do not build R53 records for these environments
INCLUDE_CLOUDFLARE_STACKS = ['prod', 'stage']  # Do build CloudFlare records for these environments

project = tb_pulumi.ThunderbirdPulumiProject()
resources = project.config.get('resources')

# Get zone IDs for DNS records
cloudflare_zone_id = (
    project.pulumi_config.require_secret('cloudflare_zone_id') if project.stack in INCLUDE_CLOUDFLARE_STACKS else None
)
route53_zone_id = (
    project.pulumi_config.require_secret('route53_zone_id') if project.stack not in EXCLUDE_ROUTE53_STACKS else None
)

# Copy select secrets from Pulumi into AWS Secrets Manager
pulumi_sm_opts = resources['tb:secrets:PulumiSecretsManager']['pulumi']
pulumi_sm = tb_pulumi.secrets.PulumiSecretsManager(
    name=f'{project.name_prefix}-secrets', project=project, **pulumi_sm_opts
)

# Build basic network components
sg_container, sg_lb, vpc = network(project, resources)

# Create an autoscaling Fargate cluster
autoscaler, backend_fargate, cloudflare_backend_record, route53_backend_record = fargate(
    project,
    resources,
    cloudflare_zone_id,
    EXCLUDE_ROUTE53_STACKS,
    INCLUDE_CLOUDFLARE_STACKS,
    pulumi_sm,
    route53_zone_id,
    sg_container,
    sg_lb,
    vpc,
)

# Create a CloudFront Distribution to serve the frontend
cf_func, cloudflare_frontend_record, frontend, response_headers_policy, route53_frontend_record = cloudfront(
    project,
    resources,
    backend_fargate,
    CLOUDFRONT_REWRITE_CODE_FILE,
    cloudflare_zone_id,
    resources.get('vars', {}).get('frontend-csp-header', ''),
    EXCLUDE_ROUTE53_STACKS,
    INCLUDE_CLOUDFLARE_STACKS,
    route53_zone_id,
)

# After all other resources are created, let's build the monitoring system
monitoring_opts = resources['tb:cloudwatch:CloudWatchMonitoringGroup']
monitoring = tb_pulumi.cloudwatch.CloudWatchMonitoringGroup(
    name=f'{project.name_prefix}-monitoring',
    project=project,
    notify_emails=monitoring_opts['notify_emails'],
    config=monitoring_opts,
)

# Set up an IAM user for automation purposes
auto_users_opts = resources.get('tb:ci:AwsAutomationUser', {})
for user, user_opts in auto_users_opts.items():
    tb_pulumi.ci.AwsAutomationUser(f'{project.name_prefix}-{user}', project=project, **user_opts)

# Set up IAM policies and groups to grant environment-bounded access to these resources
sap = tb_pulumi.iam.StackAccessPolicies(
    f'{project.name_prefix}-sap',
    project=project,
)
