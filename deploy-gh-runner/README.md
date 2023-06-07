# deploy-gh-runner
This action is meant to spawn a runner for a single repository through the [Actions Runner Controller](https://github.com/actions/actions-runner-controller). It contacts directly your Kubernetes cluster in order to request a new `RunnerDeployment` resource creation.

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
    steps:
      - name: Create Runner
        id: create_runner
        uses: pagopa/pdnd-github-actions/deploy-gh-runner@version
        with:
          api_server: ${{ secrets.API_SERVER }}
          access_token: ${{ secrets.ACCESS_TOKEN }}
          base64_encoded_ca_crt: ${{ secrets.CA_CRT }}
          name: example-runner
          namespace: example-namespace
          image: example-image:latest
          service_account: example-service-account   
          docker_enabled: true
          image_pull_secret: example-pull-secret
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
| api_server | **required** | address of the public Kubernetes API Server.
| access_token | **required** | access token of the chosen Service Account used to spawn runners.
| base64_encoded_ca_crt | **required** | CA certificate used to contact safely the Kubernetes API Server.
| name | **required** | Runner base name. Used to generate the `runner_label` output, which uniquely identifies a runner.
| namespace | **optional**| Namespace where the runner should be created. Defaults to `default`.
| image | **optional** | Base image the runner will use to run the workflows. Defaults to `docker:dind`.
| image_pull_secret | **optional** | Image pull secret name inside Kubernetes. The secret must be in the same namespace where the runner is deployed
| service_account | **required** | Kubernetes ServiceAccount used to execute the runner.
| docker_enabled | **optional** | Flag to enable dockerd inside the runner to have Docker-in-Docker builds. Defaults to `false`.
| repository | **optional** | Repository the runner is deployed for. Can be customized in the form `your-org-or-username/your-repo`. Defaults to the current repository.