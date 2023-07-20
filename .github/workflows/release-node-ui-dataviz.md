# release-node-ui-dataviz
A Github Actions reusable workflow for releasing NodeJs UI and Dataviz apps.

The workflow is meant to be triggered on push of new tags and it will:
- create new runner
- check tag version format:
    - `vx.x.x` for production
    - `vx.x.x-test`, `vx.x.x-beta`, `vx.x.x-dev` for test
- build the application with npm
- sync build to S3 Bucket
- notify workflow outcome to Slack
- destroy runner

## Inputs

|              |              |                                                                            |
|--------------|--------------|----------------------------------------------------------------------------|
| s3_bucket    | **required** | Destination S3 bucket  (`pdnd-prod-dl-1-dataviz` or `pdnd-prod-dl-1-apps`) |
| project      | **required** | Project name for destination S3 path                                       |
| build_folder | **required** | Output build folder (`dist` or `build`)                                    |

## Github Actions docs
- [Configure aws credentials](https://github.com/aws-actions/configure-aws-credentials#sample-iam-role-cloudformation-template)
- [Configuring openid connect in aws](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
