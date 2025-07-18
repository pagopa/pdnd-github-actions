# GitHub Action for Releasing Job Tags

This GitHub Action automates the release of new tag version of jobs when changes are pushed to the `main` branch.

## Workflow Overview

### Trigger

- The workflow is triggered on any push to the `main` branch.

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

3. **Tagging and Releasing**:
   - A new GitHub tag and release are created.

### Important Note

- If any directories or deployment descriptors are deleted, the pipeline will be triggered but will not perform any deployment. Manual undeployment of jobs must be conducted.