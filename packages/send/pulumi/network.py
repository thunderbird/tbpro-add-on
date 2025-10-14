import pulumi
import tb_pulumi


def network(project, resources):
    # Build the networking landscape
    vpc_opts = resources['tb:network:MultiCidrVpc']['vpc']
    vpc = tb_pulumi.network.MultiCidrVpc(name=f'{project.name_prefix}-vpc', project=project, **vpc_opts)

    # Build a security group allowing access to the load balancer
    sg_lb_opts = resources['tb:network:SecurityGroupWithRules']['backend-lb']
    sg_lb = tb_pulumi.network.SecurityGroupWithRules(
        name=f'{project.name_prefix}-backend-lb-sg',
        project=project,
        vpc_id=vpc.resources['vpc'].id,
        opts=pulumi.ResourceOptions(depends_on=[vpc]),
        **sg_lb_opts,
    )

    # Build a security group allowing access from the load balancer to the container when we know its ID
    sg_cont_opts = resources['tb:network:SecurityGroupWithRules']['backend-container']
    sg_cont_opts['rules']['ingress'][0]['source_security_group_id'] = sg_lb.resources['sg'].id
    sg_container = tb_pulumi.network.SecurityGroupWithRules(
        name=f'{project.name_prefix}-container-sg',
        project=project,
        vpc_id=vpc.resources['vpc'].id,
        opts=pulumi.ResourceOptions(depends_on=[sg_lb, vpc]),
        **sg_cont_opts,
    )

    return sg_container, sg_lb, vpc
