# deploy-airflow-dags
This action is a custom solution that allows to deploy dags to Airflow instance. <br>
Specifically:
- an essential prerequisite is a folder containing all the Python files that describe the Airflow dags inside the repo to be deployed
- the deploy consists in copying the Python files to a zip file shared on a Kubernetes volume claim
- the action does not use Airflow APIs for updating dags but only for internal checks, stopping and re-starting dags

## Inputs

|                          |              |                                                                    |
|--------------------------|--------------|--------------------------------------------------------------------|
| project                  | **required** | Name of the project                                                |
| version                  | **required** | Release version of the project                                     |
| airflow_api_url          | **required** | Airflow instance Api url                                           |
| airflow_username         | **required** | Airflow instance username                                          |
| airflow_password         | **required** | Airflow instance password                                          |
| airflow_dags_path        | **required** | Airflow dags path                                                  |
| airflow_dags_volume_path | **required** | Airflow dags volume mount path (`airflow-data` or `airflow-infra`) |

## Example usage
```
uses: pagopa/pdnd-github-actions/deploy-airflow-dags@vx.x.x
with:
  project: ...
  version: ...
  airflow_api_url: ...
  airflow_username: ...
  airflow_password: ...
  airflow_dags_path: ...
  airflow_dags_volume_path: ...
```