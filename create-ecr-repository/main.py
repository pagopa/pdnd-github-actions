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

# Normalizzazione dei tipi
if tags == "":
    tags = []

if isinstance(tags, str):
    try:
        tags = ast.literal_eval(tags)
    except Exception:
        tags = []

if isinstance(countNumber, str):
    try:
        countNumber = ast.literal_eval(countNumber)
    except Exception:
        countNumber = 30

if isinstance(tagPrefixList, str):
    try:
        tagPrefixList = ast.literal_eval(tagPrefixList)
    except Exception:
        tagPrefixList = ["v"]

client = boto3.client("ecr")


def str2bool(v):
    return v.lower() in ("true", "1")


def check_repository_exist(repositoryName: str) -> bool:
    """Return True if ECR repo exists, False otherwise."""
    try:
        response = client.describe_repositories(repositoryNames=[repositoryName])
        exists = len(response.get("repositories", [])) > 0
        print(f"Repository '{repositoryName}' exists: {exists}")
        return exists
    except client.exceptions.RepositoryNotFoundException:
        print(f"Repository '{repositoryName}' not found.")
        return False
    except Exception as e:
        print(f"Error checking repository existence for '{repositoryName}': {e}")
        print(traceback.format_exc())
        return False


def create_ecr_repository(repositoryName, imageTagMutability, encryptionConfiguration={}, tags=[]):
    """Create an ECR repository or return the existing one."""
    try:
        response = client.create_repository(
            repositoryName=repositoryName,
            tags=tags,
            imageTagMutability=imageTagMutability,
            encryptionConfiguration=encryptionConfiguration,
        )
        print(f"Created repository: {response['repository']['repositoryName']}")
        print(f"RepositoryUri: {response['repository']['repositoryUri']}")
        return response
    except client.exceptions.RepositoryAlreadyExistsException:
        print(f"Repository '{repositoryName}' already exists, skipping creation.")
        return client.describe_repositories(repositoryNames=[repositoryName])
    except Exception as e:
        print(f"Failed to create repository '{repositoryName}': {e}")
        print(traceback.format_exc())
        raise


def lifecycle_policy(repositoryName, lifecyclePolicyText):
    """Apply lifecycle policy to ECR repo."""
    try:
        client.put_lifecycle_policy(
            repositoryName=repositoryName,
            lifecyclePolicyText=lifecyclePolicyText,
        )
        print(f"Applied lifecycle policy to '{repositoryName}'")
        return True
    except Exception as e:
        print(f"Failed to apply lifecycle policy for '{repositoryName}': {e}")
        print(traceback.format_exc())
        return False


# ------------------ MAIN EXECUTION ------------------

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

print(f"Checking if repository '{repositoryName}' exists...")

if not check_repository_exist(repositoryName):
    print(f"Creating repository '{repositoryName}'...")
    create_ecr_repository(
        repositoryName=repositoryName,
        imageTagMutability=imageTagMutability,
        encryptionConfiguration=encryptionConfiguration,
        tags=tags,
    )
else:
    print(f"Repository '{repositoryName}' already exists. Skipping creation.")

lifecycle_policy(repositoryName, json.dumps(lifecyclePolicy))