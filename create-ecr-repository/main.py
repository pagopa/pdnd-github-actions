import boto3
import os
import json
import ast
import traceback

tagStatus = os.getenv("INPUT_TAGSTATUS", default="tagged")
countType = os.getenv("INPUT_COUNTTYPE", default="imageCountMoreThan")
countNumber = os.getenv("INPUT_COUNTNUMBER", default=30)
repositoryName = os.environ["INPUT_REPOSITORYNAME"]
imageTagMutability = os.getenv("INPUT_IMAGETAGMUTABILITY", default="MUTABLE")
tags = os.getenv("INPUT_TAGS", default=[])
tagPrefixList = os.getenv("INPUT_TAGSPREFIX", default=["v"])

### Try validate variables
if tags == "":
    tags = []

if type(tags) == str:
    tags = ast.literal_eval(tags)

if type(countNumber) == str:
    countNumber = ast.literal_eval(countNumber)

if type(tagPrefixList) == str:
    tagPrefixList = ast.literal_eval(tagPrefixList)


client = boto3.client('ecr')

def str2bool(v):
  return v.lower() in ("true","1")

def create_ecr_repository(repositoryName, imageTagMutability , encryptionConfiguration={}, tags=[]):
    response = client.create_repository(
        repositoryName=repositoryName,
        tags=tags,
        imageTagMutability=imageTagMutability,
        encryptionConfiguration=encryptionConfiguration
    )
    return response

def check_repository_exist(repositoryName):
    try:
        response = client.describe_repositories(
        repositoryNames=[
            repositoryName,
        ],
    )
    except:
        return False
    if len(response['repositories']) > 0:
        return True


def lifecycle_policy(repositoryName, lifecyclePolicyText):
    try:
        response = client.put_lifecycle_policy(
            repositoryName=repositoryName,
            lifecyclePolicyText=lifecyclePolicyText
        )
        return True
    except:
        print(traceback.format_exc())
        return False

lifecyclePolicy = {
    "rules": [
        {
            "rulePriority": 10,
            "description": "Default lifecycle policy",
            "selection": {
                "tagStatus": tagStatus,
                "tagPrefixList": tagPrefixList,
                "countType": countType,
                "countNumber": countNumber
            },
            "action": {
                "type": "expire"
            }
        }
    ]
}




encryptionConfiguration = {
    'encryptionType': 'KMS'
}

if check_repository_exist(repositoryName=repositoryName) != True:

    ecr = create_ecr_repository(repositoryName=repositoryName, imageTagMutability=imageTagMutability,
                          encryptionConfiguration=encryptionConfiguration, tags=tags)
    print("Created repository: %s" % ecr['repository']['repositoryName'])
    print("RepositoryUri: %s" % ecr['repository']['repositoryUri'])
    lifecycle_policy(repositoryName, json.dumps(lifecyclePolicy))

