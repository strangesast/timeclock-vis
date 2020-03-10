from python:3.8
workdir /app
copy services/daemon/requirements.txt .
run pip install -r requirements.txt
copy services/daemon/ services/daemon/
copy services/util.py services/models.py ./services/
cmd ["python3.8", "-u", "-m", "services.daemon.main"]
