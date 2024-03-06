# setup-cdp-cli
This installs and configure the cloudera cdp version on the current runner

## Example
```yaml
    steps:
      - name: setup cdp cli
        uses: pagopa/pdnd-github-actions/setup-cdp-cli@version
        with:
          version: "0.9.107"
          access_key_id: "<>"
          private_key: "<>"
```
## Inputs
You can customize the following parameters:
| Parameter | Requirement | Description |
| --- | --- | --- |
| version | **required** | version of the cdp cli.
| access_key_id | **required** | your user access key id
| private_key | **required** | your user private key