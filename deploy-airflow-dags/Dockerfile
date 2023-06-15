FROM python:3.9-slim

COPY . /runner

RUN chmod +x /runner/entrypoint.sh && chmod +x /runner/deploy_dags.sh
RUN pip install -r /runner/requirements.txt

ENTRYPOINT [ "/runner/entrypoint.sh" ]