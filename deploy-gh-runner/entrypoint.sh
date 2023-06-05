#!/bin/sh -l

API_SERVER=$1
ACCESS_TOKEN=$2
ENCODED_CA_CRT=$3
RUNNER_NAME=$4
export RUNNER_NAMESPACE=$5
export RUNNER_IMAGE=$6
export RUNNER_REPOSITORY=$7
export RUNNER_SERVICE_ACCOUNT=$8
export RUNNER_DOCKER_ENABLED="$9"
export RUNNER_IMAGE_PULL_SECRET="${10}"

TIMESTAMP=$(date +%Y%m%d%H%M%S) 
export RUNNER_LABEL="$RUNNER_NAME-$TIMESTAMP"

TEMPLATE=$(envsubst < /runner/template.yaml)

if ! [[ -z "$RUNNER_IMAGE_PULL_SECRET" ]]; then
    TEMPLATE=$(echo "$TEMPLATE" | yq ".spec.template.spec.imagePullSecrets[0].name = \"$RUNNER_IMAGE_PULL_SECRET\"")
fi

echo "$ENCODED_CA_CRT" | base64 -d > ca.crt
echo "$TEMPLATE" > runner.yaml
kubectl apply -f runner.yaml --server="$API_SERVER" --token="$ACCESS_TOKEN" --certificate-authority=./ca.crt

echo "runner_label=$RUNNER_LABEL" >> "${GITHUB_OUTPUT}"