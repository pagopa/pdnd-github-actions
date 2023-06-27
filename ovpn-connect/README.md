# ovpn-connect
This action allows to connect to an OpenVPN server.

## Inputs

|                          |              |                                |
|--------------------------|--------------|--------------------------------|
| OVPN_USERNAME                  | **required** | OpenVPN username           |
| OVPN_CLIENT_KEY                  | **required** | OpenVPN client key |
| OVPN_TLS_AUTH_KEY          | **required** | OpenVPN TLS Authorization key      |
| CLIENT_FILE_LOCATION         | **optional** | Location of the OpenVPN client. Defaults to `.github/workflows/client.ovpn`      |

## Example usage
```yaml
uses: pagopa/pdnd-github-actions/ovpn-connect@vx.x.x
with:
  OVPN_USERNAME: ...
  OVPN_CLIENT_KEY: ...
  OVPN_TLS_AUTH_KEY: ...
  CLIENT_FILE_LOCATION: ...
```