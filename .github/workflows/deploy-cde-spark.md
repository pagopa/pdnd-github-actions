# Deploy CDE Spark Workflow

This README outlines the deployment workflow for spark jobs in the CDE using a JSON deployment descriptor as input. 

The workflow maps the keys in the JSON under `job` and `resources` directly to CDE commands and options.

## Inputs
The parameter `config-json` must be a deployment descriptor with to the following structure:

```json
{
  "job": {
    // Job configuration details
    "name" : "my-job", //mandatory
    "application-file" : "main.py" //mandatory
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
  "venv": { //optional
    
    "file-name": "local_venv",
    "resource": "resource"
  },
  "job_default_args": true, //optional
  "base_dir": "some_dir" //mandatory
}
```
`vcluster-endpoint` : CDE vcluster to deploy on 
### Key Sections

- **Job**: Contains job configuration details such as the application file, job name (mandatory), and resource mounts. The `name` key is required for job creation.
- **Resources**: Details the resources needed for the job. There must be at least one resource that includes a `create` section and an `upload` section that contains the main entry point of the job.
- **Venv**: If present, specifies a Python virtual environment to build and pack locally.
- **Job Default Args**: If true, appends additional arguments for authentication.
- **Base Dir**: Specifies the base path for job-related files. (mandatory)

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
   cde job create --application-file="main.py" --name="job-name" --driver-cores=5 --mount-1-resource="some-resource"
   ```

### Handling Virtual Environments

If the `venv` key is present, the following actions will occur:

- Build and pack the virtual environment locally using **Poetry**.
- Upload the packed virtual environment to the specified resource.
- Instruct Spark to use the virtual environment with the following configurations:

```bash
--conf "spark.archives=local_venv.zip#local_venv" \
--conf "spark.pyspark.python=local_venv/bin/python"
```

**Note**: Ensure the `venv-pack2` library is included in your project dependencies, as only Poetry is supported for virtual environment management.

### Default Job Arguments

If `job_default_args` is set to `true`, the following arguments will be automatically appended to the job deployment command:

```bash
--arg="knox_config.gateway=${{ vars.KNOX_GATEWAY }}" \
--arg="knox_config.hostname=${{ vars.KNOX_GATEWAY }}"
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

cde job create --application-file="main.py" --name="job-name" --driver-cores=5 --mount-1-resource="some-resource"
```

## Conclusion

This deployment workflow automates the process of deploying spark jobs and resources in the CDE. Ensure that your JSON descriptor is correctly formatted, contains a mandatory job "name," and includes at least one "create" and "upload" resource with the main entry point of the job for a successful deployment. For further assistance, please refer to the CDE documentation.

## Full JSON Structure

Here is a sample of the full JSON structure withavailable keys: 
```json
{
  "job": {
    "alert-after-duration": "some string",
    "application-file": "some string",
    "arg": ["some string"],
    "class": "some string",
    "conf": ["some string"],
    "config": ["some string"],
    "cron-expression": "some string",
    "data-connector": ["some string"],
    "debug-driver": "some string",
    "debug-executor": "some string",
    "default-variable": ["some string"],
    "disable-role-proxy": "some string",
    "driver-cores": "some string",
    "driver-memory": "some string",
    "enable-analysis": "some string",
    "enable-gpu-acceleration": "some string",
    "every-days": "some string",
    "every-hours": "some string",
    "every-minutes": "some string",
    "every-months": "some string",
    "executor-cores": "some string",
    "executor-memory": "some string",
    "executor-node-selector": ["some string"],
    "executor-node-toleration": ["some string"],
    "file": ["some string"],
    "files": "some string",
    "jar": ["some string"],
    "jars": "some string",
    "log-level": "some string",
    "mail-to": ["some string"],
    "max-executors": "some string",
    "min-executors": "some string",
    "mount-N-prefix": "some string",
    "mount-N-resource": "some string",
    "name": "some string",
    "packages": "some string",
    "py-file": ["some string"],
    "py-files": "some string",
    "python-env-resource-name": "some string",
    "python-version": "some string",
    "repositories": "some string",
    "retention-policy": "some string",
    "role": "some string",
    "runtime-image-resource-name": "some string",
    "spark-name": "some string",
    "type": "some string",
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
    "resource": "some string"
  },
  "job_default_args": true,
  "base_dir": "myjob/src"
}
```
For full arguments details follow the cloudera documentation on the CDE command : [Docs](https://docs.cloudera.com/data-engineering/cloud/cli-access/topics/cde-cli-reference.html)