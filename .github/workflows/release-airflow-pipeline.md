# release-airflow-pipeline
A Github Actions reusable workflow for releasing etl pipeline using Airflow.

The workflow is meant to be triggered on push of new tags and it will:
- create new runner
- check tag version format:
    - `vx.x.x` for production
    - `vx.x.x-test`, `vx.x.x-beta`, `vx.x.x-dev` for test
- build the application with Docker and push image to registry
- deploy dags to Airflow instance
- notify workflow outcome to Slack
- destroy runner

For details about Airflow dags deploy Action see [deploy-airflow-dags](https://github.com/pagopa/pdnd-github-actions/blob/master/deploy-airflow-dags/README.md).

## Inputs

|                           |              |                                                                                                                                     |
|---------------------------|--------------|-------------------------------------------------------------------------------------------------------------------------------------|
| airflow_volume_claim      |              | Name of the Kubernetes PersistentVolumeClaim to mount on the runner for deploy to Airflow instance. Default is `airflow-dag-volume` |
| airflow_volume_mount_path |              | Path where the volume for deploy to Airflow instance should be mounted on the runner. Default is `/mnt/efs`                         |
| airflow_env               | **required** | Airflow env  (`data` or `infra`)                                                                                                    |
| run_docker_build          |              | A parameter for running or not Docker build. Default is `true`                                                                      |