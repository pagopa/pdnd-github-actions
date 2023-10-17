# deploy-eks-gh-runner
This action is meant to spawn a runner for a single repository through the [Actions Runner Controller](https://github.com/actions/actions-runner-controller). It contacts directly your Kubernetes cluster in order to request a new `RunnerDeployment` resource creation.
In order to apply the runner in your eks cluster an AWS roles with `eks:DescribeCluster` permission is needed, the role must also be assumable by a the github public runner.

The purpose of this action is to avoid granting a service user the Admin rights on an entire organization and spawn self-hosted runners according to the build needs.

## Example
To run the action, you have to add a job like the following one in your GitHub Workflow:
```yaml
name: Example
on:
  push:
    branches:
      - main
jobs:
  create_runner:
    runs-on: ubuntu-latest
    # These permissions are needed to interact with GitHub's OIDC Token endpoint.
    permissions:
      id-token: write
      contents: read
    steps:
      - name: Create Runner
        id: create_runner
        uses: pagopa/pdnd-github-actions/deploy-eks-gh-runner@version
        with:
          cluster_name: pdnd-cicd
          aws_runner_deploy_role: gh-irsa-role
          aws_region: "eu-central-1"
          name: example-runner
          namespace: example-namespace
          image: example-image:latest
          service_account: example-service-account   
          docker_enabled: true
          image_pull_secret: example-pull-secret
          volume_claim: example-claim
          volume_mounth_path: /mnt/example
    outputs:
      runner_label: ${{ steps.create_runner.outputs.runner_label }}
  other_job:
    needs:
      - create_runner
    runs-on: [self-hosted, "${{ needs.create_runner.outputs.runner_label }}"]
    steps:
      - ...
```
Any following job that should be executed on the just spawned runner should indicate the create_runner job in its `needs` and use the relative context to retrieve the generated runner_label.

## Inputs
You can customize the following parameters:
| Parameter | Requirement | Description |
| --- | --- | --- |
| cluster_name | **required** | Name of your eks cluster to deploy the runners on.
| aws_runner_deploy_role | **required** | ARN of the aws role able to deploy the runner on eks,must have the `eks:DescribeCluster` permission and must be assumable by a github public runner .
| aws_region | **optional** | AWS region of the cluster
| name | **required** | Runner base name. Used to generate the `runner_label` output, which uniquely identifies a runner.
| namespace | **optional**| Namespace where the runner should be created. Defaults to `default`.
| image | **optional** | Base image the runner will use to run the workflows. Defaults to `docker:dind`.
| image_pull_secret | **optional** | Image pull secret name inside Kubernetes. The secret must be in the same namespace where the runner is deployed
| service_account | **required** | Kubernetes ServiceAccount used to execute the runner.
| docker_enabled | **optional** | Flag to enable dockerd inside the runner to have Docker-in-Docker builds. Defaults to `false`.
| repository | **optional** | Repository the runner is deployed for. Can be customized in the form `your-org-or-username/your-repo`. Defaults to the current repository.
| volume_claim | **optional** | Name of the Kubernetes PersistentVolumeClaim to mount on the runner.
| volume_mount_path | **optional** | Path where the volume should be mounted on the runner. Defaults to `/mnt`