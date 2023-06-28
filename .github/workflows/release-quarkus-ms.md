# quarkus-ms
This is a set of reusable workflows for releasing quarkus-based microservices.

There are two main worklows:
- build-analyze
- release

## build-analyze
The workflow is meant to be triggered on push on the main branch and whenever a pull request is opened and it will:
- create new runner
- build the application and check code with SonarCloud
- destroy runner

## release
This workflow is meant to be triggered manually whenever a new release of the microservice should be created. It will:
- create new runner
- create a new tag which name follows the semantic versioning by checking the commit messages (See [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/**))
- build the container image for the specified tag
- deploy the just built container image as Deployment in Kubernetes
- destroy runner

## deploy   todo
