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
          codeartifact_domain: "<>"
          codeartifact_domain_owner: 
          codeartifact_repository: "<>"

```
## Inputs
You can customize the following parameters:
| Parameter | Requirement | Description |
| --- | --- | --- |
| access_key_id | **required** | your user access key id
| private_key | **required** | your user private key