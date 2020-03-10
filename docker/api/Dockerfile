from python:3.8
workdir /app
copy services/api/requirements.txt .
run pip install -r requirements.txt
copy services/api/ services/api/
copy services/util.py services/models.py ./services/
cmd ["gunicorn", "services.api.main:main", "--bind", "0.0.0.0:80", "--worker-class", "aiohttp.GunicornWebWorker"]
