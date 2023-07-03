
# Quarkus Microservices
This is a set of reusable workflows for releasing quarkus-based microservices.
There are three worklows:
- build-analyze-quarkus-ms
- release-quarkus-ms
- deploy-quarkus-ms


## build-analyze-quarkus-ms
The workflow is meant to be triggered on push on the main branch (only for java file or pom.xml) and whenever a pull request is opened/synchronize/reopened:
- create new runner
- build the application, testing and check code with SonarCloud
- destroy runner

----------------------------------------------------------------------------------------------------------------------
## release-quarkus-ms
This workflow is meant to be triggered manually whenever a new release of the microservice should be created. It will:
- create new runner
- create a new tag which name follows the semantic versioning by checking the commit messages (See [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/**))
- destroy runner

### Inputs

| Param    | Required | Default     |                                                                Descriprion                                                                 |
|:---------|---------|:-------------|:------------------------------------------------------------------------------------------------------------------------------------------:|
| native   | *YES*   | false        | Represents the generated tag (triggered by "release-quarkus-ms") <br/>"release-quarkus-ms" <br/>or branch and tag selected (triggered manually) |  

### Output

| Param        |            Descriprion             |
|:-------------|:----------------------------------:|
| release_tag  | Tag generated in the format vx.x.x |



## deploy-quarkus-ms
This workflow is meant to be triggered manually or by release-quarkus-ms workflows. It will:
- create new runner
- deploy the just built container image as Deployment in Kubernetes
- destroy runner

### Inputs

| Param    | Required | Default     |                                                                Descriprion                                                                 |
|:---------|---------|:-------------|:------------------------------------------------------------------------------------------------------------------------------------------:|
| native   | *YES*   | false        | Represents the generated tag (triggered by "release-quarkus-ms") <br/>"release-quarkus-ms" <br/>or branch and tag selected (triggered manually) |  
| ref_name | *YES*   | github.ref   |                                                                                                                                            |
