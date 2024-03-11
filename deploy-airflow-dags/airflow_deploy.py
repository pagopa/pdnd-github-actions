import subprocess
import requests
import os

def load_deploy_metadata() -> dict:
    with open("./deploy_metadata.env", 'r') as f:
       return dict(tuple(line.replace('\n', '').split('=')) for line
                in f.readlines() if not line.startswith('#'))
deploy_medatada = load_deploy_metadata()

credentials = { 
    "user":os.environ['AIRFLOW_USERNAME'],
    "password": os.environ['AIRFLOW_PASSWORD']
}
base_url=os.environ['AIRFLOW_API_URL']

project_name=deploy_medatada['PROJECT']

versioned_keywords = ['test','beta','dev']

def build_auth(credentials):
    return requests.auth.HTTPBasicAuth(username=credentials["user"], password=credentials["password"])

def include_dag(dag):
    dag_id = dag["dag_id"]
    tags = [x["name"].lower() for x in dag["tags"]]
    return dag_id.startswith(project_name + "-") and not any(k for k in versioned_keywords for tag in tags if k in tag) 

def detect_dags_to_deploy():
    print(f"loading dags relative to this project...")
    auth = build_auth(credentials)
    response = requests.get(base_url + f"/dags", auth=auth, verify=False)
    response.raise_for_status()
    json_res = response.json()
    actual_dags = list(filter(lambda dag: include_dag(dag), json_res["dags"]))
    return list(map(lambda dag: dag["dag_id"], actual_dags))


def dag_has_instance_in_status(dag_name, status , credentials):
    try:
        print(f"checking if there is a dag : {dag_name} instance in status : {status}...")
        auth = build_auth(credentials)
        params = {'order_by': '-end_date', 'limit': 1}
        response = requests.get(base_url + f"/dags/{dag_name}/dagRuns", auth=auth , params=params, verify=False)
        response.raise_for_status()
        runs = response.json()
        for run in runs['dag_runs']:
            if run["state"] == status:
                print(f"A {dag_name} instance is in status : {status}")
                return True
        print(f"No {dag_name} instance is in status : {status}")
        return False
    except Exception as e:
        raise ValueError(e)

def is_dag_in_pause(dag_name,  credentials):
    print(f"checking if {dag_name} is in pause...")
    response = requests.get( base_url + f"/dags/{dag_name}", auth=build_auth(credentials), verify=False)
    response.raise_for_status()
    dag = response.json()
    return dag["is_paused"] == True   

def change_dag_pause_state(dag_name, to_pause, credentials):
    response = requests.patch( base_url + f"/dags/{dag_name}",json={"is_paused" : to_pause},auth=build_auth(credentials), verify=False)
    response.raise_for_status()
    print(f"dag {dag_name} paused == {to_pause}")

def check_deployable_and_pause(dags):
    checked_and_paused = []
    try:
        for dag_name in dags:
            if not is_dag_in_pause(dag_name,credentials):
                print(f"{dag_name} is not in pause, putting it in before deploy...")
                change_dag_pause_state(dag_name,True,credentials)
                checked_and_paused.append(dag_name)
            if dag_has_instance_in_status(dag_name,"running",credentials):
                err_msg = f'instance of dag {dag_name} already running, please wait for termination and try to deploy again'
                raise ValueError(err_msg)
    except Exception as e:
        rollback_paused_dags(checked_and_paused)
        raise e
    return checked_and_paused

def rollback_paused_dags(paused):
    try:
        for paused in paused:
            print(f"restoring {paused} running status...")
            change_dag_pause_state(paused,False,credentials)
    except Exception as e:
        print("Failed to rollback paused dag, please check manually")
        raise ValueError(e)

def do_unversioned_deploy ():
    dags = detect_dags_to_deploy();
    print("detected dags to deploy : ")
    print(dags, sep = ", ")
    paused_dags = check_deployable_and_pause(dags)
    print("running deploy dags...")
    try:
        exec = subprocess.run(['./deploy_dags.sh'], stdout=subprocess.PIPE, stderr=subprocess.PIPE,text=True)
        exec.check_returncode()
        print(exec.stdout.strip("\n"))
    except subprocess.CalledProcessError as e:
        print ( "Error:\nreturn code: ", e.returncode, "\nOutput: ", e.stderr)
    finally:
        rollback_paused_dags(paused_dags)
    print("deploy end")

def do_versioned_deploy():
    try:
        exec = subprocess.run(['./deploy_dags.sh'], stdout=subprocess.PIPE, stderr=subprocess.PIPE,text=True)
        exec.check_returncode()
        print(exec.stdout.strip("\n"))
    except subprocess.CalledProcessError as e:
        print ( "Error:\nreturn code: ", e.returncode, "\nOutput: ", e.stderr)

if deploy_medatada["VERSIONED_DEPLOY"] == "true":
    do_versioned_deploy()
else:
    do_unversioned_deploy()