# Deploy CDE Airflow Workflow

This README outlines the deployment workflow for airflow jobs in the CDE using a JSON deployment descriptor as input. 

The workflow maps the keys in the JSON under `job` and `resources` directly to CDE commands and options.

## Inputs
The parameter `config-json` must be a deployment descriptor with to the following structure:

```json
{
  "job": {
    // Job configuration details
    "name" : "my-job", //mandatory
    "dag-file" : "main.py", //mandatory
    "mount-1-resource" : "some-resource"
  },
  "resources": [
    {
      "create": {
        // Resource creation details

        "type": "files",
        "name": "some-resource"
      },
      "upload": [
        // Resource upload details
        //mandatory at least one containing the application file
        {
          "local-path": "path",
          "name": "some-resource"
        }
      ]
    }
  ],
  "owner": "sample_user", //mandatory
  "base_dir": "dags/sample/sample_dag", //mandatory
}
```
`vcluster-endpoint` : CDE vcluster to deploy on 
### Key Sections

- **Job**: Contains job configuration details such as the application file, job name (mandatory), and resource mounts. The `name` key is required for job creation.
- **Resources**: Details the resources needed for the job. There must be at least one resource that includes a `create` section and an `upload` section that contains the main entry point of the job.
- **Base Dir**: Specifies the base path for job-related files. (mandatory)
- **Owner**: The user that deploy this job (mandatory). `${{ vars.CLOUDERA_BOT_USERS_SECRET_NAME }}` must be present in the repo to get CDE cretentials of owner  

## Deployment Steps

1. **Resource Creation**:
   For each resource specified in the `resources` array, the following command checks if the resource exists, and if not, creates it:

   ```bash
   if ! cde resource describe --name some-resource >/dev/null 2>&1; then
       cde resource create --type="files" --name="some-resource"
   fi
   ```

2. **Resource Upload**:
   Each upload within a resource is executed with:

   ```bash
   cde resource upload --local-path="path" --name="some-resource" --resource-path="other-path"
   ```

3. **Job Deployment**:
   The job is deployed with the following command structure based on the keys in the "job" section:

   ```bash
   cde job create --dag-file="main.py" --name="job-name" --driver-cores=5 --mount-1-resource="some-resource" --type="airflow"
   ```

### Directory Structure

The `base_dir` specifies the base path for job files in the repository. All paths in the deployment descriptor are relative to this base directory.

**Important**: The base directory must not end with a `/`.

### Example Command Execution

Given the following JSON:

```json
{
  "resources": [
    {
      "create": {
        "type": "files",
        "name": "some-resource"
      },
      "upload": [
        {
          "local-path": "path",
          "name": "some-resource",
          "resource-path": "other-path"
        }
      ]
    }
  ],
  "job": {
    "application-file": "main.py",
    "name": "job-name",
    "driver-cores": 5,
    "mount-1-resource": "some-resource"
  }
}
```

The following commands will be executed:

```bash
if ! cde resource describe --name some-resource >/dev/null 2>&1; then
    cde resource create --type="files" --name="some-resource"
fi

cde resource upload --local-path="path" --name="some-resource" --resource-path="other-path"

cde job create --dag-file="main.py" --name="job-name" --mount-1-resource="some-resource"
```

## Conclusion

This deployment workflow automates the process of deploying spark jobs and resources in the CDE. Ensure that your JSON descriptor is correctly formatted, contains a mandatory job "name," and includes at least one "create" and "upload" resource with the main entry point of the job for a successful deployment. For further assistance, please refer to the CDE documentation.

## Full JSON Structure

Here is a sample of the full JSON structure withavailable keys: 
```json
{
  "job": {
    "airflow-file-mount-N-prefix": "some string",
    "airflow-file-mount-N-resource": "some string",
    "alert-after-duration": "some string",
    "catchup": "some string",
    "config-json": "some string",
    "config-json-file": "some string",
    "cron-expression": "some string",
    "dag-file": "some string",
    "data-connector": ["some string"],
    "default-variable": ["some string"],
    "depends-on-past": "some string",
    "disable-role-proxy": "some string",
    "email-on-failure": "some string",
    "email-on-sla-miss": "some string",
    "every-days": "some string",
    "every-hours": "some string",
    "every-minutes": "some string",
    "every-months": "some string",
    "executor-node-selector": ["some string"],
    "executor-node-toleration": ["some string"],
    "for-days-of-month": "some string",
    "for-days-of-week": "some string",
    "for-hours-of-day": "some string",
    "for-minutes-of-hour": "some string",
    "for-months-of-year": "some string",
    "log-level": "some string",
    "mail-to": ["some string"],
    "mount-N-prefix": "some string",
    "mount-N-resource": "some string",
    "name": "some string",
    "retention-policy": "some string",
    "role": "some string",
    "runtime-image-resource-name": "some string",
    "schedule-enabled": "some string",
    "schedule-end": "some string",
    "schedule-paused": "some string",
    "schedule-start": "some string",
    "workload-credential": ["some string"]
  },
  "resources": [
    {
      "create": {
        "extra-pip-repository-N-cert": "some string",
        "extra-pip-repository-N-cred": "some string",
        "extra-pip-repository-N-skip-cert-validation": "some string",
        "extra-pip-repository-N-url": "some string",
        "help": "some string",
        "image": "some string",
        "image-credential": "some string",
        "image-engine": "some string",
        "name": "some string",
        "pip-repository-cert": "some string",
        "pip-repository-cred": "some string",
        "pip-repository-skip-cert-validation": "some string",
        "pip-repository-url": "some string",
        "pypi-mirror": "some string",
        "python-version": "some string",
        "retention-policy": "some string",
        "type": "some string"
      },
      "upload": [
        {
          "local-path": ["some string"],
          "name": "some string",
          "resource-path": "some string"
        }
      ]
    }
  ],
  "venv": {
    "file-name": "local_venv",
    "resource": "ingestion"
  },
  "job_default_args": true,
  "base_dir": "ingestion"
}

```
For full arguments details follow the cloudera documentation on the CDE command : [Docs](https://docs.cloudera.com/data-engineering/cloud/cli-access/topics/cde-cli-reference.html). 