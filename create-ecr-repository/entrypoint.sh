#!/bin/sh -l

export repositoryName=$INPUT_REPOSITORYNAME
export imageTagMutability=$INPUT_IMAGETAGMUTABILITY
export tags=$INPUT_TAGS
export tagStatus=$INPUT_TAGSTATUS
export countType=$INPUT_COUNTTYPE
export countNumber=$INPUT_COUNTNUMBER
cat $AWS_WEB_IDENTITY_TOKEN > /tmp/eks-token
export AWS_WEB_IDENTITY_TOKEN_FILE=/tmp/eks-token
python /main.py