#!/bin/bash
echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
docker-compose push
#docker push strangesast/timeclock-vis_server
#docker push strangesast/timeclock-vis_nginx
