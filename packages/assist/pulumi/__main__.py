#!/bin/env python3

import pulumi
import tb_pulumi
# import tb_pulumi.ec2  # Uncomment if you build a jumphost
import tb_pulumi.fargate
import tb_pulumi.network
import tb_pulumi.secrets


project = tb_pulumi.ThunderbirdPulumiProject()
resources = project.config.get('resources')

# Build the networking landscape
vpc_opts = resources['tb:network:MultiCidrVpc']['vpc']
vpc = tb_pulumi.network.MultiCidrVpc(f'{project.name_prefix}-vpc', project, **vpc_opts)

# Build firewall rules
sg_lb_opts = resources['tb:network:SecurityGroupWithRules']['backend-lb']
sg_lb = tb_pulumi.network.SecurityGroupWithRules(
    f'{project.name_prefix}-backend-lb-sg',
    project,
    vpc_id=vpc.resources['vpc'].id,
    **sg_lb_opts,
    opts=pulumi.ResourceOptions(depends_on=vpc),
)
sg_cont_opts = resources['tb:network:SecurityGroupWithRules']['backend-container']
sg_cont_opts['rules']['ingress'][0]['source_security_group_id'] = sg_lb.resources['sg'].id
sg_cont = tb_pulumi.network.SecurityGroupWithRules(
    f'{project.name_prefix}-backend-container-sg',
    project,
    vpc_id=vpc.resources['vpc'].id,
    **sg_cont_opts,
    opts=pulumi.ResourceOptions(depends_on=vpc),
)

# Copy select secrets from Pulumi into AWS Secrets Manager
pulumi_sm_opts = resources['tb:secrets:PulumiSecretsManager']['pulumi']
pulumi_sm = tb_pulumi.secrets.PulumiSecretsManager(
    f'{project.name_prefix}-secrets', project, **pulumi_sm_opts, opts=pulumi.ResourceOptions(depends_on=vpc)
)

# Create a Fargate cluster
backend_fargate_opts = resources['tb:fargate:FargateClusterWithLogging']['backend']
backend_fargate = tb_pulumi.fargate.FargateClusterWithLogging(
    f'{project.name_prefix}-fargate',
    project,
    [subnet for subnet in vpc.resources['subnets']],
    container_security_groups=[sg_cont.resources['sg']],
    load_balancer_security_groups=[sg_lb.resources['sg']],
    opts=pulumi.ResourceOptions(depends_on=[vpc, pulumi_sm]),
    **backend_fargate_opts,
)

# For testing purposes only, build an SSH-accessible server on the same network space
# jumphost_opts = resources['tb:ec2:SshableInstance']['jumphost']
# jumphost = tb_pulumi.ec2.SshableInstance(
#     name=f'{project.name_prefix}-jumphost',
#     project=project,
#     subnet_id=vpc.resources['subnets'][0],
#     vpc_id=vpc.resources['vpc'].id,
#     ami='ami-0d0f28110d16ee7d6',
#     opts=pulumi.ResourceOptions(depends_on=[vpc]),
#     **jumphost_opts,
# )
