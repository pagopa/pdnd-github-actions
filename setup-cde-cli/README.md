# setup-cde-cli
This installs and configure the cloudera cde on the current runner

## Example
```yaml
    steps:
      - name: setup cdp cli
        uses: pagopa/pdnd-github-actions/setup-cde-cli@version
        with:
          access_key_id: "<>"
          private_key: "<>"
```
## Inputs
You can customize the following parameters:
| Parameter | Requirement | Description |
| --- | --- | --- |
| access_key_id | **required** | your user access key id
| private_key | **required** | your user private key