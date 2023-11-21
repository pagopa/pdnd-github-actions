# undeploy-eks-gh-runner
This action is meant to delete a GitHub Runner previously spawned through the `deploy-gh-runner` action. It contacts directly your Kubernetes cluster in order to request a new `RunnerDeployment` resource deletion.

In order to apply the runner in your eks cluster an AWS roles with `eks:DescribeCluster` permission is needed, the role must also be assumable by a the github public runner.

The purpose of this action is to remove the previously spawned self-hosted runner at the end of the workflow operations, allowing to free the previously allocated computing resources.

## Example
To run the action, you have to add a job like the following one in your GitHub Workflow:
```yaml
name: Build Analyze
on:
  push:
    branches:
      - main
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  create_runner:
    # See deploy-gh-runner for the creation code
  destroy_runner:
    runs-on: ubuntu-latest
    # These permissions are needed to interact with GitHub's OIDC Token endpoint.
    permissions:
      id-token: write
      contents: read
    if: ${{ always() && !contains(needs.create_runner.result, 'failure') }}
    needs:
      - create_runner
      - other_job
    steps:
      - name: Destroy Runner
        id: destroy_runner
        uses: pagopa/pdnd-github-actions/undeploy-eks-gh-runner@version
        with:
          cluster_name: pdnd-cicd
          aws_runner_deploy_role: gh-irsa-role
          aws_region: eu-central-1
          runner_label: ${{ needs.create_runner.outputs.runner_label }}
          namespace: example-namespace
```
To avoid missing the runners deletion in case of failures or cancellation, ensure you have included both the `create_runner` and any other job into the `needs` and ensure you have set the `if` clause like in the example. This will allow the job to delete the runner in any case except when the runner creation fails.

## Inputs
You can customize the following parameters:
| Parameter | Requirement | Description |
| --- | --- | --- |
| cluster_name | **required** | Name of your eks cluster to deploy the runners on.
| aws_runner_deploy_role | **required** | ARN of the aws role able to deploy the runner on eks,must have the `eks:DescribeCluster` permission and must be assumable by a github public runner .
| aws_region | **required** | AWS region of the cluster
| runner_label | **required** | Runner generated name. Must be retrieved from the runner creation job.
| namespace | **optional**| Namespace where the runner should be created. Defaults to `default`.