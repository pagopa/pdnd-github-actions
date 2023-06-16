#!/usr/bin/env bash
source ./deploy_metadata.env
echo to version deploy : $VERSIONED_DEPLOY
 if [ "$VERSIONED_DEPLOY" = false ]
then
    ZIP_FILENAME=$PROJECT.zip
else
    ZIP_FILENAME=$PROJECT'_'$VERSION.zip
fi
cd $AIRFLOW_DAGS_PATH
touch __init__.py
echo "__version__='$VERSION'" > _version.py
echo "__project__='$PROJECT'" > _project.py
echo "__versioned__='$VERSIONED_DEPLOY'" > _is_versioned.py
zip  -r $ZIP_FILENAME *
ls /mnt/efs
cp $ZIP_FILENAME $AIRFLOW_DAGS_VOLUME_PATH