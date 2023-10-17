# aws-ecr-action
This is AWS ECR action to create repository if not exist. <br>

## Features:
 - Create repository in ECR
 - Set default lifecycle policy
 - For lifecycle policy can be selected all available rules


### Simple example usage
For auth in AWS must be used action 'Configure AWS Credentials For GitHub Actions' 
```yaml
      - name: Create AWS ECR repository
        uses: pagopa/pdnd-github-actions/aws-ecr-action@v1
        with:
          repositoryName: ${{ github.event.repository.name }}
          
```

### Available inputs:


| Name               | Values               | Default |
|--------------------|----------------------|---------|
| repositoryName     | You repository name  |         |
| imageTagMutability | MUTABLE or UNMUTABLE | MUTABLE |
| tags | List of tags | [] |
| tagStatus | tagged,untagged,any| any |
| countType | imageCountMoreThan or sinceImagePushed | imageCountMoreThan |
| countNumber| Number of images to keep | 30 | 



