from python:3.8
workdir /app
copy services/ws/requirements.txt .
run pip install -r requirements.txt
copy services/ws/ services/ws/
copy services/util.py services/models.py ./services/
cmd ["gunicorn", "services.ws.main:main", "--bind", "0.0.0.0:80", "--worker-class", "aiohttp.GunicornWebWorker"]
