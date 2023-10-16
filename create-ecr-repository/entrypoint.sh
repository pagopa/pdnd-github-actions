#!/bin/sh -l

export repositoryName=$INPUT_REPOSITORYNAME
export imageTagMutability=$INPUT_IMAGETAGMUTABILITY
export tags=$INPUT_TAGS
export tagStatus=$INPUT_TAGSTATUS
export countType=$INPUT_COUNTTYPE
export countNumber=$INPUT_COUNTNUMBER

if [ -n "$AWS_WEB_IDENTITY_TOKEN" ]; then
  echo $AWS_WEB_IDENTITY_TOKEN > /tmp/eks-token
  export AWS_WEB_IDENTITY_TOKEN_FILE=/tmp/eks-token
fi

python /main.py