# Validation deployment for microservices

`prepare-ms-validation.yml`, `deploy-ms-validation.yml` and `rollback-ms-validation.yml` are reusable workflows,
following the `workflow_call` interface of `deploy-ms-production.yml`. They contain
no application-specific branch names, runner names or repository variables.
Application repositories own their triggers, branch policy and environment configuration.

## Promote, deploy and approve

On merge of a pull request into the validation branch, call
`prepare-ms-validation.yml`. The caller must use the `pull_request: closed`
event and run only for merged PRs. The workflow checks for a successful DEV
build on the PR head, pulls `pr-<number>` from DEV ECR, and pushes it to the
PROD account ECR with tag `val-<merge-commit-sha>`. It uses the promotion runner,
which requires cross-account DEV ECR pull and target ECR push access. It does
not build an image or deploy to the cluster.

The manual deployment selects the validation branch at that same merge commit;
its image is resolved from the `val-<commit-sha>` tag in the target registry.
A PR excluded by the DEV workflow's path filters has no DEV build and cannot be
promoted by this workflow. A newer validation-branch commit requires its own
successful promotion. Hotfix branch deployments likewise require an image tag
promoted for that exact commit; the default promotion caller only handles merges
into the validation branch.

Example promotion caller (replace `SHARED_WORKFLOW_SHA` with a published full commit SHA):

```yaml
name: VAL | Promote DEV image
on:
  pull_request:
    types: [closed]
    branches: [validation]
permissions:
  contents: read
  actions: read
  pull-requests: read
jobs:
  promote:
    if: github.event.pull_request.merged == true
    uses: pagopa/pdnd-github-actions/.github/workflows/prepare-ms-validation.yml@SHARED_WORKFLOW_SHA
    secrets: inherit
    with:
      validation-branch: validation
      codebuild-runner: codebuild-my-service-promote-prod
```

Example deployment caller (replace `SHARED_WORKFLOW_SHA` with a published full commit SHA):

```yaml
name: Deploy validation candidate
on:
  workflow_dispatch:
    inputs:
      ticket:
        type: string
        required: false
permissions:
  contents: read
  actions: read
  deployments: write
  pull-requests: read
  statuses: write
jobs:
  deploy:
    uses: pagopa/pdnd-github-actions/.github/workflows/deploy-ms-validation.yml@SHARED_WORKFLOW_SHA
    secrets: inherit
    with:
      codebuild-runner: codebuild-my-service-deploy-uat
      expected-cluster: my-uat-cluster
      environment: uat
      environment-values: uat
      base-branch: main
      validation-branch: validation
      hotfix-prefix: ""
      status-context: my-service/promotion-policy
      artifact-name: uat-candidate
      source-workflow: .github/workflows/deploy-validation.yml
      ticket: ${{ inputs.ticket }}
```

`source-workflow` must match the **caller file**, not the shared file. Keep it
consistent in all candidate verification and rollback calls.

The deployment workflow checks out the selected SHA, resolves the previously
promoted image in ECR, deploys it by digest, and archives the chart and candidate
manifest. The chart is packaged at deploy time; it is not published by the
promotion workflow. Helm tests are not run; functional verification is performed
before approval.
A reviewer approves the promotion pull request after testing, with `VAL-Run: <id>`
in the review comment as well as in the PR description. The policy requires an
authorized reviewer other than the PR author, the exact candidate commit and run,
and a review submitted after that run completed. A superseded deployment or an
advanced source branch/base rejects promotion. Re-running an existing execution is rejected; dispatch a new candidate.

| Input | Default / requirement |
| --- | --- |
| `codebuild-runner` | Required CodeBuild runner project name |
| `expected-cluster` | Required; must match the Environment's `EKS_CLUSTER` |
| `ticket` | Optional test session or issue reference (deploy only) |
| `companion` | Optional free-text versions of companion services (deploy only) |
| `environment` | `val` |
| `environment-values` | `val`; selects `.k8s/helm/env-values/<value>.yaml` |
| `base-branch` | `main` |
| `validation-branch` | `validation` |
| `hotfix-prefix` | `hotfix/`; empty disables hotfix candidates |
| `status-context` | `validation/promotion-policy`; status invalidated before deploy/rollback |
| `artifact-name` | `val-candidate` |
| `source-workflow` | `.github/workflows/deploy-ms-validation.yml` |
| `timeout` | `20m` for Helm deployment |
| `smoke-test-timeout` | Deprecated; accepted for compatibility and ignored |

