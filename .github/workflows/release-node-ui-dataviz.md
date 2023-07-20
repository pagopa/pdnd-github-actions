# release-node-ui-dataviz
A Github Actions reusable workflow for releasing NodeJs UI and Dataviz apps.

The workflow is meant to be triggered on push of new tags and it will:
- create new runner
- check tag version format:
    - `vx.x.x` for production
    - `vx.x.x-test`, `vx.x.x-beta`, `vx.x.x-dev` for test
- build the application with npm
- set S3 url for destination path
- set aws credentials
- sync build to S3 Bucket
- notify workflow outcome to Slack
- destroy runner

## Inputs

|        |   |                                                                      |
|--------|---|----------------------------------------------------------------------|
| s3_url |   | S3 url for destination path (format `s3://<bucket>/<project-name>/`) |

## Github Actions docs
- [Configure aws credentials](https://github.com/aws-actions/configure-aws-credentials#sample-iam-role-cloudformation-template)
- [Configuring openid connect in aws](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
