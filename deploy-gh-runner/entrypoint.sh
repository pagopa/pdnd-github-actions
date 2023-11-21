#!/bin/bash -l

API_SERVER=$1
ACCESS_TOKEN=$2
ENCODED_CA_CRT=$3
RUNNER_NAME=$4
export RUNNER_NAMESPACE=$5
export RUNNER_IMAGE=$6
export RUNNER_REPOSITORY=$7
export RUNNER_SERVICE_ACCOUNT=$8
export RUNNER_DOCKER_ENABLED="$9"
RUNNER_IMAGE_PULL_SECRET="${10:-null}"
RUNNER_VOLUME_CLAIM="${11:-null}"
RUNNER_VOLUME_MOUNT_PATH="${12:-/mnt}"

TIMESTAMP=$(date +%Y%m%d%H%M%S) 
export RUNNER_LABEL="$RUNNER_NAME-$TIMESTAMP"

TEMPLATE=$(envsubst < /runner/template.yaml)

if [[ "$RUNNER_IMAGE_PULL_SECRET" != "null" ]]; then
    TEMPLATE=$(echo "$TEMPLATE" | yq ".spec.template.spec.imagePullSecrets[0].name = \"$RUNNER_IMAGE_PULL_SECRET\"")
fi

if [[ "$RUNNER_VOLUME_CLAIM" != "null" ]]; then
    TEMPLATE=$(echo "$TEMPLATE" | yq ".spec.template.spec.volumes[0].name = \"$RUNNER_VOLUME_CLAIM\"")
    TEMPLATE=$(echo "$TEMPLATE" | yq ".spec.template.spec.volumes[0].persistentVolumeClaim.claimName = \"$RUNNER_VOLUME_CLAIM\"")
    TEMPLATE=$(echo "$TEMPLATE" | yq ".spec.template.spec.volumeMounts[0].name = \"$RUNNER_VOLUME_CLAIM\"")
    TEMPLATE=$(echo "$TEMPLATE" | yq ".spec.template.spec.volumeMounts[0].mountPath = \"$RUNNER_VOLUME_MOUNT_PATH\"")
fi

echo "$ENCODED_CA_CRT" | base64 -d > ca.crt
echo "$TEMPLATE" > runner.yaml
kubectl apply -f runner.yaml --server="$API_SERVER" --token="$ACCESS_TOKEN" --certificate-authority=./ca.crt

echo "runner_label=$RUNNER_LABEL" >> "${GITHUB_OUTPUT}"