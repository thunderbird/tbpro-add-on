import pulumi
import pulumi_aws as aws
import pulumi_cloudflare as cloudflare
import tb_pulumi


def fargate(
    project,
    resources,
    cloudflare_zone_id,
    exclude_stacks,
    include_stacks,
    pulumi_sm,
    route53_zone_id,
    sg_container,
    sg_lb,
    vpc,
):
    autoscaler_opts = resources['tb:autoscale:EcsServiceAutoscaler']['backend']
    backend_fargate_opts = resources['tb:fargate:FargateClusterWithLogging']['backend']
    backend_subnets = [subnet for subnet in vpc.resources['subnets']]
    backend_fargate = tb_pulumi.fargate.FargateClusterWithLogging(
        name=f'{project.name_prefix}-fargate',
        project=project,
        subnets=backend_subnets,
        container_security_groups=[sg_container.resources['sg'].id],
        load_balancer_security_groups=[sg_lb.resources['sg'].id],
        opts=pulumi.ResourceOptions(
            depends_on=[
                *vpc.resources['subnets'],
                sg_container,
                sg_lb,
                pulumi_sm,
            ]
        ),
        **backend_fargate_opts,
    )
    autoscaler = tb_pulumi.autoscale.EcsServiceAutoscaler(
        f'{project.name_prefix}-autoscl-backend',
        project=project,
        service=backend_fargate.resources.get('service'),
        opts=pulumi.ResourceOptions(depends_on=[backend_fargate]),
        **autoscaler_opts,
    )

    # Sometimes create a DNS record pointing to the backend service
    route53_backend_record = (
        aws.route53.Record(
            f'{project.name_prefix}-dns-backend',
            zone_id=route53_zone_id,
            name=resources['domains']['backend'],
            type=aws.route53.RecordType.CNAME,
            ttl=60,  # ttl units are *seconds*
            records=[backend_fargate.resources['fargate_service_alb'].resources['albs']['send-suite'].dns_name],
            opts=pulumi.ResourceOptions(depends_on=[backend_fargate]),
        )
        if project.stack not in exclude_stacks
        else None
    )

    # Special case where prod DNS is hosted at CloudFlare
    cloudflare_backend_record = (
        cloudflare.Record(
            f'{project.name_prefix}-dns-backend',
            zone_id=cloudflare_zone_id,
            name=resources['domains']['backend'],
            type='CNAME',
            content=backend_fargate.resources['fargate_service_alb'].resources['albs']['send-suite'].dns_name,
            proxied=False,
            ttl=1,  # ttl units are *minutes*
        )
        if project.stack in include_stacks
        else None
    )

    return autoscaler, backend_fargate, cloudflare_backend_record, route53_backend_record
