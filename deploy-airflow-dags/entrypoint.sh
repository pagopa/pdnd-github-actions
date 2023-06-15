#!/usr/bin/env bash

set -euo pipefail
PROJECT=$1
VERSION=$2
export AIRFLOW_API_URL=$3
export AIRFLOW_USERNAME=$4
export AIRFLOW_PASSWORD=$5

DEPLOY_META_PATH=/runner/deploy_metadata.env
VERSIONED_DEPLOY=false
if echo $VERSION | grep -iq "\(test\|beta\|dev\)"; then
    VERSIONED_DEPLOY=true
fi
echo "VERSIONED_DEPLOY : $VERSIONED_DEPLOY"
echo "VERSION : $VERSION"
echo "VERSION=$VERSION" >> $DEPLOY_META_PATH
echo "PROJECT=$PROJECT" >> $DEPLOY_META_PATH
echo "VERSIONED_DEPLOY=$VERSIONED_DEPLOY" >> $DEPLOY_META_PATH

python3 /runner/airflow_deploy.py