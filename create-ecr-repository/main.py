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

if tags == "":
    tags = []

if isinstance(tags, str):
    tags = ast.literal_eval(tags)

if isinstance(countNumber, str):
    countNumber = ast.literal_eval(countNumber)

if isinstance(tagPrefixList, str):
    tagPrefixList = ast.literal_eval(tagPrefixList)

client = boto3.client("ecr")

def str2bool(v):
    return v.lower() in ("true", "1")

def check_repository_exist(repositoryName):
    """Return True if ECR repo exists, False otherwise."""
    try:
        response = client.describe_repositories(
            repositoryNames=[repositoryName],
        )
        if len(response.get("repositories", [])) > 0:
            return True
        else:
            return False
    except client.exceptions.RepositoryNotFoundException:
        return False
    except Exception as e:
        print("Error checking repository existence: {e}")
        print(traceback.format_exc())
        return False

def create_ecr_repository(repositoryName, imageTagMutability, encryptionConfiguration={}, tags=[]):
    """Crea un repository ECR o ritorna quello esistente."""
    try:
        response = client.create_repository(
            repositoryName=repositoryName,
            tags=tags,
            imageTagMutability=imageTagMutability,
            encryptionConfiguration=encryptionConfiguration,
        )
        print("Created repository: {response['repository']['repositoryName']}")
        print("RepositoryUri: {response['repository']['repositoryUri']}")
        return response
    except client.exceptions.RepositoryAlreadyExistsException:
        print("Repository {repositoryName} already exists, skipping creation.")
        return client.describe_repositories(repositoryNames=[repositoryName])
    except Exception as e:
        print("Failed to create repository {repositoryName}: {e}")
        print(traceback.format_exc())
        raise

def lifecycle_policy(repositoryName, lifecyclePolicyText):
    """Apply lifecycle policy to ECR repo."""
    try:
        client.put_lifecycle_policy(
            repositoryName=repositoryName,
            lifecyclePolicyText=lifecyclePolicyText,
        )
        print("Applied lifecycle policy to {repositoryName}")
        return True
    except Exception:
        print("Failed to apply lifecycle policy for {repositoryName}")
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
                "countNumber": countNumber,
            },
            "action": {"type": "expire"},
        }
    ]
}

encryptionConfiguration = {"encryptionType": "KMS"}

print("Checking if repository '{repositoryName}' exists...")
if not check_repository_exist(repositoryName):
    ecr = create_ecr_repository(
        repositoryName=repositoryName,
        imageTagMutability=imageTagMutability,
        encryptionConfiguration=encryptionConfiguration,
        tags=tags,
    )
    lifecycle_policy(repositoryName, json.dumps(lifecyclePolicy))
else:
    print("Repository '{repositoryName}' already exists. Skipping creation.")
    lifecycle_policy(repositoryName, json.dumps(lifecyclePolicy))
