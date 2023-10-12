#!/bin/sh -l

export repositoryName=$INPUT_REPOSITORYNAME
export imageTagMutability=$INPUT_IMAGETAGMUTABILITY
export scanOnPush=$INPUT_SCANONPUSH
export tags=$INPUT_TAGS
export tagStatus=$INPUT_TAGSTATUS
export countType=$INPUT_COUNTTYPE
export countNumber=$INPUT_COUNTNUMBER

python /main.py