from python

workdir /app
copy server/requirements.txt .
run pip install -r requirements.txt
copy server/ .

cmd ["python", "main.py"]
