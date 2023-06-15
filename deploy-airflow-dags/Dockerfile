FROM python:3.9-slim

COPY . /.

RUN chmod +x /entrypoint.sh && chmod +x /deploy_dags.sh 
RUN pip install -r requirements.txt

ENTRYPOINT [ "/entrypoint.sh" ]