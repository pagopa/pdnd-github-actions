# Validation deployment for microservices

`deploy-ms-validation.yml` and `rollback-ms-validation.yml` are reusable workflows,
following the `workflow_call` interface of `deploy-ms-production.yml`. They contain
no application-specific branch names, runner names or repository variables.
Application repositories own their triggers, branch policy and environment configuration.

## Deploy and approve

Example caller (replace `SHARED_WORKFLOW_SHA` with a published full commit SHA):

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
jobs:
  deploy:
    uses: pagopa/pdnd-github-actions/.github/workflows/deploy-ms-validation.yml@SHARED_WORKFLOW_SHA
    secrets: inherit
    with:
      codebuild-runner: codebuild-my-service-deploy-uat
      expected-cluster: my-uat-cluster
      environment: uat
      environment-values: uat
      base-branch: master
      validation-branch: staging
      hotfix-prefix: emergency/
      approval-environment: uat-review
      state-environment: uat-state
      artifact-name: uat-candidate
      source-workflow: .github/workflows/deploy-validation.yml
      ticket: ${{ inputs.ticket }}
```

`source-workflow` must match the **caller file**, not the shared file. Keep it
consistent in all candidate verification and rollback calls.

The workflow checks out the immutable event SHA, builds the service image, deploys
it by digest, and archives the chart and candidate manifest. Helm tests are not run;
functional verification is performed before approval.
A separate job requires functional approval through the configured GitHub Environment.
A missing explicit approval, an advanced source branch/base or a superseded deployment
rejects approval. Re-running an existing execution is rejected; dispatch a new candidate.

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
| `approval-environment` | `val-approval` |
| `state-environment` | `val-state` |
| `artifact-name` | `val-candidate` |
| `source-workflow` | `.github/workflows/deploy-ms-validation.yml` |
| `timeout` | `20m` for Helm deployment |
| `smoke-test-timeout` | Deprecated; accepted for compatibility and ignored |

Like the existing production workflow, this implementation expects the microservice
layout `.k8s/helm`, with a namespace in `values.yaml`, a chart named after the
application repository, and `image.repository`/`image.digest` in environment values.
The image repository is also named after the application repository.
The image registry uses the existing `PROD_AWS_ACCOUNT_ID` and `AWS_REGION` variables:
validation candidates are published there without creating a production release.
The Environment must define `EKS_CLUSTER` and `DEPLOY_ENVIRONMENT` (equal to
`environment-values`). Runner tooling and IAM permissions must be provisioned separately.

## Rollback

Call `rollback-ms-validation.yml` with the same environment and candidate policy,
plus `run-id` and `reason`. The run must be an approved, successful execution of
`source-workflow` with a non-expired artifact. The chart checksum is checked and
the archived values are applied; current source code is not rebuilt.

Deploy and rollback share `microservice-deploy-<environment>` concurrency within
each repository. This does not serialize different repositories or provide a FIFO
queue. `state-environment` records in-progress and successful deployments; an
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
| `approve` | Verify explicit review and the currently deployed execution |
| `policy` | Publish a required commit status on promotion PR heads |
| `release` | Check merged content matches the approved tree and return digest/SHA |
| `sync` | Open an idempotent PR from `base-branch` to `validation-branch` |

The action accepts `base-branch`, `validation-branch`, `hotfix-prefix`,
`approval-environment`, `state-environment`, `artifact-name` and `source-workflow`
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

Application callers own PR/push/workflow-run triggers and the required status
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
actionlint .github/workflows/deploy-ms-validation.yml .github/workflows/rollback-ms-validation.yml .github/workflows/prepare-prod-ms-release.yml
```

Tests cover the default policy and an independent configuration with different
base/candidate branches, approval/state environments, artifact/workflow names,
status, run-reference and release exceptions. Runtime IAM, TLS trust stores,
Environment protection and service health still require deployment-side verification.
