# setup-cde-cli
This installs and configure the cloudera cde on the current runner

## Example
```yaml
    steps:
      - name: setup cdp cli
        uses: pagopa/pdnd-github-actions/setup-cde-cli@version
        with:
          version: "1.20.3"
          access_key_id: "<>"
          private_key: "<>"
          codeartifact_repository: "<>"
          vcluster_endpoint: "<>"

```
## Inputs
You can customize the following parameters:
| Parameter | Requirement | Description |
| --- | --- | --- |
| access_key_id | **required** | your user access key id
| private_key | **required** | your user private key
| codeartifact_domain | **required** | your codeartifact domain
| codeartifact_repository | **required** | your codeartifact repository
| vcluster-endpoint | **optional** | your vcluster-endpoint url