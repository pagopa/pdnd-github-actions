#!/bin/sh -l

API_SERVER=$1
ACCESS_TOKEN=$2
ENCODED_CA_CRT=$3
RUNNER_LABEL=$4
RUNNER_NAMESPACE=$5

echo "$ENCODED_CA_CRT" | base64 -d > ca.crt

kubectl delete runnerdeployment $RUNNER_LABEL -n $RUNNER_NAMESPACE --server="$API_SERVER" --token="$ACCESS_TOKEN" --certificate-authority=./ca.crt