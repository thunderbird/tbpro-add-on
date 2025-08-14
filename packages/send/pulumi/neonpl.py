
import os
import pulumi
import pulumi_aws as aws
import tb_pulumi
import pulumi_neon as neon

from neon_api import NeonAPI

import boto3

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
        neon_service_names: [],
        aws_vpc_id: str,
        aws_vpc_subnet_ids: [],
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

        def is_dns_enabled(ec2_client, vpc_endpoint_id):
            if get_vpc_endpoint_status(ec2_client, vpc_endpoint_id)['dns_enabled']:
                return True
            return False

        def enable_vpc_endpoint_dns(ec2_client, vpc_id):
            try:
                response = ec2_client.modify_vpc_endpoint(
                    VpcEndpointId = vpc_id,
                    PrivateDnsEnabled = True
                )
                print("Private DNS Enabled on VPC Endpoint ")
                return response
            except ClientError as e:
                print("Unable to enable Private DNS on VPC Endpoint")
                return e

        count = 0
        # print(aws_vpc_subnet_ids[count])
        for neon_service_name in neon_service_names:
            
            aws_vpc_endpoint = aws.ec2.VpcEndpoint(f'{name}-neon-pl-vpc-endpoint-{count}',
                service_name = neon_service_name,
                subnet_ids = [aws_vpc_subnet_ids[count]],
                vpc_endpoint_type = "Interface",
                vpc_id = aws_vpc_id,
                # private_dns_enabled=False,
                tags={
                    "Name": f"{project.name_prefix}-neon-private-link-endpoint-{count}",
                    "Project": project.name_prefix,
                    "Stack": project.stack,
                }
            )

            neon_vpc_assignment = neon.VpcEndpointAssignment(f'{name}-neon-vpc-endpoint-assgnment-{count}',
                org_id = neon_org_id,
                region_id = f'aws-{aws_region}',
                vpc_endpoint_id = aws_vpc_endpoint.id,
                label = name,
                opts=pulumi.ResourceOptions(depends_on=[aws_vpc_endpoint])
            )
            
            # wait for endpoint to become ready after neon assignment
            while not aws_vpc_endpoint.id.apply(lambda id: is_available(ec2_client, id)):

                print("Waiting for VPC Endpoint to be available...")
                time.sleep(5)

            # wait for DNS to be enabled and after endpoint available
            while not [
                aws_vpc_endpoint.id.apply(lambda id: is_dns_enabled(ec2_client, id)),
                aws_vpc_endpoint.id.apply(lambda id: is_available(ec2_client, id))
                ]:
                print("Enable DNS on VPC Endpoint")
                aws_vpc_endpoint.id.apply(lambda id: enable_vpc_endpoint_dns(ec2_client, id))
                print("Waiting for VPC Endpoint to be available...")
                time.sleep(5)

            neon_vpc_endpoint_restriction = neon.VpcEndpointRestriction(f'{name}-neon-vpc-endpoint-restriction-{count}',
                project_id = neon_project_id,
                vpc_endpoint_id = aws_vpc_endpoint.id,
                label = name,
                opts = pulumi.ResourceOptions(depends_on=[neon_vpc_assignment])
            )
            count += 1

    # def ec2_client(region):
    #     ec2_client = boto3.client('ec2', region)
    #     return ec2_client

    # def get_vpc_endpoint_service_status(ec2_client, service_id, vpc_endpoint_id):
    #     response = ec2_client.accept_vpc_endpoint_connections(
    #         ServiceId=[service_id],
    #         VpcEndpointIds=[vpc_endpoint_id]
    #     )

    # def enable_vpc_endpoint_dns(ec2_client, vpc_id):
    #     try:
    #         response = ec2_client.modify_vpc_endpoint(
    #             VpcEndpointId = vpc_id,
    #             PrivateDnsEnabled = True
    #         )
    #         print("Private DNS Enabled on VPC Endpoint ")
    #     except ClientError as e:
    #         print("Unable to enable Private DNS on VPC Endpoint")

