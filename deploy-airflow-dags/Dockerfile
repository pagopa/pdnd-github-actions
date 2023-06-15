FROM python:3.9-slim

COPY . /runner

RUN apt-get update && apt-get install --no-install-recommends zip
RUN chmod +x /runner/entrypoint.sh && chmod +x /runner/deploy_dags.sh
RUN pip install -r /runner/requirements.txt

ENTRYPOINT [ "/runner/entrypoint.sh" ]