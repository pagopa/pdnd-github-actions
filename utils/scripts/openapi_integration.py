import sys
import getopt
import copy
import yaml

http_methods = ["get", "head", "options", "trace", "post", "put", "patch", "delete"]

def generate_apigw_integration(path_uri, path_parameters, api_version):
    base_integration_uri = "http://${stageVariables.NLBDomain}/${stageVariables.ServicePrefix}"
    if api_version != '':
        base_integration_uri += "/${stageVariables.ApiVersion}"

    request_integration = {
        "type":  "http_proxy",
        "httpMethod": "ANY",
        "passthroughBehavior": "when_no_match",
        "connectionId": "${stageVariables.VpcLinkId}",
        "connectionType": "VPC_LINK",
        "uri": f"{base_integration_uri}{path_uri}"
    }

    if len(path_parameters) > 0:
        path_integrations = dict()
        for param in path_parameters:
            path_integrations[f"integration.request.path.{param}"] = f"method.request.path.{param}"
        request_integration["requestParameters"] = path_integrations

    return request_integration

def integrate_path(path_uri, path_data, api_version):
    path_params = []

    # TODO: OpenAPI spec allows refs for parameters, but we don't support it at the moment
    if "parameters" in path_data:
        parameters = path_data["parameters"]
        path_params = [param["name"] for param in parameters if param["in"] == "path"]

    # TODO: OpenAPI spec allows refs for parameters, but we don't support it at the moment
    for method in path_data:
        if method not in http_methods: continue # ignore fields such as 'description'

        if "parameters" in path_data[method]:
            parameters = path_data[method]["parameters"]
            path_params = list(set(path_params + [param["name"] for param in parameters if param["in"] == "path"]))

        path_data[method]["x-amazon-apigateway-integration"] = generate_apigw_integration(path_uri, path_params, api_version)

    return path_data

def integrate_openapi(openapi, api_version):
    integrated_openapi = copy.deepcopy(openapi)

    for path in integrated_openapi["paths"]:
       integrated_openapi["paths"][path] = integrate_path(path, integrated_openapi["paths"][path], api_version)

    integrated_openapi["x-amazon-apigateway-binary-media-types"] = ["multipart/form-data"]

    return integrated_openapi


def main(argv):
    input_file = ''
    output_file = ''
    api_version = ''

    try:
        opts, args = getopt.getopt(argv,"hi:o:v:",["input=","output=","api-version="])
    except getopt.GetoptError:
        print('openapi_integration.py -i <input-file> -o <output-file> [-v <api-version>]')
        sys.exit(2)

    for opt, arg in opts:
        if opt == '-h':
            print('openapi_integration.py -i <input-file> -o <output-file> [-v <api-version>]')
            sys.exit()
        elif opt in ("-i", "--input"):
            input_file = arg
        elif opt in ("-o", "--output"):
            output_file = arg
        elif opt in ("-v", "--api-version"):
            api_version = arg

    if input_file == '' or output_file == '':
        print('openapi_integration.py -i <inputfile> -o <outputfile> [-v <api-version>]')
        sys.exit(2)

    integrated_openapi = None
    with open(input_file, mode="r", encoding="utf-8") as f:
        openapi = yaml.load(f, Loader=yaml.FullLoader)
        integrated_openapi = integrate_openapi(openapi, api_version)

    with open(output_file, mode="w", encoding="utf-8") as f:
        yaml.dump(integrated_openapi, f, sort_keys=False, encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
