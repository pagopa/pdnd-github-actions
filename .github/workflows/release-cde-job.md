# Release CDE Job

This GitHub Actions workflow is designed to manage the release of a Cloudera Data Engineering (CDE) job.

## Inputs

- **manage-resource**: Decide whether to create or update a resource (default: `true`, type: `boolean`)
- **resource-name**: CDE Resource Name (required, type: `string`)
- **job-name**: CDE Job Name (required, type: `string`)
- **vcluster-endpoint**: Virtual Cluster Endpoint (required, type: `string`)
- **application-file**: Application file name (required, type: `string`)
- **files**: Additional files (type: `string`)
- **driver-cores**: Driver cores (type: `string`)
- **driver-memory**: Driver memory (type: `string`)
- **executor-cores**: Executor cores (type: `string`)
- **executor-memory**: Executor memory (type: `string`)
- **jars**: Jars (type: `string`)
- **packages**: Packages (type: `string`)
- **repositories**: Repositories (type: `string`)
- **additional-args**: Additional job arguments (type: `string`)
- **additional-conf**: Additional job configurations (type: `string`)
- **working-dir**: Working directory (required, type: `string`)

## Jobs

### Create Runner

Creates a GitHub Actions runner on an EKS cluster.

- **Runs-on**: `ubuntu-latest`
- **Steps**:
  - Create the runner using the `pagopa/pdnd-github-actions/deploy-eks-gh-runner` action.

### Login Poetry

Logs into Poetry and ECR for authentication.

- **Runs-on**: `self-hosted`
- **Steps**:
  - Obtain the authorization token for Poetry.
  - Obtain the login password for ECR.

### Build Env

Builds the virtual environment and creates the build artifact.

- **Runs-on**: `self-hosted`
- **Container**: Uses the specified Docker image.
- **Steps**:
  - Checkout the repository.
  - Build the project using Poetry.
  - Upload the build artifact.

### Release

Performs the semantic release of the project.

- **Runs-on**: `self-hosted`
- **Steps**:
  - Checkout the repository.
  - Perform the release using `python-semantic-release`.

### Deploy

Deploys the CDE job.

- **Runs-on**: `self-hosted`
- **Steps**:
  - Checkout the repository.
  - Download the build artifact.
  - Set up the CDE CLI.
  - Check and create the resource if it does not exist.
  - Upload the necessary resources.
  - Create or update the Spark job on CDE.
  - Send a Slack notification.

### Destroy Runner

Destroys the created runner.

- **Runs-on**: `ubuntu-latest`
- **Steps**:
  - Destroy the runner using the `pagopa/pdnd-github-actions/undeploy-eks-gh-runner` action.

## Outputs

- **runner_label**: Label of the created runner.
- **poetry_token**: Authorization token for Poetry.
- **docker_password**: Login password for ECR.
- **version**: Released version.