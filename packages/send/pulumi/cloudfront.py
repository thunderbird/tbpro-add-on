import pulumi
import pulumi_aws as aws
import pulumi_cloudflare as cloudflare
import tb_pulumi

from tb_pulumi.constants import (
    CLOUDFRONT_CACHE_POLICY_ID_DISABLED,
    CLOUDFRONT_CACHE_POLICY_ID_OPTIMIZED,
    CLOUDFRONT_ORIGIN_REQUEST_POLICY_ID_ALLVIEWER,
)


def cloudfront(
    project,
    resources,
    backend_fargate,
    cloudfront_rewrite_code_file,
    cloudflare_zone_id,
    content_security_policy,
    exclude_stacks,
    include_stacks,
    route53_zone_id,
):
    # Manage the CloudFront rewrite function; the code is managed in cloudfront-rewrite.js
    rewrite_code = None
    try:
        with open(cloudfront_rewrite_code_file, 'r') as fh:
            rewrite_code = fh.read()
    except IOError:
        pulumi.error(f'Could not read file {cloudfront_rewrite_code_file}')

    cf_func = aws.cloudfront.Function(
        f'{project.name_prefix}-func-rewrite',
        code=rewrite_code,
        comment='Rewrites inbound requests to direct them to the send-suite backend API',
        name=f'{project.name_prefix}-rewrite',
        publish=True,
        runtime='cloudfront-js-2.0',
    )
    project.resources['cf_rewrite_function'] = cf_func

    # Use appropriate cross-origin headers
    response_headers_policy = aws.cloudfront.ResponseHeadersPolicy(
        f'{project.name_prefix}-frontend-rhp',
        comment=f'Response headers policy for {project.name_prefix}',
        custom_headers_config={
            'items': [
                {'header': 'Cross-Origin-Embedder-Policy', 'override': True, 'value': 'require-corp'},
                {'header': 'Cross-Origin-Opener-Policy', 'override': True, 'value': 'same-origin'},
                {'header': 'Cross-Origin-Resource-Policy', 'override': True, 'value': 'same-origin'},
            ]
        },
        security_headers_config={
            'content_security_policy': {
                'content_security_policy': content_security_policy,
                'override': True,
            }
        },
    )

    # Set up the default cache behavior: serving preferably cached static content from S3
    frontend_opts = resources['tb:cloudfront:CloudFrontS3Service']['frontend']
    if 'distribution' not in frontend_opts:
        frontend_opts['distribution'] = {}
    if 'default_cache_behavior' not in frontend_opts['distribution']:
        frontend_opts['distribution']['default_cache_behavior'] = {}
    frontend_opts['distribution']['default_cache_behavior'].update(
        {
            'allowed_methods': ['GET', 'HEAD'],
            'cached_methods': ['GET', 'HEAD'],
            'target_origin_id': f's3-{frontend_opts["service_bucket_name"]}',
            'cache_policy_id': CLOUDFRONT_CACHE_POLICY_ID_OPTIMIZED,
            'function_associations': [{'event_type': 'viewer-request', 'function_arn': cf_func.arn}],
            'response_headers_policy_id': response_headers_policy.id,
            'viewer_protocol_policy': 'redirect-to-https',
        }
    )
    frontend_opts['distribution']['default_cache_behavior']['response_headers_policy_id'] = response_headers_policy.id

    # Set up the frontend service itself
    frontend = tb_pulumi.cloudfront.CloudFrontS3Service(
        name=f'{project.name_prefix}-frontend',
        project=project,
        default_function_associations=[{'event_type': 'viewer-request', 'function_arn': cf_func.arn}],
        **frontend_opts,
        opts=pulumi.ResourceOptions(depends_on=[cf_func]),
    )

    # Sometimes create a DNS record pointing to the frontend service
    route53_frontend_record = (
        aws.route53.Record(
            f'{project.name_prefix}-dns-frontend',
            zone_id=route53_zone_id,
            name=resources['domains']['frontend'],
            type=aws.route53.RecordType.CNAME,
            ttl=60,  # ttl units are *seconds*
            records=[frontend.resources['cloudfront_distribution'].domain_name],
            opts=pulumi.ResourceOptions(depends_on=[frontend.resources['cloudfront_distribution']]),
        )
        if project.stack not in exclude_stacks
        else None
    )

    # Special case where prod DNS is hosted at CloudFlare
    cloudflare_frontend_record = (
        cloudflare.Record(
            f'{project.name_prefix}-dns-frontend',
            zone_id=cloudflare_zone_id,
            name=resources['domains']['frontend'],
            type='CNAME',
            content=frontend.resources['cloudfront_distribution'].domain_name,
            proxied=False,
            ttl=1,  # ttl units are *minutes*
        )
        if project.stack in include_stacks
        else None
    )

    return cf_func, cloudflare_frontend_record, frontend, response_headers_policy, route53_frontend_record
