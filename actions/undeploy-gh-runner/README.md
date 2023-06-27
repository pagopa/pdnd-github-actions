# undeploy-gh-runner
This action is meant to delete a GitHub Runner previously spawned through the `deploy-gh-runner` action. It contacts directly your Kubernetes cluster in order to request a new `RunnerDeployment` resource deletion.

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
    if: ${{ always() && !contains(needs.create_runner.result, 'failure') }}
    needs:
      - create_runner
      - other_job
    steps:
      - name: Destroy Runner
        id: destroy_runner
        uses: pagopa/pdnd-github-actions/undeploy-gh-runner@version
        with:
          api_server: ${{ secrets.API_SERVER }}
          access_token: ${{ secrets.ACCESS_TOKEN }}
          base64_encoded_ca_crt: ${{ secrets.CA_CRT }}
          runner_label: ${{ needs.create_runner.outputs.runner_label }}
          namespace: example-namespace
```
To avoid missing the runners deletion in case of failures or cancellation, ensure you have included both the `create_runner` and any other job into the `needs` and ensure you have set the `if` clause like in the example. This will allow the job to delete the runner in any case except when the runner creation fails.

## Inputs
You can customize the following parameters:
| Parameter | Requirement | Description |
| --- | --- | --- |
| api_server | **required** | address of the public Kubernetes API Server.
| access_token | **required** | access token of the chosen Service Account used to spawn runners.
| base64_encoded_ca_crt | **required** | CA certificate used to contact safely the Kubernetes API Server.
| runner_label | **required** | Runner generated name. Must be retrieved from the runner creation job.
| namespace | **optional**| Namespace where the runner should be created. Defaults to `default`.