# pdnd-github-actions

This repo contains both common Github Actions and reusable workflows used by the PDND.

## Usage
Ensure adding `pdnd-pagopa-github-bot` as admin of repos using common actions and reusable workflows in order to run on self-hosted runners.

## Github Actions docs
- [Self hosted runners](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners)
- [Actions](https://docs.github.com/en/actions)
- [Reusing workflows](https://docs.github.com/en/actions/using-workflows/reusing-workflows)

## Microservice validation

[Validation deployment and rollback](.github/workflows/deploy-ms-validation.md)
use generic reusable workflows and the `validation-candidate` action.
Application repositories supply their own branch, environment and promotion policy.
