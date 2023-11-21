FROM ubuntu:22.04

ARG KUBECTL_VERSION=1.22.15

COPY entrypoint.sh /runner/entrypoint.sh

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    ca-certificates=20230311ubuntu0.22.04.1 \
    gnupg=2.2.27-3ubuntu2.1 \
    gettext-base=0.21-4ubuntu4
RUN curl -LO https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl && \
    curl -LO https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl.sha256
RUN echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check
RUN rm -f kubectl.sha256 && \
    mv kubectl /usr/local/bin && \
    chmod +x /usr/local/bin/kubectl && \ 
    chmod +x /runner/entrypoint.sh && \
    wget https://github.com/mikefarah/yq/releases/download/v4.34.1/yq_linux_amd64 && \
    mv yq_linux_amd64 /usr/local/bin/yq && \
    chmod +x /usr/local/bin/yq

ENTRYPOINT ["/runner/entrypoint.sh"]