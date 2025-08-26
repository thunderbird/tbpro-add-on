
import os
import pulumi
import pulumi_aws as aws
import tb_pulumi
import tb_pulumi.network
import tb_pulumi.neon
import pulumi_neon as neon

from neon_api import NeonAPI

import boto3
import time

from pulumi_command import local


def enable_vpc_endpoint_private_dns(region, vpc_id):
    ec2_client = boto3.client('ec2', region_name)
    response = ec2_client.modify_vpc_endpoint(
        VpcEndpointId = vpc_id,
        PrivateDnsEnabled = True
    )


# neon SDK
# neon = NeonAPI(os.getenv("NEON_API_KEY", ""))
# print(neon.me())
# print(neon.projects())

from pulumi import ResourceOptions
from pulumi.dynamic import ResourceProvider, Resource, CreateResult
from typing import Any, Optional




# create dynamic resource provider

class NeonPrivateLinkProvider(ResourceProvider):
    def create(self, inputs):
        return CreateResult(id_="foo", outs={})

# create resource

class NeonPrivateLinkResource(Resource):
    def __init__(
        self,
        name: str,
        project: tb_pulumi.ThunderbirdPulumiProject,
        aws_region: str,
        neon_org_id: str,
        neon_project_id: str,
        neon_vpces: [],
        aws_vpc_id: str,
        aws_vpc_subnet_ids: [],
        aws_sg_ids: [],
        props: Any,
        opts: Optional[ResourceOptions] = None):
        super().__init__(
            NeonPrivateLinkProvider(),
            name,
            props,
            opts)
        
        # init boto3 ec2 client
        ec2_client = boto3.client('ec2', aws_region)

        def get_vpc_endpoint_status(ec2_client, vpc_endpoint_id):
            response = ec2_client.describe_vpc_endpoints(
                VpcEndpointIds=[vpc_endpoint_id]
            )
            return {
            "endpoint_state": response['VpcEndpoints'][0]['State'],
            "service_name": response['VpcEndpoints'][0]['ServiceName'],
            "dns_enabled": response['VpcEndpoints'][0]['PrivateDnsEnabled']
            }

        def is_available(ec2_client, vpc_endpoint_id):
            if get_vpc_endpoint_status(ec2_client, vpc_endpoint_id)['endpoint_state'] == 'available':
                return True
            return False

        def wait_available(client, vpc_endpoint_id):
            while not is_available(client, vpc_endpoint_id):
                print("Waiting for VPC availability")
                time.sleep(5)

        def is_dns_enabled(ec2_client, vpc_endpoint_id):
            if get_vpc_endpoint_status(ec2_client, vpc_endpoint_id)['dns_enabled']:
                return True
            return False

        def wait_dns_enabled(ec2_client, vpc_endpoint_id):
            print("Enabling DNS and waiting for it")
            enable_vpc_endpoint_dns(ec2_client, vpc_endpoint_id)
            while not is_dns_enabled(ec2_client, vpc_endpoint_id):
                time.sleep(5)

        def enable_vpc_endpoint_dns(ec2_client, vpc_endpoint__id):
            try:
                response = ec2_client.modify_vpc_endpoint(
                    VpcEndpointId = vpc_endpoint_id,
                    PrivateDnsEnabled = True
                )
                print("Private DNS Enabled on VPC Endpoint ")
                return response
            except ClientError as e:
                print("Unable to enable Private DNS on VPC Endpoint")
                return e

        count = 0

        for neon_vpce in neon_vpces:

            neon_vpc_assignment = tb_pulumi.neon.NeonVpcAssignment(
                name = f'{name}-neon-vpc-endpoint-assgnment-{count}',
                project = project,
                org_id = neon_org_id,
                region_id = f'aws-{aws_region}',
                vpc_endpoint_id = neon_vpce.id.apply(lambda id: f'{id}'),
                # opts=pulumi.ResourceOptions(depends_on=[neon_vpce])
            )


            # enable_vpce_dns = local.Command("enable-dns",
            #     create = ec2_client.modify_vpc_endpoint(
            #         VpcEndpointId =  aws_vpc_endpoint.id.apply( lambda id: f'{id}'),
            #         PrivateDnsEnabled = True
            #     ),
            #     opts=pulumi.ResourceOptions(depends_on=[aws_vpc_assignment])
            # )
            # pulumi.export("enable-dns", enable_vpce_dns.stdout)

            

            def _debug(id):
                pulumi.info(f'DEBUG -- id: {id}')
                return str(id)
            
            def _dns_enabled(id: str):
                return tb_pulumi.network.VpcEndpointPrivateDnsEnabled(
                    f'{name}-neon-vpc-endpoint-dns-enabled-{count}',
                    project = project,
                    vpc_endpoint_id = id,
                    # vpc_endpoint_id ="vpce-0cdccaabe03ede3f2",
                    private_dns_enabled = bool(True),
                    opts = pulumi.ResourceOptions(depends_on=[neon_vpc_assignment])
                )

            def _vpc_assignment(id: str):
                vpc_assignment =  tb_pulumi.neon.NeonVpcAssignment(
                    name = f'{name}-neon-vpc-endpoint-assgnment-{count}',
                    project = project,
                    org_id = neon_org_id,
                    region_id = f'aws-{aws_region}',
                    vpc_endpoint_id = neon_vpce.id.apply(lambda id: f'{id}'),
                )

                while not is_available(ec2_client, id):
                    print("Waiting for VPC availability")
                    time.sleep(5)

                return vpc_assignment
                # opts=pulumi.ResourceOptions(depends_on=[neon_vpce])
              

            dns_enabled = neon_vpce.id.apply(lambda id: (_vpc_assignment(id), _dns_enabled(id)))


            # neon_vpc_dns_enabled = tb_pulumi.network.VpcEndpointPrivateDnsEnabled(
            #     f'{name}-neon-vpc-endpoint-dns-enabled-{count}',
            #     project = project,
            #     vpc_endpoint_id = neon_vpce.id.apply(lambda id: _debug(id)),
            #     # vpc_endpoint_id ="vpce-0cdccaabe03ede3f2",
            #     private_dns_enabled = bool(True),
            #     opts = pulumi.ResourceOptions(depends_on=[neon_vpc_assignment])
            # )

            neon_vpc_endpoint_restriction = tb_pulumi.neon.NeonVpcEndpointRestriction(
                f'{name}-neon-vpc-endpoint-restriction-{count}',
                project = project,
                neon_project_id = neon_project_id,
                vpc_endpoint_id = neon_vpce.id.apply(lambda id: f'{id}'),
                opts = pulumi.ResourceOptions(depends_on=[neon_vpc_assignment])
            )

            count += 1
        # self.finish(
        #     resources = {
        #         vpcie
        #     }
        # )
