# deploy-airflow-dags
This action allows to deploy dags to Airflow instance.

## Inputs

|                  |              |                                |
|------------------|--------------|--------------------------------|
| project          | **required** | Name of the project            |
| version          | **required** | Release version of the project |
| airflow_api_url  | **required** | Airflow instance Api url       |
| airflow_username | **required** | Airflow instance username      |
| airflow_password | **required** | Airflow instance password      |

## Example usage
```
uses: ./.github/actions/deploy-airflow-dags
with:
  project: 'pdnd-pipeline-io-stats'
  version: v1.0.0
```