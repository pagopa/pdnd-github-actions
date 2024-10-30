# GitHub Action for Deploying Jobs on CDE

This GitHub Action automates the deployment of Airflow or Spark jobs on the CDE (Cloud Data Environment) when changes are pushed to the `main` branch. The workflow only considers new or modified files and does not automatically undeploy jobs if directories or deployment descriptors are deleted. Manual intervention is required for undeployment.

## Workflow Overview

### Trigger

- The workflow is triggered on any push to the `main` branch.

### Inputs

- `deploy-type`: Specify the type of job to deploy, either `airflow` or `spark`.

### Directory Structure

The workflow expects deployment descriptors to be stored in the following directory structure:

```
.github/workflows/config/(prod | dev)
```

### How It Works

1. **File Change Detection**:
   - The workflow detects changed files since the last GitHub tag.
   - It compares the paths of changed files with the `base_dir` configuration specified in the deployment descriptors.

2. **Deployment Marking**:
   - If the paths match, the corresponding configuration is marked as deployable.

3. **Deployment Call**:
   - Based on the `deploy-type` input, the workflow calls `deploy-cde-airflow` or `deploy-cde-spark` on every deployable configuration.

4. **Tagging and Releasing**:
   - If the deployment succeeds, a new GitHub tag and release are created.

### Important Note

- If any directories or deployment descriptors are deleted, the pipeline will be triggered but will not perform any deployment. Manual undeployment of jobs must be conducted.