Like the existing production workflow, this implementation expects the microservice
layout `.k8s/helm`, with a namespace in `values.yaml`, a chart named after the
application repository, and `image.repository`/`image.digest` in environment values.
The image repository is also named after the application repository.
The image registry uses the existing `PROD_AWS_ACCOUNT_ID` and `AWS_REGION` variables:
validation images are promoted there without creating a production release.
The Environment must define `EKS_CLUSTER` and `DEPLOY_ENVIRONMENT` (equal to
`environment-values`). Runner tooling and IAM permissions must be provisioned separately.

## Rollback

Call `rollback-ms-validation.yml` with the same environment and candidate policy,
plus `run-id` and `reason`. The run must be an approved, successful execution of
`source-workflow` with a non-expired artifact. The chart checksum is checked and
the archived values are applied; current source code is not rebuilt.

Deploy and rollback share `microservice-deploy-<environment>` concurrency within
each repository. This does not serialize different repositories or provide a FIFO
queue. The chosen deployment environment records in-progress and successful deployments; an
incomplete deployment prevents approval until a controlled redeploy or rollback.
Artifacts are retained for 90 days, subject to organization limits. Retain matching
images in ECR. Rollback does not restore external secrets or database changes.

## Generic candidate action

`validation-candidate/action.yml` implements the reusable checks used by these
workflows and by application-side promotion/synchronization callers:

| `mode` | Operation |
| --- | --- |
| `candidate` | Resolve approved artifact provenance, SHA and image digest |
| `record` | Record `in_progress` or `success` for a candidate deployment |
| `policy` | Publish a required commit status on promotion PR heads |
| `release` | Check merged content matches the approved tree and return digest/SHA |
| `sync` | Open an idempotent PR from `base-branch` to `validation-branch` |

The action accepts `base-branch`, `validation-branch`, `hotfix-prefix`,
`deployment-environment`, `artifact-name` and `source-workflow`
with the same defaults as the workflows. Additionally:

- `token`: required repository-scoped token, with permissions appropriate to the mode.
- `run-reference`: PR body field, default `VAL-Run` (for example `VAL-Run: 123456`).
- `status-context`: required status name, default `validation/promotion-policy`.
- `release-bot-login`: authorized release PR author; empty disables the exception.
- `release-branch-prefix`: default `release-please--`; empty disables the exception.
- `release-files`: JSON array of exact allowed release-metadata paths, defaulting
  to the files used by `prepare-prod-ms-release.yml`. Renames are rejected.
- `run-id`: candidate workflow run ID in `candidate` mode.
- `candidate-file` and `deployment-state`: manifest path and state in `record` mode.

Outputs are `digest`, `source-sha` and `run-id`. Applications pass the first two to
`prepare-prod-ms-release.yml` as `validated-image-digest` and `validated-source-sha`,
with `update-validation-values: false`. The legacy DEV-to-PROD promotion remains
available when these inputs are omitted.

Application callers own PR/pull-request-review/push/workflow-run triggers and the required status
configuration. A privileged `pull_request_target` caller must never execute PR
code; call this action at a trusted immutable revision. Configure reviewers,
strict branch protections, workflow ownership and Environment branch restrictions.
The release-bot exception checks both author identity and exact changed paths;
a branch prefix alone cannot bypass validation.

## Publication and verification

Development branch references are temporary. Publish the generic action first
(commit A), pin its calls in the shared workflows to A, then publish the workflows
(commit B). Application callers pin the action to A and workflows to B.

```sh
node --test tests/validation-candidate.test.cjs
actionlint .github/workflows/prepare-ms-validation.yml .github/workflows/deploy-ms-validation.yml .github/workflows/rollback-ms-validation.yml .github/workflows/prepare-prod-ms-release.yml
```

Tests cover the default policy and an independent configuration with different
base/candidate branches, deployment environments, artifact/workflow names,
status, run-reference and release exceptions. Runtime IAM, TLS trust stores,
Environment protection and service health still require deployment-side verification.
