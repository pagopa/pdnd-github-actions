# deploy-airflow-dags
This action allows to deploy dags to Airflow instance.

## Inputs

|                          |              |                                |
|--------------------------|--------------|--------------------------------|
| project                  | **required** | Name of the project            |
| version                  | **required** | Release version of the project |
| airflow_api_url          | **required** | Airflow instance Api url       |
| airflow_username         | **required** | Airflow instance username      |
| airflow_password         | **required** | Airflow instance password      |
| airflow_dags_path        | **required** | Airflow dags path              |
| airflow_dags_volume_path | **required** | Airflow dags volume mount path |

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