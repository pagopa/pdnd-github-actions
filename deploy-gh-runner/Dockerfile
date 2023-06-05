FROM ubuntu:22.04

ARG KUBECTL_VERSION=1.22.15

COPY . /opt/runner
WORKDIR /opt/runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl=7.81.0-1ubuntu1.10 \
    ca-certificates=20230311ubuntu0.22.04.1 \
    gnupg=2.2.27-3ubuntu2.1
RUN curl -LO https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl
RUN curl -LO https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl.sha256
RUN echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check
RUN rm -f kubectl.sha256 && mv kubectl /usr/local/bin/ && chmod +x /usr/local/bin/kubectl